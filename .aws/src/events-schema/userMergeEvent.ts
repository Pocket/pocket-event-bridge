/**
 * UserMerge event is emitted when two pocket accounts are merged.
 * The sourceUserId's account data is merged to the destinationUserId's account
 */
import { Resource, Fn } from 'cdktf';
import { Construct } from 'constructs';
import { eventbridgeschemas } from '@cdktf/provider-aws';
import { SCHEMA_REGISTRY, SCHEMA_TYPE } from './types';
import { SchemasSchemaConfig } from '@cdktf/provider-aws/lib/eventbridgeschemas/schemas-schema';

export class UserMergeEventSchema extends Resource {
  public readonly eventName: string = 'user-merge';
  constructor(scope: Construct, private name: string) {
    super(scope, name);
    this.createUserMergeEvent();
  }

  private createUserMergeEvent() {
    const schemaProps: SchemasSchemaConfig = {
      name: this.eventName,
      description: `user merge event is emitted when sourceUserId's account data is merged to the destinationUserId's account`,
      type: SCHEMA_TYPE,
      registryName: SCHEMA_REGISTRY,
      content: Fn.jsonencode(this.getUserMergeEventSchema()),
    };
    const schema = new eventbridgeschemas.SchemasSchema(
      this,
      `${this.eventName}-schema`,
      schemaProps
    );
    return schema;
  }

  /***
   * Schema scaffold from the aws console
   * @private
   */
  private getUserMergeEventSchema() {
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
            required: ['destinationUserId', 'sourceUserId'],
            properties: {
              destinationUserId: {
                type: 'string',
              },
              sourceUserId: {
                type: 'string',
              },
            },
          },
        },
      },
    };
  }
}
