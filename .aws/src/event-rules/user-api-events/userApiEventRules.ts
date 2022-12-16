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
import { createDeadLetterQueueAlarm } from '../utils';

export class UserApiEvents extends Resource {
  public readonly snsTopic: sns.SnsTopic;
  public readonly snsTopicDlq: sqs.SqsQueue;

  constructor(
    scope: Construct,
    private name: string,
    private sharedEventBus: ApplicationEventBus
  ) {
    super(scope, name);

    this.snsTopic = new sns.SnsTopic(this, 'user-event-topic', {
      name: `${config.prefix}-UserEventTopic`,
    });

    this.snsTopicDlq = new sqs.SqsQueue(this, 'sns-topic-dql', {
      name: `${config.prefix}-SNS-Topic-Event-Rule-DLQ`,
      tags: config.tags,
    });

    this.createUserEventRules();
    this.createPolicyForEventBridgeToSns();

    createDeadLetterQueueAlarm(
      this.snsTopicDlq.name,
      'user-event-rule-dlq-alarm'
    );
  }

  /**
   * Rolls out event bridge rule and attaches them to sns target
   * for user-events
   * @private
   */
  private createUserEventRules() {
    const userEventRuleProps: PocketEventBridgeProps = {
      eventRule: {
        name: `${config.prefix}-UserEvents-Rule`,
        eventPattern: {
          source: [eventConfig.source],
          'detail-type': eventConfig.detailType,
        },
        eventBusName: this.sharedEventBus.bus.name,
      },
      targets: [
        {
          arn: this.snsTopic.arn,
          deadLetterArn: this.snsTopicDlq.arn,
          targetId: `${config.prefix}-User-Event-SNS-Target`,
          terraformResource: this.snsTopic,
        },
        {
          arn: this.snsTopic.arn,
          deadLetterArn: this.snsTopicDlq.arn,
          targetId: `${config.prefix}-User-Event-SNS -Snowplow-Target`,
          terraformResource: this.snsTopic,
        },
      ],
    };

    return new PocketEventBridgeRuleWithMultipleTargets(
      this,
      `${config.prefix}-User-Api-EventBridge-Rule`,
      userEventRuleProps
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

    return new sns.SnsTopicPolicy(this, 'user-events-sns-topic-policy', {
      arn: this.snsTopic.arn,
      policy: eventBridgeSnsPolicy,
    });
  }
}
