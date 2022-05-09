import { Construct } from 'constructs';
import { Resource } from 'cdktf';
import {
  PocketVPC,
  PocketEventBridgeProps,
  PocketEventBridgeTargets,
  PocketEventBridgeRuleWithMultipleTargets
} from '@pocket-tools/terraform-modules';
import { config } from '../config';
import { ApplicationEventBus } from '@pocket-tools/terraform-modules/dist/base/ApplicationEventBus';
import { eventConfig } from './eventConfig';

export class UserApiEvents extends Resource {
  constructor(
    scope: Construct,
    private name: string,
    private sharedEventBus: ApplicationEventBus,
  ) {
    super(scope, name);

    this.createUserEventRules();
  }

  private createUserEventRules() {
    //todo: attach targets

    const userEventRuleProps: PocketEventBridgeProps = {
      eventRule: {
        name: `${config.prefix}-UserEvents-Rule`,
        pattern: {
          source: [eventConfig.source],
          'detail-type': [
            ...eventConfig.detailType
          ],
        },
        eventBusName: this.sharedEventBus.bus.name,
      },
      targets: [],
    };

    const dataSyncEventRuleWithTargetObj =
      new PocketEventBridgeRuleWithMultipleTargets(
        this,
        `${config.prefix}-EventBridge-Rule`,
        userEventRuleProps
      );

    return dataSyncEventRuleWithTargetObj;
  }
}

