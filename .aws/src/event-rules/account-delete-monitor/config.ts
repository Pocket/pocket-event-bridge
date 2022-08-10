import { config as globalConfig } from '../../config';

export const config = {
  queueCheckDelete: {
    scheduleExpression: 'cron(15 10 * * ? *)', // 03:15 PT every day
    name: 'EventTracker',
    schema: 'queue-check-delete',
    bus: 'default',
  },
  prefix: `AccountDeleteMonitor-${globalConfig.environment}`,
};
