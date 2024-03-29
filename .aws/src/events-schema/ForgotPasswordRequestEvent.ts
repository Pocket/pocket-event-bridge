/**
 * Forgot password request is emitted in web repo when
 * user initiates a password recovery
 */
import { Resource } from 'cdktf';
import { Construct } from 'constructs';
import { eventbridgeschemas } from '@cdktf/provider-aws';
import { SCHEMA_REGISTRY, SCHEMA_TYPE } from './types';
import { SchemasSchemaConfig } from '@cdktf/provider-aws/lib/eventbridgeschemas/schemas-schema';

export class ForgotPasswordRequestEvent extends Resource {
  public readonly forgotPasswordRequest: string = 'Forgot-Password-Request';

  constructor(scope: Construct, private name: string) {
    super(scope, name);
    this.createPremiumRenewalUpcomingEvent();
  }

  private createPremiumRenewalUpcomingEvent() {
    const schemaProps: SchemasSchemaConfig = {
      name: this.forgotPasswordRequest,
      description: `emitted when pocket user initiates a password recovery`,
      type: SCHEMA_TYPE,
      registryName: SCHEMA_REGISTRY,
      content: JSON.stringify(this.getForgotPasswordRequestPayload()),
    };
    const schema = new eventbridgeschemas.SchemasSchema(
      this,
      `${this.forgotPasswordRequest}-Schema`,
      schemaProps
    );

    return schema;
  }

  /***
   * Schema scaffold from the aws console
   */
  private getForgotPasswordRequestPayload() {
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
            required: ['user', 'passwordResetInfo'],
            properties: {
              passwordResetInfo: {
                $ref: '#/components/schemas/PasswordResetInfo',
              },
              user: {
                $ref: '#/components/schemas/User',
              },
            },
          },
          PasswordResetInfo: {
            type: 'object',
            required: [
              'resetPasswordToken',
              'resetPasswordUsername',
              'timestamp',
            ],
            properties: {
              resetPasswordToken: {
                type: 'string',
              },
              resetPasswordUsername: {
                type: 'string',
              },
              timestamp: {
                type: 'number',
              },
            },
          },
          User: {
            type: 'object',
            required: ['id', 'encodedId', 'email'],
            properties: {
              email: {
                type: 'string',
              },
              encodedId: {
                type: 'string',
              },
              id: {
                type: 'number',
              },
            },
          },
        },
      },
    };
  }
}
