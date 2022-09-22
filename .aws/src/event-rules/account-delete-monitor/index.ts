import { Construct } from 'constructs';
import { Resource } from 'cdktf';
import {
  PocketEventBridgeProps,
  PocketEventBridgeRuleWithMultipleTargets,
  ApplicationEventBus,
} from '@pocket-tools/terraform-modules';
import { config } from '../../config';
import { sns, sqs } from '@cdktf/provider-aws';
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
    this.createUserMergeRules();
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
}
