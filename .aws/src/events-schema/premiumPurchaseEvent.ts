/**
 * PremiumPurchase event is emitted when a pocket user has subscribed for
 * premium account.
 */
import { Resource, Fn } from 'cdktf';
import { Construct } from 'constructs';
import { eventbridgeschemas } from '@cdktf/provider-aws';
import { SCHEMA_REGISTRY, SCHEMA_TYPE } from './types';
import { SchemasSchemaConfig } from '@cdktf/provider-aws/lib/eventbridgeschemas/schemas-schema';

export class PremiumPurchaseEvent extends Resource {
  public readonly eventName: string = 'premium-purchase';

  constructor(scope: Construct, private name: string) {
    super(scope, name);
    this.createPremiumPurchaseEvent();
  }

  private createPremiumPurchaseEvent() {
    const schemaProps: SchemasSchemaConfig = {
      name: this.eventName,
      description: `emitted when pocket user subscribes for premium account`,
      type: SCHEMA_TYPE,
      registryName: SCHEMA_REGISTRY,
      content: Fn.jsonencode(this.getPremiumPurchaseEventSchema())
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
   */
  private getPremiumPurchaseEventSchema() {
    return {
      "openapi": "3.0.0",
      "info": {
        "version": "1.0.0",
        "title": "Event"
      },
      "paths": {},
      "components": {
        "schemas": {
          "Event": {
            "type": "object",
            "required": ["purchase", "user"],
            "properties": {
              "purchase": {
                "$ref": "#/components/schemas/Purchase"
              },
              "user": {
                "$ref": "#/components/schemas/User"
              }
            }
          },
          "Purchase": {
            "type": "object",
            "required": ["amount", "planType", "isFree", "planInterval", "cancelAtPeriodEnd", "isTrial", "receiptId", "renewDate"],
            "properties": {
              "amount": {
                "type": "string"
              },
              "cancelAtPeriodEnd": {
                "type": "boolean"
              },
              "isFree": {
                "type": "boolean"
              },
              "isTrial": {
                "type": "boolean"
              },
              "planInterval": {
                "type": "string"
              },
              "planType": {
                "type": "string"
              },
              "receiptId": {
                "type": "string"
              },
              "renewDate": {
                "type": "string"
              }
            }
          },
          "User": {
            "type": "object",
            "required": ["id", "encodedId", "email"],
            "properties": {
              "email": {
                "type": "string"
              },
              "encodedId": {
                "type": "string"
              },
              "id": {
                "type": "number"
              }
            }
          }
        }
      }
    };
  }
}

