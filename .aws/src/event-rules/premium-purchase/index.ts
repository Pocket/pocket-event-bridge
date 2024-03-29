import { Construct } from 'constructs';
import { Resource } from 'cdktf';
import {
  PocketEventBridgeProps,
  PocketEventBridgeRuleWithMultipleTargets,
  PocketPagerDuty,
} from '@pocket-tools/terraform-modules';
import { config } from '../../config';
import { iam, sns, sqs } from '@cdktf/provider-aws';
import { eventConfig } from './eventConfig';
import { createDeadLetterQueueAlarm } from '../utils';
import * as NullProviders from '@cdktf/provider-null';

export class PremiumPurchase extends Resource {
  public readonly snsTopic: sns.SnsTopic;
  public readonly snsTopicDlq: sqs.SqsQueue;

  constructor(
    scope: Construct,
    private name: string,
    private pagerDuty: PocketPagerDuty
  ) {
    super(scope, name);

    this.snsTopic = new sns.SnsTopic(this, 'premium-purchase-topic', {
      name: `${config.prefix}-${eventConfig.name}-Topic`,
      lifecycle: {
        preventDestroy: true,
      },
    });

    this.snsTopicDlq = new sqs.SqsQueue(this, 'sns-topic-dlq', {
      name: `${config.prefix}-${eventConfig.name}-SNS-Topic-Event-Rule-DLQ`,
      tags: config.tags,
    });

    const premiumPurchaseRule = this.createPremiumPurchaseRules();
    this.createPolicyForEventBridgeToSns();

    createDeadLetterQueueAlarm(
      this,
      pagerDuty,
      this.snsTopicDlq.name,
      `${eventConfig.name}-rule-dlq-alarm`
    );

    new NullProviders.Resource(this, 'null-resource', {
      dependsOn: [premiumPurchaseRule.getEventBridge().rule, this.snsTopic],
    });
  }

  /**
   * Rolls out event bridge rule and attaches them to sns target
   * for premium-purchase event
   * @private
   */
  private createPremiumPurchaseRules() {
    const premiumPurchaseRuleProps: PocketEventBridgeProps = {
      eventRule: {
        name: `${config.prefix}-${eventConfig.name}-Rule`,
        eventPattern: {
          source: [eventConfig.source],
          'detail-type': eventConfig.detailType,
        },
        eventBusName: eventConfig.bus,
        preventDestroy: true,
      },
      targets: [
        {
          arn: this.snsTopic.arn,
          deadLetterArn: this.snsTopicDlq.arn,
          targetId: `${config.prefix}-${eventConfig.name}-SNS-Target`,
          terraformResource: this.snsTopic,
        },
      ],
    };

    return new PocketEventBridgeRuleWithMultipleTargets(
      this,
      `${config.prefix}-${eventConfig.name}-EventBridge-Rule`,
      premiumPurchaseRuleProps
    );
  }

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

    return new sns.SnsTopicPolicy(this, 'premium-purchase-sns-topic-policy', {
      arn: this.snsTopic.arn,
      policy: eventBridgeSnsPolicy,
    });
  }
}
