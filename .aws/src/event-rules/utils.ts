import { cloudwatch } from '@cdktf/provider-aws';
import { config } from '../config';

/**
 * Function to create alarms for Dead-letter queues
 * Create a non-critical alarm in prod environment for
 * SQS queue based on the number of messages visible.
 * Default is 15 alerts on 2 evaluation period of 15 minutes.
 * Please pass a more stringent alert for important events.
 * @param stack terraform stack at which the alarm would be created
 * @param queueName dead-letter queue name
 * @param alarmName alarm name (please pass event-rule name to clear description)
 * @param evaluationPeriods
 * @param periodInSeconds
 * @param threshold
 * @private
 */
export function createDeadLetterQueueAlarm(
  stack,
  queueName,
  alarmName,
  evaluationPeriods = 2,
  periodInSeconds = 900,
  threshold = 15
) {
  new cloudwatch.CloudwatchMetricAlarm(stack, alarmName.toLowerCase(), {
    alarmName: `${config.prefix}-${alarmName}`,
    alarmDescription: `Number of messages >= ${threshold}`,
    namespace: 'AWS/SQS',
    metricName: 'ApproximateNumberOfMessagesVisible',
    dimensions: { QueueName: queueName },
    comparisonOperator: 'GreaterThanOrEqualToThreshold',
    evaluationPeriods: evaluationPeriods,
    period: periodInSeconds,
    threshold: threshold,
    statistic: 'Sum',
    alarmActions: config.isDev
      ? []
      : [this.config.pagerDuty.snsNonCriticalAlarmTopic.arn],
    okActions: config.isDev
      ? []
      : [this.config.pagerDuty.snsNonCriticalAlarmTopic.arn],
  });
}
