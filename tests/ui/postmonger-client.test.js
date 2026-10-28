import { describe, it, expect, jest } from '@jest/globals';

import { PostmongerClient } from '../../public/js/postmonger-client.js';
import { EntrySchemaProvider } from '../../public/js/schema/entry-schema-provider.js';

const silent = { info: () => {}, warn: () => {} };

/**
 * Fake Postmonger SDK: records outgoing triggers and lets tests fire incoming
 * events exactly like Journey Builder would.
 */
function createFakePostmonger() {
  const listeners = new Map();
  const triggers = [];
  const sessions = [];

  class FakeSession {
    constructor() {
      this.ended = false;
      sessions.push(this);
    }

    on(event, callback) {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event).push(callback);
    }

    trigger(event, ...args) {
      triggers.push({ event, args });
    }

    end() {
      this.ended = true;
    }
  }

  return {
    Postmonger: { Session: FakeSession },
    listeners,
    triggers,
    sessions,
    fire(event, ...args) {
      for (const callback of listeners.get(event) ?? []) {
        callback(...args);
      }
    },
  };
}

describe('PostmongerClient', () => {
  it('requires the Postmonger SDK', () => {
    expect(() => new PostmongerClient({ Postmonger: null })).toThrow(/Postmonger SDK is not available/);
  });

  it('registers listeners once and triggers ready on initialize', () => {
    const fake = createFakePostmonger();
    const client = new PostmongerClient({ Postmonger: fake.Postmonger });

    client.initialize();
    client.initialize();

    expect(fake.triggers.filter((entry) => entry.event === 'ready')).toHaveLength(1);
    for (const event of ['initActivity', 'clickedNext', 'clickedBack', 'clickedGotoStep', 'requestedSchema']) {
      expect(fake.listeners.get(event)).toHaveLength(1);
    }
  });

  it('delivers initActivity to registered handlers', () => {
    const fake = createFakePostmonger();
    const client = new PostmongerClient({ Postmonger: fake.Postmonger });
    const handler = jest.fn();

    client.initialize();
    client.onInitActivity(handler);
    fake.fire('initActivity', { key: 'a1' });

    expect(handler).toHaveBeenCalledWith({ key: 'a1' });
  });

  it('does not duplicate handlers when the same callback is registered twice', () => {
    const fake = createFakePostmonger();
    const client = new PostmongerClient({ Postmonger: fake.Postmonger });
    const handler = jest.fn();

    client.initialize();
    client.onClickedNext(handler);
    client.onClickedNext(handler);
    fake.fire('clickedNext');

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('forwards clickedNext, clickedBack and clickedGotoStep', () => {
    const fake = createFakePostmonger();
    const client = new PostmongerClient({ Postmonger: fake.Postmonger });
    const next = jest.fn();
    const back = jest.fn();
    const step = jest.fn();

    client.initialize();
    client.onClickedNext(next);
    client.onClickedBack(back);
    client.onGotoStep(step);

    fake.fire('clickedNext');
    fake.fire('clickedBack');
    fake.fire('clickedGotoStep', 2, null);

    expect(next).toHaveBeenCalledTimes(1);
    expect(back).toHaveBeenCalledTimes(1);
    expect(step).toHaveBeenCalledWith(2, null);
  });

  it('triggers updateActivity, updateButton, nextStep and previousStep', () => {
    const fake = createFakePostmonger();
    const client = new PostmongerClient({ Postmonger: fake.Postmonger });

    client.initialize();
    client.updateActivity({ key: 'a1' });
    client.updateButton({ button: 'next', enabled: true });
    client.nextStep();
    client.previousStep();

    expect(fake.triggers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ event: 'updateActivity', args: [{ key: 'a1' }] }),
        expect.objectContaining({ event: 'updateButton', args: [{ button: 'next', enabled: true }] }),
        expect.objectContaining({ event: 'nextStep', args: [] }),
        expect.objectContaining({ event: 'previousStep', args: [] }),
      ])
    );
  });

  it('requests the schema', () => {
    const fake = createFakePostmonger();
    const client = new PostmongerClient({ Postmonger: fake.Postmonger });

    client.initialize();
    client.requestSchema();

    expect(fake.triggers).toEqual(expect.arrayContaining([expect.objectContaining({ event: 'requestSchema' })]));
  });

  it('delivers the requestedSchema response', () => {
    const fake = createFakePostmonger();
    const client = new PostmongerClient({ Postmonger: fake.Postmonger });
    const handler = jest.fn();

    client.initialize();
    client.onRequestedSchema(handler);
    fake.fire('requestedSchema', { schema: [] });

    expect(handler).toHaveBeenCalledWith({ schema: [] });
  });

  it('prefetch sends requestSchema once, without waiting', () => {
    const fake = createFakePostmonger();
    const client = new PostmongerClient({ Postmonger: fake.Postmonger });
    const provider = new EntrySchemaProvider({ bridge: client, logger: silent });

    client.initialize();
    provider.prefetch();

    const sent = fake.triggers.map((entry) => entry.event);
    expect(sent.filter((event) => event === 'requestSchema')).toHaveLength(1);
  });

  it('dispatches the requestedSchema payload to the provider through the SDK listener', async () => {
    const fake = createFakePostmonger();
    const client = new PostmongerClient({ Postmonger: fake.Postmonger });
    const provider = new EntrySchemaProvider({ bridge: client, logger: silent });

    client.initialize();
    provider.prefetch();
    fake.fire('requestedSchema', {
      schema: [
        {
          key: 'Event.DEAudience-TestEntry-0001.Phone',
          name: 'Phone',
          type: 'Phone',
          length: 20,
          default: null,
          isNullable: true,
          isPrimaryKey: null,
        },
      ],
    });

    const result = await provider.discover();

    expect(result.valid).toBe(true);
    expect(result.eventDefinitionKey).toBe('DEAudience-TestEntry-0001');
    expect(result.fields.map((f) => f.id)).toEqual(['Phone']);
  });

  it('throws when triggering before initialize', () => {
    const fake = createFakePostmonger();
    const client = new PostmongerClient({ Postmonger: fake.Postmonger });

    expect(() => client.updateActivity({})).toThrow(/not initialized/);
  });

  it('tears down the session on destroy', () => {
    const fake = createFakePostmonger();
    const client = new PostmongerClient({ Postmonger: fake.Postmonger });

    client.initialize();
    client.destroy();

    expect(fake.sessions).toHaveLength(1);
    expect(fake.sessions[0].ended).toBe(true);

    // A destroyed client can be re-initialized as a fresh session.
    client.initialize();
    expect(fake.sessions).toHaveLength(2);
    expect(fake.triggers.filter((entry) => entry.event === 'ready')).toHaveLength(2);
  });
});