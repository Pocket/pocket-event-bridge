import { Resource } from 'cdktf';
import { Construct } from 'constructs';
import {
  ApplicationSqsSnsTopicSubscription,
  LAMBDA_RUNTIMES,
  PocketSQSWithLambdaTarget,
  PocketVPC
} from '@pocket-tools/terraform-modules';
import { config } from '../config';
import { sns,sqs } from '@cdktf/provider-aws';

export class SnowplowConsumer extends Resource {
  constructor(scope: Construct, private name: string, private vpc: PocketVPC) {
    super(scope, name);

    const lambda = this.createSnowplowSnsSubscriberLambda();

    const snsTopic = new sns.DataAwsSnsTopic(this, 'user-events-sns', {
      name: `${config.prefix}-UserEventTopic`,
    });

    new ApplicationSqsSnsTopicSubscription(this,'snowplow-sns-subscription',{
      name: config.prefix,
      snsTopicArn : snsTopic.arn,
      sqsQueue: lambda.sqsQueueResource,
      tags: config.tags,
      dependsOn: [lambda.sqsQueueResource as sqs.SqsQueue]
    });
  }

  /**
   * Rolls out a snowplow lambda.
   * can be used to add shared snowplow event emission logic based on events from sns
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
}
