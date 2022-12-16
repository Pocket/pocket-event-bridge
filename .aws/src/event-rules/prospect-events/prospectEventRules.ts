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
import { createDeadLetterQueueAlarm } from '../utils';

/**
 * Purposes:
 *
 * 1. Set up a rule set to send ML-generated prospects to two
 * separate systems (prospect-generation event):
 *
 *    a. A pre-existing production SQS queue that is consumed by a lambda which
 *       feeds those prospects to the curation admin tool.
 *
 *    b. The dev instance of this event bridge, which will in turn send the
 *       prospects to the dev SQS queue to be consumed by the dev lambda and sent
 *       to the dev curation admin tool :D
 *
 * 2. Set up the SNS topic and Event Bridge rules for all of the other Prospect events. (prospect-dismiss event as of now)
 *
 * Note that this class behaves differently based on the environment to which
 * it was deployed!
 */
export class ProspectEvents extends Resource {
  public readonly snsTopic: sns.SnsTopic;
  public readonly sqs: sqs.DataAwsSqsQueue;
  public readonly sqsDlq: sqs.DataAwsSqsQueue;

  readonly sqsIdForProspectGenerationEvent = `prospect-${config.environment}-queue`;
  readonly sqsNameForProspectGenerationEvent = `ProspectAPI-${config.environment}-Sqs-Translation-Queue`;

  readonly dlqIdForProspectEvents = `prospect-${config.environment}-dlq`;
  readonly dlqNameForProspectEvents = `ProspectAPI-${config.environment}-Sqs-Translation-Queue-Deadletter`;

  readonly snsIdForProspectEvents = `prospect-event-topic`;
  readonly snsNameForProspectEvents = `${config.prefix}-ProspectEventTopic`;

  constructor(
    scope: Construct,
    private name: string,
    private sharedEventBus: ApplicationEventBus
  ) {
    super(scope, name);

    // pre-existing queues (prod and dev) created by prospect-api
    this.sqs = this.createSqsForProspectEvents(
      this.sqsIdForProspectGenerationEvent,
      this.sqsNameForProspectGenerationEvent
    );

    // create a dlq for all Prospect events
    this.sqsDlq = this.createSqsForProspectEvents(
      this.dlqIdForProspectEvents,
      this.dlqNameForProspectEvents
    );

    // create an SNS topic for all Prospect events except for prospect-generation
    this.snsTopic = this.createSnsForProspectEvents();

    this.createProspectGenerationEventRule();
    this.createPolicyForEventBridgeToSqs();

    // setting up prospect-dismiss event rule
    this.createProspectEventRule(
      'Prospect-Dismiss',
      eventConfig.prospectDismiss.source,
      eventConfig.prospectDismiss.detailType
    );
    // setting up the required IAM policies
    this.createPolicyForEventBridgeToSns();

    // TODO: create a policy function for dev event bridge
    // this.createPolicyForEventBridgeToDevEventBridge();

    createDeadLetterQueueAlarm(
      this.sqsDlq.name,
      'prospect-event-rule-dlq-alarm'
    );
  }

  /**
   * Creates a SQS/DLQ.
   * NOTE: The SQS will only be used by the prospect-generation events. The DLQ is shared and used by other Prospect events as well.
   *
   * @param id
   * @param name
   * @returns A queue (SQS/DLQ).
   */
  private createSqsForProspectEvents(
    id: string,
    name: string
  ): sqs.DataAwsSqsQueue {
    return new sqs.DataAwsSqsQueue(this, id, {
      name,
    });
  }

  /**
   * Creates the SNS topic that all Prospect events will publish to except for prospect-generation event.
   *
   * @param id default set to class variable: snsIdForProspectEvents. Shouldn't need to change it unless changing it for all prospect events that use this sns topic.
   * @param name default set to class variable: snsNameForProspectEvents. Shouldn't need to change it unless changing it for all prospect events that use this sns topic.
   * @returns A SNS topic that is used by all Prospect events except for prospect-generation events.
   */
  private createSnsForProspectEvents(
    id = this.snsIdForProspectEvents,
    name = this.snsNameForProspectEvents
  ): sns.SnsTopic {
    return new sns.SnsTopic(this, id, {
      name,
    });
  }

  /**
   * Creates and sets up the required constructs needed for the prospect-generation event.
   * NOTE: this is an unique event that has its own SQS and is not published to the SNS topic shared by all of the other Prospect events.
   *       Hence, this function does not provide any parameters to customize event and construct attributes.
   */
  private createProspectGenerationEventRule() {
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

    const prospectGenerationEventRuleProps: PocketEventBridgeProps = {
      eventRule: {
        name: `${config.prefix}-ProspectEvents-Rule`,
        eventPattern: {
          source: [eventConfig.prospectGeneration.source],
          'detail-type': eventConfig.prospectGeneration.detailType,
        },
        eventBusName: this.sharedEventBus.bus.name,
      },
      targets,
    };

    new PocketEventBridgeRuleWithMultipleTargets(
      this,
      `${config.prefix}-Prospect-Prod-EventBridge-Rule`,
      prospectGenerationEventRuleProps
    );
  }

  /**
   * Create an event bridge rule for Prospect events.
   *
   * @param name
   * @param source
   * @param detailType
   */
  private createProspectEventRule(
    name: string,
    source: string,
    detailType: string[]
  ) {
    const targets: PocketEventBridgeTargets[] = [
      {
        arn: this.snsTopic.arn,
        deadLetterArn: this.sqsDlq.arn, //using the same DLQ for all prospect events (prospect-generation and prospect-dismiss as of now)
        targetId: `${config.prefix}-Prospect-Event-SNS-Target`,
        terraformResource: this.snsTopic,
      },
    ];

    const prospectEventRuleProps = {
      eventRule: {
        name: `${config.prefix}-${name}-Event-Rule`,
        eventPattern: {
          source: [source],
          'detail-type': detailType,
        },
        eventBusName: this.sharedEventBus.bus.name,
      },
      targets,
    };

    new PocketEventBridgeRuleWithMultipleTargets(
      this,
      `${config.prefix}-${name}-Prod-EventBridge-Rule`,
      prospectEventRuleProps
    );
  }

  /**
   * Create IAM policy to allow EventBridge to publish to the SNS topic.
   */
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

  /**
   * Create IAM policy to allow EventBridge to send messages to SQS for prospect-generation events.
   */
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
