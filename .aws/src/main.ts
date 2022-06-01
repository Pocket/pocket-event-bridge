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
import { SnowplowConsumer } from './shared-consumers/snowplowConsumer';
import { PocketVPC } from '@pocket-tools/terraform-modules';
import { ArchiveProvider } from '@cdktf/provider-archive';
import { config } from './config';
import { UserEventsSchema } from './events-schema/userEvents';

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
  }
}

const app = new App();
new PocketEventBus(app, config.nameLower);
app.synth();
