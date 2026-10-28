import { describe, it, expect, jest } from '@jest/globals';

import { lookupEntryFieldsFromServer, SERVER_LOOKUP_TIMEOUT_MS } from '../../public/js/schema/server-field-lookup.js';

const jsonResponse = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

describe('lookupEntryFieldsFromServer (ADR-004)', () => {
  it('fetches the endpoint with the encoded event key and returns the fields', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse(200, { success: true, fields: [{ name: 'CustomerId', type: 'Text' }] }));

    const result = await lookupEntryFieldsFromServer({ eventDefinitionKey: 'ORDER_ENTRY_EVENT', fetchImpl });

    expect(result).toEqual({ ok: true, fields: [{ name: 'CustomerId', type: 'Text' }] });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('/api/entry-fields?eventDefinitionKey=ORDER_ENTRY_EVENT');
    expect(init.headers.accept).toBe('application/json');
  });

  it('encodes the event key in the query string', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse(200, { fields: [] }));

    await lookupEntryFieldsFromServer({ eventDefinitionKey: 'DE/Audience-1', fetchImpl });

    expect(fetchImpl.mock.calls[0][0]).toBe('/api/entry-fields?eventDefinitionKey=DE%2FAudience-1');
  });

  it('returns ok with an empty list when the Data Extension has no fields', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse(200, { success: true, fields: [] }));

    const result = await lookupEntryFieldsFromServer({ eventDefinitionKey: 'EMPTY', fetchImpl });

    expect(result).toEqual({ ok: true, fields: [] });
  });

  it('reports SERVER_LOOKUP_DISABLED on 501 so the typed-name fallback stays', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse(501, { success: false }));

    const result = await lookupEntryFieldsFromServer({ eventDefinitionKey: 'K', fetchImpl });

    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('SERVER_LOOKUP_DISABLED');
  });

  it('reports SERVER_LOOKUP_FAILED on other non-2xx responses', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse(502, { success: false }));

    const result = await lookupEntryFieldsFromServer({ eventDefinitionKey: 'K', fetchImpl });

    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('SERVER_LOOKUP_FAILED');
  });

  it('reports SERVER_LOOKUP_UNREACHABLE when the fetch throws', async () => {
    const fetchImpl = jest.fn(async () => {
      throw new Error('network down');
    });

    const result = await lookupEntryFieldsFromServer({ eventDefinitionKey: 'K', fetchImpl });

    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('SERVER_LOOKUP_UNREACHABLE');
  });

  it('reports SERVER_LOOKUP_INVALID when the body is not JSON', async () => {
    const fetchImpl = jest.fn(async () => ({ ok: true, status: 200, json: async () => {
      throw new Error('bad json');
    } }));

    const result = await lookupEntryFieldsFromServer({ eventDefinitionKey: 'K', fetchImpl });

    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('SERVER_LOOKUP_INVALID');
  });

  it('never throws', async () => {
    const fetchImpl = jest.fn(async () => {
      throw new Error('anything');
    });

    await expect(lookupEntryFieldsFromServer({ eventDefinitionKey: 'K', fetchImpl })).resolves.toBeDefined();
  });

  it('exports a finite timeout constant', () => {
    expect(Number.isFinite(SERVER_LOOKUP_TIMEOUT_MS)).toBe(true);
    expect(SERVER_LOOKUP_TIMEOUT_MS).toBeGreaterThan(0);
  });
});