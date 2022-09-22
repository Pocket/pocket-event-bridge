import { Construct } from 'constructs';
import { Resource } from 'cdktf';
import {
  PocketEventBridgeProps,
  PocketEventBridgeRuleWithMultipleTargets,
  ApplicationEventBus,
} from '@pocket-tools/terraform-modules';
import { config } from '../../config';
import { sns, sqs, iam } from '@cdktf/provider-aws';
import { config as admConfig } from './config';

export class AccountDeleteMonitorEvents extends Resource {
  public readonly snsTopic: sns.SnsTopic;
  public readonly sqs: sqs.DataAwsSqsQueue;
  public readonly sqsDlq: sqs.DataAwsSqsQueue;

  constructor(scope: Construct, name: string) {
    super(scope, name);
    // pre-existing queues (prod and dev) created by account-delete-monitor
    this.sqs = new sqs.DataAwsSqsQueue(this, `${admConfig.prefix}-queue`, {
      name: `${admConfig.prefix}-${admConfig.queueCheckDelete.name}-Queue`,
    });

    this.sqsDlq = new sqs.DataAwsSqsQueue(
      this,
      `${admConfig.prefix}-queue-dlq`,
      {
        name: `${admConfig.prefix}-${admConfig.queueCheckDelete.name}-Queue-Deadletter`,
      }
    );

    this.createAdmRules();
    //todo: revisit - the scheduled event will need iam permission to trigger sqs

    const userMergeRule = this.createUserMergeRules();
    // Permissions for EventBridge publishing to SQS Target and DLQ (if fail to send)
    this.createPolicyForEventBridgeRuleToSQS(
      `${config.prefix}-${admConfig.userMerge.name}-sqs-dlq-iam`,
      this.sqsDlq,
      userMergeRule.getEventBridge().rule.arn
    );
    this.createPolicyForEventBridgeRuleToSQS(
      `${config.prefix}-${admConfig.userMerge.name}-sqs-iam`,
      this.sqs,
      userMergeRule.getEventBridge().rule.arn
    );
  }

  /**
   * Rolls out event bridge rule and attaches them to SQS target
   * for account-delete-monitor events
   * @private
   */
  private createAdmRules() {
    const userEventRuleProps: PocketEventBridgeProps = {
      eventRule: {
        name: `${config.prefix}-${admConfig.queueCheckDelete.name}-Rule`,
        scheduleExpression: admConfig.queueCheckDelete.scheduleExpression,
        eventBusName: admConfig.queueCheckDelete.bus,
      },
      targets: [
        {
          arn: this.sqs.arn,
          deadLetterArn: this.sqsDlq.arn,
          targetId: `${admConfig.prefix}-${admConfig.queueCheckDelete.name}-Rule-Target`,
        },
      ],
    };

    return new PocketEventBridgeRuleWithMultipleTargets(
      this,
      `${config.prefix}-${admConfig.queueCheckDelete.name}-EventBridge-Rule`,
      userEventRuleProps
    );
  }

  /**
   * rule that attaches `user-merge` event from web repo to the
   * account-delete-monitor lambda
   * @private
   */
  private createUserMergeRules() {
    const userEventRuleProps: PocketEventBridgeProps = {
      eventRule: {
        name: `${config.prefix}-${admConfig.userMerge.name}-Rule`,
        eventPattern: {
          source: [admConfig.userMerge.source],
          'detail-type': admConfig.userMerge.detailType,
        },
        eventBusName: admConfig.userMerge.bus,
      },
      targets: [
        {
          arn: this.sqs.arn,
          deadLetterArn: this.sqsDlq.arn,
          targetId: `${admConfig.prefix}-${admConfig.userMerge.name}-Rule-Target`,
        },
      ],
    };

    return new PocketEventBridgeRuleWithMultipleTargets(
      this,
      `${config.prefix}-${admConfig.userMerge.name}-EventBridge-Rule`,
      userEventRuleProps
    );
  }

  /**
   * function to create iam role for the event-bridge rule to publish events
   * to the sqs
   * Reference: https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-rule-dlq.html
   * @param name
   * @param sqsQueue
   * @param eventBridgeRuleArn
   * @private
   */
  private createPolicyForEventBridgeRuleToSQS(
    name: string,
    sqsQueue: sqs.SqsQueue | sqs.DataAwsSqsQueue,
    eventBridgeRuleArn: string
  ) {
    const eventBridgeRuleSQSPolicy = new iam.DataAwsIamPolicyDocument(
      this,
      `${config.prefix}-EventBridge-${name}-Policy`,
      {
        statement: [
          {
            effect: 'Allow',
            actions: ['sqs:SendMessage'],
            resources: [sqsQueue.arn],
            principals: [
              {
                identifiers: ['events.amazonaws.com'],
                type: 'Service',
              },
            ],
            condition: [
              {
                test: 'ArnEquals',
                variable: 'aws:SourceArn',
                values: [eventBridgeRuleArn],
              },
            ],
          },
        ],
      }
    ).json;

    return new sqs.SqsQueuePolicy(this, `${name.toLowerCase()}-policy`, {
      queueUrl: sqsQueue.url,
      policy: eventBridgeRuleSQSPolicy,
    });
  }
}
