import { Construct } from 'constructs';
import { Resource } from 'cdktf';
import {
  PocketEventBridgeProps,
  PocketEventBridgeRuleWithMultipleTargets,
} from '@pocket-tools/terraform-modules';
import { config } from '../../config';
import { iam, sns, sqs } from '@cdktf/provider-aws';
import { eventConfig } from './eventConfig';

export class PremiumPurchase extends Resource {
  public readonly snsTopic: sns.SnsTopic;

  constructor(scope: Construct, private name: string) {
    super(scope, name);

    this.snsTopic = new sns.SnsTopic(this, 'premium-purchase-topic', {
      name: `${config.prefix}-${eventConfig.name}-Topic`,
    });

    this.createPremiumPurchaseRules();
    this.createPolicyForEventBridgeToSns();
  }

  /**
   * Rolls out event bridge rule and attaches them to sns target
   * for premium-purchase event
   * @private
   */
  private createPremiumPurchaseRules() {
    const snsTopicDlq = new sqs.SqsQueue(this, 'sns-topic-dlq', {
      name: `${config.prefix}-${eventConfig.name}-SNS-Topic-Event-Rule-DLQ`,
      tags: config.tags,
    });

    const premiumPurchaseRuleProps: PocketEventBridgeProps = {
      eventRule: {
        name: `${config.prefix}-${eventConfig.name}-Rule`,
        eventPattern: {
          source: [eventConfig.source],
          'detail-type': eventConfig.detailType,
        },
        eventBusName: eventConfig.bus,
      },
      targets: [
        {
          arn: this.snsTopic.arn,
          deadLetterArn: snsTopicDlq.arn,
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
