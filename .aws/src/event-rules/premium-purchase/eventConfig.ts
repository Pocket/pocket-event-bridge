import { config as globalConfig } from '../../config';

export const eventConfig = {
  name: 'PremiumPurchase',
  source: 'premium-purchase',
  detailType: ['web-repo'],
  bus: globalConfig.sharedEventBusName,
};
