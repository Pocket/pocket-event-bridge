import { Construct } from 'constructs';
import {
  App,
  RemoteBackend,
  TerraformStack,
  DataTerraformRemoteState,
} from 'cdktf';
import { AwsProvider } from '@cdktf/provider-aws';
import { PagerdutyProvider } from '@cdktf/provider-pagerduty';
import { LocalProvider } from '@cdktf/provider-local';
import { NullProvider } from '@cdktf/provider-null';
import {
  ApplicationEventBus,
  ApplicationEventBusProps,
} from '@pocket-tools/terraform-modules/dist/base/ApplicationEventBus';
import { UserApiEvents } from './event-rules/user-api-events/userApiEventRules';
import { ProspectEvents } from './event-rules/prospect-events/prospectEventRules';
import { CollectionApiEvents } from './event-rules/collection-events/collectionApiEventRules';
import { PocketPagerDuty, PocketVPC } from '@pocket-tools/terraform-modules';
import { ArchiveProvider } from '@cdktf/provider-archive';
import { config } from './config';
import { UserEventsSchema } from './events-schema/userEvents';
import { AccountDeleteMonitorEvents } from './event-rules/account-delete-monitor';
import { QueueCheckDeleteSchema } from './events-schema/queueCheckDelete';
import { UserMergeEventSchema } from './events-schema/userMergeEvent';
import { PremiumPurchaseEvent } from './events-schema/premiumPurchaseEvent';
import { ForgotPasswordRequestEvent } from './events-schema/ForgotPasswordRequestEvent';
import { PremiumPurchase } from './event-rules/premium-purchase';

class PocketEventBus extends TerraformStack {
  constructor(scope: Construct, name: string) {
    super(scope, name);

    new AwsProvider(this, 'aws', { region: 'us-east-1' });
    new PagerdutyProvider(this, 'pagerduty_provider', { token: undefined });
    new LocalProvider(this, 'local_provider');
    new NullProvider(this, 'null_provider');
    new ArchiveProvider(this, 'archive_provider');

    new RemoteBackend(this, {
      hostname: 'app.terraform.io',
      organization: 'Pocket',
      workspaces: [{ prefix: `${config.name}-` }],
    });

    const eventBusProps: ApplicationEventBusProps = {
      name: `${config.prefix}-Shared-Event-Bus`,
      tags: { service: config.prefix },
    };

    const sharedPocketEventBus = new ApplicationEventBus(
      this,
      'shared-event-bus',
      eventBusProps
    );

    const pocketVpc = new PocketVPC(this, 'pocket-vpc');
    const pagerDuty = this.createPagerDuty();

    // CUSTOM EVENTS & CONSUMERS

    // user-api events
    const userEvents = new UserApiEvents(
      this,
      'user-api-events',
      sharedPocketEventBus,
      pagerDuty
    );

    // prospect events (note that the following behaves differently in prod
    // versus dev - check the file for more details)
    new ProspectEvents(
      this,
      'prospect-events',
      sharedPocketEventBus,
      pagerDuty
    );

    // Events for Account Delete Monitor service
    new AccountDeleteMonitorEvents(this, 'adm-events', pagerDuty);

    //'Premium Purchase' event, currently emitted by web-repo
    new PremiumPurchase(this, 'premium-purchase', pagerDuty);

    //Schema
    new UserEventsSchema(this, 'user-api-events-schema');
    new QueueCheckDeleteSchema(this, 'queue-delete-schema');
    new UserMergeEventSchema(this, 'user-merge-event-shema');
    new PremiumPurchaseEvent(this, 'premium-purchase-event-schema');
    new ForgotPasswordRequestEvent(
      this,
      'forgot-password-request-event-schema'
    );

    new CollectionApiEvents(
      this,
      'collection-events',
      sharedPocketEventBus,
      pagerDuty
    );
    //TODO add collection events open api schema from aws
  }

  /**
   * Create PagerDuty service for alerts
   * @private
   */
  private createPagerDuty() {
    const incidentManagement = new DataTerraformRemoteState(
      this,
      'incident_management',
      {
        organization: 'Pocket',
        workspaces: {
          name: 'incident-management',
        },
      }
    );

    return new PocketPagerDuty(this, 'pagerduty', {
      prefix: config.prefix,
      service: {
        criticalEscalationPolicyId: incidentManagement
          .get('policy_backend_critical_id')
          .toString(),
        nonCriticalEscalationPolicyId: incidentManagement
          .get('policy_backend_non_critical_id')
          .toString(),
      },
    });
  }
}

const app = new App();
new PocketEventBus(app, config.nameLower);
app.synth();
