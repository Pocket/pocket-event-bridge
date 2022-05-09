import { Resource } from 'cdktf';
import { Construct } from 'constructs';
import { PocketVPC } from '@pocket-tools/terraform-modules';

export class SnowplowConsumer extends Resource {
  constructor(
    scope: Construct,
    private name: string,
    private vpc: PocketVPC,
  ) {
    super(scope, name);

  }
}
