import { Construct } from 'constructs';
import { Resource } from 'cdktf';
import {
  PocketEventBridgeProps,
  PocketEventBridgeRuleWithMultipleTargets,
  ApplicationEventBus,
  PocketEventBridgeTargets,
} from '@pocket-tools/terraform-modules';
import { config } from '../../config';
import { iam, sns, sqs } from '@cdktf/provider-aws';
import { eventConfig } from './eventConfig';

/**
 * Purpose:
 *
 * The purpose of this rule set is to send ML-generated prospects to two
 * separate systems:
 *
 * 1. A pre-existing production SQS queue that is consumed by a lambda which
 * feeds those prospects to the curation admin tool.
 *
 * 2. The dev instance of this event bridge, which will in turn send the
 * prospects to the dev SQS queue to be consumed by the dev lambda and sent
 * to the dev curation admin tool :D
 *
 * Note that this class behaves differently based on the environment to which
 * it was deployed!
 */
export class ProspectEvents extends Resource {
  public readonly snsTopic: sns.SnsTopic;
  public readonly sqs: sqs.DataAwsSqsQueue;
  public readonly sqsDlq: sqs.DataAwsSqsQueue;

  constructor(
    scope: Construct,
    private name: string,
    private sharedEventBus: ApplicationEventBus
  ) {
    super(scope, name);

    // pre-existing queues (prod and dev) created by prospect-api
    this.sqs = new sqs.DataAwsSqsQueue(
      this,
      `prospect-${config.environment}-queue`,
      {
        name: `ProspectAPI-${config.environment}-Sqs-Translation-Queue`,
      }
    );

    this.sqsDlq = new sqs.DataAwsSqsQueue(
      this,
      `prospect-${config.environment}-dlq`,
      {
        name: `ProspectAPI-${config.environment}-Sqs-Translation-Queue-Deadletter`,
      }
    );

    this.snsTopic = new sns.SnsTopic(this, 'prospect-event-topic', {
      name: `${config.prefix}-ProspectEventTopic`,
    });

    this.createProspectEventRules();
    this.createPolicyForEventBridgeToSqs();

    this.createDismissProspectEventRule();
    this.createPolicyForEventBridgeToSns();

    // TODO: create a policy function for dev event bridge
    // this.createPolicyForEventBridgeToDevEventBridge();
  }

  /**
   * Create an event bridge rule and attach to the configured targets.
   * @private
   */
  private createProspectEventRules() {
    // both prod and dev have an sqs target
    const targets: PocketEventBridgeTargets[] = [
      {
        arn: this.sqs.arn,
        deadLetterArn: this.sqsDlq.arn,
        targetId: `${config.prefix}-Prospect-Event-SQS-Target`,
      },
    ];

    // only prod also targets the dev event bridge
    if (!config.isDev) {
      // https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-cross-account.html
      // note that permissions have been added by hand to the dev event bus to
      // allow it to receive events from the prod bus.
      targets.push({
        arn: 'arn:aws:events:us-east-1:410318598490:event-bus/PocketEventBridge-Dev-Shared-Event-Bus',
        targetId: `${config.prefix}-Prospect-Event-Dev-Event-Bridget-Target`,
      });
    }

    const prospectEventRuleProps: PocketEventBridgeProps = {
      eventRule: {
        name: `${config.prefix}-ProspectEvents-Rule`,
        eventPattern: {
          source: [eventConfig.source],
          'detail-type': eventConfig.detailType,
        },
        eventBusName: this.sharedEventBus.bus.name,
      },
      targets,
    };

    new PocketEventBridgeRuleWithMultipleTargets(
      this,
      `${config.prefix}-Prospect-Prod-EventBridge-Rule`,
      prospectEventRuleProps
    );
  }

  //TODO: add comments
  private createDismissProspectEventRule() {
    const targets: PocketEventBridgeTargets[] = [
      {
        arn: this.snsTopic.arn,
        deadLetterArn: this.sqsDlq.arn, //using the same DLQ for all prospect events
        targetId: `${config.prefix}-Prospect-Event-SNS-Target`,
        terraformResource: this.snsTopic,
      },
    ];

    const prospectEventRuleProps: PocketEventBridgeProps = {
      eventRule: {
        name: `${config.prefix}-ProspectEvents-Rule`,
        eventPattern: {
          source: [eventConfig.dismissProspect.source],
          'detail-type': eventConfig.dismissProspect.detailType,
        },
        eventBusName: this.sharedEventBus.bus.name,
      },
      targets,
    };

    new PocketEventBridgeRuleWithMultipleTargets(
      this,
      `${config.prefix}-Dismiss-Prospect-Prod-EventBridge-Rule`,
      prospectEventRuleProps
    );
  }

  //TODO: add comments
  private createPolicyForEventBridgeToSns() {
    const eventBridgeSnsPolicy = new iam.DataAwsIamPolicyDocument(
      this,
      `${config.prefix}-EventBridge-SNS-Policy`,
      {
        statement: [
          {
            effect: 'Allow',
            actions: ['sns:Publish'],
            resources: [this.snsTopic.arn],
            principals: [
              {
                identifiers: ['events.amazonaws.com'],
                type: 'Service',
              },
            ],
          },
        ],
      }
    ).json;

    return new sns.SnsTopicPolicy(this, 'prospect-events-sns-topic-policy', {
      arn: this.snsTopic.arn,
      policy: eventBridgeSnsPolicy,
    });
  }

  private createPolicyForEventBridgeToSqs() {
    const eventBridgeSqsPolicy = new iam.DataAwsIamPolicyDocument(
      this,
      `${config.prefix}-EventBridge-Prospect-Event-SQS-Policy`,
      {
        statement: [
          {
            effect: 'Allow',
            actions: ['sqs:SendMessage'],
            resources: [this.sqs.arn],
            principals: [
              {
                identifiers: ['events.amazonaws.com'],
                type: 'Service',
              },
            ],
          },
        ],
      }
    ).json;

    new sqs.SqsQueuePolicy(this, 'prospect-events-sqs-policy', {
      policy: eventBridgeSqsPolicy,
      queueUrl: this.sqs.url,
    });
  }
}
