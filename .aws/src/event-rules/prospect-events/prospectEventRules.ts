import { Construct } from 'constructs';
import { Resource } from 'cdktf';
import {
  PocketEventBridgeProps,
  PocketEventBridgeRuleWithMultipleTargets,
  ApplicationEventBus,
} from '@pocket-tools/terraform-modules';
import { config } from '../../config';
import { iam, sns, sqs } from '@cdktf/provider-aws';
import { eventConfig } from './eventConfig';

/**
 * Event bus rules to send ML-generated prospects to a pre-existing SQS queue
 */
export class ProspectEvents extends Resource {
  public readonly snsTopic: sns.SnsTopic;
  public readonly sqs: sqs.SqsQueue;
  public readonly sqsDlq: sqs.SqsQueue;

  constructor(
    scope: Construct,
    private name: string,
    private sharedEventBus: ApplicationEventBus
  ) {
    super(scope, name);

    // pre-existing queues created by prospect-api
    this.sqs = new sqs.SqsQueue(this, 'ProspectAPI-Prod-Sqs-Translation-Queue');
    this.sqsDlq = new sqs.SqsQueue(this, 'ProspectAPI-Prod-Sqs-Translation-Queue-Deadletter');

    this.createProspectEventRules();
    this.createPolicyForEventBridgeToSqs();

    // TODO: create a policy function for dev event bridge?
    // this.createPolicyForEventBridgeToDevEventBridge();
  }

  /**
   * Create an event bridge rule and attach to the configured targets.
   * @private
   */
  private createProspectEventRules() {
    const prospectEventRuleProps: PocketEventBridgeProps = {
      eventRule: {
        name: `${config.prefix}-ProspectEvents-Rule`,
        pattern: {
          source: [eventConfig.source],
          'detail-type': eventConfig.detailType,
        },
        eventBusName: this.sharedEventBus.bus.name,
      },
      targets: [
        {
          arn: this.sqs.arn,
          deadLetterArn: this.sqsDlq.arn,
          targetId: `${config.prefix}-Prospect-Event-SQS-Target`,
          terraformResource: this.sqs,
        },
        // TODO: create a target for the dev event bus, which will then send
        // prospects to the dev SQS
      ],
    };

    // TODO: does this need a return?
    return new PocketEventBridgeRuleWithMultipleTargets(
      this,
      // TODO: does the below need to be unique? if so, we need to do a little
      // refactoring.
      `${config.prefix}-EventBridge-Rule`,
      prospectEventRuleProps
    );
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

    // TODO: do we need a return here?
    return new sqs.SqsQueuePolicy(this, 'prospect-events-sqs-policy', {
      policy: eventBridgeSqsPolicy,
      queueUrl: this.sqs.url
    });
  }
}
