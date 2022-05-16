import { Construct } from 'constructs';
import { Resource } from 'cdktf';
import {
  PocketEventBridgeProps,
  PocketEventBridgeRuleWithMultipleTargets,
  ApplicationEventBus
} from '@pocket-tools/terraform-modules';
import { config } from '../../config';
import { iam, sns, sqs } from '@cdktf/provider-aws';
import { eventConfig } from './eventConfig';

export class UserApiEvents extends Resource {
  constructor(
    scope: Construct,
    private name: string,
    private sharedEventBus: ApplicationEventBus
  ) {
    super(scope, name);

    const snsTopic = new sns.SnsTopic(this, 'user-event-topic', {
      name: `${config.prefix}-UserEventTopic`,
    });

    this.createUserEventRules(snsTopic);
    this.createPolicyForEventBridgeToSns(snsTopic.arn);
  }

  /**
   * Rolls out event bridge rule and attaches them to sns target
   * for user-events
   * @private
   */
  private createUserEventRules(snsTopic: sns.SnsTopic) {
    const snsTopicDlq = new sqs.SqsQueue(this, 'sns-topic-dql', {
      name: `${config.prefix}-SNS-Topic-Event-Rule-DLQ`,
      tags: config.tags,
    });

    const userEventRuleProps: PocketEventBridgeProps = {
      eventRule: {
        name: `${config.prefix}-UserEvents-Rule`,
        pattern: {
          source: [eventConfig.source],
          'detail-type': [...eventConfig.detailType],
        },
        eventBusName: this.sharedEventBus.bus.name,
      },
      targets: [
        {
          arn: snsTopic.arn,
          deadLetterArn: snsTopicDlq.arn,
          targetId: `${config.prefix}-User-Event-SNS-Target`,
          terraformResource: snsTopic,
        },
      ],
    };

    return new PocketEventBridgeRuleWithMultipleTargets(
      this,
      `${config.prefix}-EventBridge-Rule`,
      userEventRuleProps
    );
  }

  private createPolicyForEventBridgeToSns(snsTopicArn: string) {
    const eventBridgeSnsPolicy = new iam.DataAwsIamPolicyDocument(
      this,
      `${config.prefix}-EventBridge-SNS-Policy`,
      {
        statement: [
          {
            effect: 'Allow',
            actions: ['sns:Publish'],
            resources: [snsTopicArn],
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

    return new sns.SnsTopicPolicy(this, 'user-events-sns-topic-policy', {
      arn: snsTopicArn,
      policy: eventBridgeSnsPolicy,
    });
  }
}
