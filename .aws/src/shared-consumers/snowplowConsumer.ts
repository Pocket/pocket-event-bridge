import { Resource } from 'cdktf';
import { Construct } from 'constructs';
import {
  LAMBDA_RUNTIMES,
  PocketSQSWithLambdaTarget,
  PocketVPC,
} from '@pocket-tools/terraform-modules';
import { config } from '../config';
import { sns, sqs, iam } from '@cdktf/provider-aws';

export class SnowplowConsumer extends Resource {
  constructor(scope: Construct, private name: string, private vpc: PocketVPC) {
    super(scope, name);

    const lambda = this.createSnowplowSnsSubscriberLambda();

    const snsTopic = new sns.DataAwsSnsTopic(this, 'user-events-sns', {
      name: `${config.prefix}-UserEventTopic`,
    });

    const snsTopicDlq = new sqs.SqsQueue(this, 'sns-topic-dql', {
      name: `${config.prefix}-SNS-Topic-DLQ`,
      tags: config.tags,
    });

    new sns.SnsTopicSubscription(this, 'user-events-subscription', {
      topicArn: snsTopic.arn,
      protocol: 'sqs',
      endpoint: lambda.sqsQueueResource.arn,
      redrivePolicy: JSON.stringify({
        deadLetterTargetArn: snsTopicDlq.arn,
      }),
    });

    this.createPoliciesForSnsToSQS(
      snsTopic.arn,
      lambda.sqsQueueResource,
      snsTopicDlq
    );
  }

  /**
   * @private
   */
  private createSnowplowSnsSubscriberLambda() {
    return new PocketSQSWithLambdaTarget(this, 'snowplow-lambda', {
      name: `${config.prefix}-Snowplow-Lambda`,
      sqsQueue: {
        visibilityTimeoutSeconds: 150,
        maxReceiveCount: 3,
      },
      lambda: {
        runtime: LAMBDA_RUNTIMES.NODEJS14,
        handler: 'index.handler',
        timeout: 120,
        vpcConfig: {
          securityGroupIds: this.vpc.defaultSecurityGroups.ids,
          subnetIds: this.vpc.privateSubnetIds,
        },
      },
      tags: config.tags,
    });
  }

  /**
   * @param snsTopicArn
   * @param lambdaSqsQueue
   * @param snsTopicDlq
   * @private
   */
  private createPoliciesForSnsToSQS(
    snsTopicArn: string,
    lambdaSqsQueue: sqs.SqsQueue | sqs.DataAwsSqsQueue,
    snsTopicDlq: sqs.SqsQueue | sqs.DataAwsSqsQueue
  ) {
    [
      { name: 'SNS-SQS', resource: lambdaSqsQueue },
      { name: 'SNS-DLQ', resource: snsTopicDlq },
    ].forEach((queue) => {
      const policy = new iam.DataAwsIamPolicyDocument(
        this,
        `${config.prefix}-${queue.name}-Policy`,
        {
          statement: [
            {
              effect: 'Allow',
              actions: ['sqs:SendMessage'],
              resources: [queue.resource.arn],
              principals: [
                {
                  identifiers: ['sns.amazonaws.com'],
                  type: 'Service',
                },
              ],
              condition: [
                {
                  test: 'ArnEquals',
                  variable: 'aws:SourceArn',
                  values: [snsTopicArn],
                },
              ],
            },
          ],
        }
      ).json;

      new sqs.SqsQueuePolicy(
        this,
        `snowplow-${queue.name.toLowerCase()}-policy`,
        {
          queueUrl: queue.resource.url,
          policy: policy,
        }
      );
    });
  }
}
