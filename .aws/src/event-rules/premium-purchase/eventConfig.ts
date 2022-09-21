import { config as globalConfig } from '../../config';

export const eventConfig = {
  name: 'PremiumPurchase',
  source: 'web-repo',
  detailType: ['premium-purchase'],
  bus: globalConfig.sharedEventBusName,
};
