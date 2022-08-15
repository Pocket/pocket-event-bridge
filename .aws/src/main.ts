import { Construct } from 'constructs';
import { App, RemoteBackend, TerraformStack } from 'cdktf';
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
import { SnowplowConsumer } from './shared-consumers/snowplowConsumer';
import { PocketVPC } from '@pocket-tools/terraform-modules';
import { ArchiveProvider } from '@cdktf/provider-archive';
import { config } from './config';
import { UserEventsSchema } from './events-schema/userEvents';
import { AccountDeleteMonitorEvents } from './event-rules/account-delete-monitor';
import { QueueCheckDeleteSchema } from './events-schema/queueCheckDelete';
import { UserMergeEventSchema } from './events-schema/userMergeEvent';
import { PremiumPurchaseEvent } from './events-schema/premiumPurchaseEvent';

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

    // CUSTOM EVENTS & CONSUMERS

    // user-api events
    const userEvents = new UserApiEvents(
      this,
      'user-api-events',
      sharedPocketEventBus
    );

    new SnowplowConsumer(
      this,
      'pocket-snowplow-consumer',
      pocketVpc,
      userEvents.snsTopic
    );

    // prospect events (note that the following behaves differently in prod
    // versus dev - check the file for more details)
    new ProspectEvents(this, 'prospect-events', sharedPocketEventBus);

    // Events for Account Delete Monitor service
    new AccountDeleteMonitorEvents(this, 'adm-events');

    //Schema
    new UserEventsSchema(this, 'user-api-events-schema');
    new QueueCheckDeleteSchema(this, 'queue-delete-schema');
    new UserMergeEventSchema(this, 'user-merge-event-shema');
    new PremiumPurchaseEvent(this, 'premium-purchase-event-schema');
  }
}

const app = new App();
new PocketEventBus(app, config.nameLower);
app.synth();
