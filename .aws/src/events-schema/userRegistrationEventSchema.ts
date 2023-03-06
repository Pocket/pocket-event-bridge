/**
 * user registration event is emitted in web repo when
 * user initiates a password recovery
 */
import { Resource } from 'cdktf';
import { Construct } from 'constructs';
import { eventbridgeschemas } from '@cdktf/provider-aws';
import { SCHEMA_REGISTRY, SCHEMA_TYPE } from './types';
import { SchemasSchemaConfig } from '@cdktf/provider-aws/lib/eventbridgeschemas/schemas-schema';

export class UserRegistrationEventSchema extends Resource {
  public readonly userRegistrationEvent: string = 'User-Registration-Event';

  constructor(scope: Construct, private name: string) {
    super(scope, name);
    this.createUserRegistrationEventSchema();
  }

  private createUserRegistrationEventSchema() {
    const schemaProps: SchemasSchemaConfig = {
      name: this.userRegistrationEvent,
      description: `emitted when pocket user is registered (e.g signup)`,
      type: SCHEMA_TYPE,
      registryName: SCHEMA_REGISTRY,
      content: JSON.stringify(this.getUserRegistrationPayload()),
    };
    const schema = new eventbridgeschemas.SchemasSchema(
      this,
      `${this.userRegistrationEvent}-Schema`,
      schemaProps
    );

    return schema;
  }

  /***
   * Schema scaffold from the aws console
   */
  private getUserRegistrationPayload() {
    return {
      openapi: '3.0.0',
      info: {
        version: '1.0.0',
        title: 'Event',
      },
      paths: {},
      components: {
        schemas: {
          Event: {
            type: 'object',
            required: ['encodedUserId', 'locale', 'userId', 'email'],
            properties: {
              email: {
                type: 'string',
              },
              encodedUserId: {
                type: 'string',
              },
              locale: {
                type: 'string',
              },
              userId: {
                type: 'string',
              },
            },
          },
        },
      },
    };
  }
}
