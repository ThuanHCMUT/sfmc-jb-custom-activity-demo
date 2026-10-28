import { describe, it, expect } from '@jest/globals';

import { EntrySchemaProvider, DISCOVERY_SOURCE } from '../../public/js/schema/entry-schema-provider.js';
import { SCHEMA_ERROR_CODES } from '../../public/js/schema/entry-schema-normalizer.js';

/**
 * Bridge double: records requests and lets the test deliver the requestedSchema response.
 */
function createFakeBridge() {
  let handler = null;
  const requests = [];
  return {
    requests,
    onRequestedSchema(callback) {
      handler = callback;
      return this;
    },
    requestSchema() {
      requests.push('requestSchema');
    },
    respond(payload) {
      handler?.(payload);
    },
    listenerCount() {
      return handler ? 1 : 0;
    },
  };
}

const silent = { info: () => {}, warn: () => {} };

const KEY = 'DEAudience-TestEntry-0001';

/** requestedSchema payload in the Journey Builder form: one key per field. */
const schemaPayload = (names = ['CustomerId', 'MobilePhone']) => ({
  schema: names.map((name) => ({
    key: `Event.${KEY}.${name}`,
    name,
    type: name === 'MobilePhone' ? 'Phone' : 'Text',
    length: 100,
    default: null,
    isNullable: true,
    isPrimaryKey: null,
  })),
});

describe('EntrySchemaProvider (requestSchema only)', () => {
  it('registers the response listener in the constructor, before any request', () => {
    const bridge = createFakeBridge();

    new EntrySchemaProvider({ bridge, logger: silent });

    expect(bridge.listenerCount()).toBe(1);
    expect(bridge.requests).toEqual([]);
  });

  it('reads the event key and field list from the schema payload', async () => {
    const bridge = createFakeBridge();
    const provider = new EntrySchemaProvider({ bridge, logger: silent });

    const pending = provider.discover();
    bridge.respond(schemaPayload());
    const result = await pending;

    expect(result.valid).toBe(true);
    expect(result.source).toBe(DISCOVERY_SOURCE.SCHEMA);
    expect(result.eventDefinitionKey).toBe(KEY);
    expect(result.fields.map((f) => f.id)).toEqual(['CustomerId', 'MobilePhone']);
    expect(bridge.requests).toEqual(['requestSchema']);
  });

  it('returns SCHEMA_NOT_AVAILABLE when the schema array is null', async () => {
    const bridge = createFakeBridge();
    const provider = new EntrySchemaProvider({ bridge, logger: silent });

    const pending = provider.discover();
    bridge.respond({ schema: null });
    const result = await pending;

    expect(result.valid).toBe(false);
    expect(result.fields).toEqual([]);
    expect(result.error.code).toBe(SCHEMA_ERROR_CODES.SCHEMA_NOT_AVAILABLE);
  });

  it('returns EVENT_DEFINITION_KEY_MISSING when no field key carries an event key', async () => {
    const bridge = createFakeBridge();
    const provider = new EntrySchemaProvider({ bridge, logger: silent });

    const pending = provider.discover();
    bridge.respond({ schema: [{ name: 'CustomerId', type: 'Text' }] });
    const result = await pending;

    expect(result.valid).toBe(false);
    expect(result.error.code).toBe(SCHEMA_ERROR_CODES.EVENT_DEFINITION_KEY_MISSING);
  });

  it('returns EVENT_DEFINITION_KEY_INVALID for a key with unsupported characters', async () => {
    const bridge = createFakeBridge();
    const provider = new EntrySchemaProvider({ bridge, logger: silent });

    const pending = provider.discover();
    bridge.respond({ schema: [{ key: 'Event.bad key!.CustomerId', name: 'CustomerId', type: 'Text' }] });
    const result = await pending;

    expect(result.valid).toBe(false);
    expect(result.error.code).toBe(SCHEMA_ERROR_CODES.EVENT_DEFINITION_KEY_INVALID);
  });

  it('times out with SCHEMA_NOT_AVAILABLE and uses a late response on the next discovery', async () => {
    const bridge = createFakeBridge();
    const provider = new EntrySchemaProvider({ bridge, responseTimeoutMs: 10, logger: silent });

    const first = await provider.discover();
    expect(first.valid).toBe(false);
    expect(first.error.code).toBe(SCHEMA_ERROR_CODES.SCHEMA_NOT_AVAILABLE);

    bridge.respond(schemaPayload());

    const result = await provider.discover();
    expect(result.valid).toBe(true);
    expect(bridge.requests).toEqual(['requestSchema']);
  });

  it('uses a prefetched response without sending a second request', async () => {
    const bridge = createFakeBridge();
    const provider = new EntrySchemaProvider({ bridge, logger: silent });

    provider.prefetch();
    bridge.respond(schemaPayload());
    const result = await provider.discover();

    expect(result.valid).toBe(true);
    expect(bridge.requests).toEqual(['requestSchema']);
  });

  it('shares one in-flight discovery between concurrent calls', async () => {
    const bridge = createFakeBridge();
    const provider = new EntrySchemaProvider({ bridge, logger: silent });

    const a = provider.discover();
    const b = provider.discover();
    expect(a).toBe(b);
    bridge.respond(schemaPayload());
    await a;

    expect(bridge.requests).toEqual(['requestSchema']);
  });

  it('asks Journey Builder again on Retry after a failed discovery', async () => {
    const bridge = createFakeBridge();
    const provider = new EntrySchemaProvider({ bridge, logger: silent });

    const failing = provider.discover();
    bridge.respond({ schema: [] });
    await failing;

    const retry = provider.discover();
    bridge.respond(schemaPayload());
    const result = await retry;

    expect(result.valid).toBe(true);
    expect(bridge.requests).toEqual(['requestSchema', 'requestSchema']);
  });
});
