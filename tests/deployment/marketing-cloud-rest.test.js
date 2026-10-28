import { describe, it, expect, jest } from '@jest/globals';

import { createMarketingCloudRestClient } from '../../server/services/marketing-cloud-rest.js';
import { MarketingCloudError } from '../../server/errors.js';

const silent = { info: () => {}, warn: () => {} };

const tokenResponse = { access_token: 'ACCESS_TOKEN_VALUE', expires_in: 3600 };

/** Builds a fetch double that answers the token exchange and then the REST call. */
function createFetchDouble({ token = tokenResponse, restStatus = 200, restBody = {} } = {}) {
  return jest.fn(async (url, init) => {
    if (url.endsWith('/v2/token')) {
      return { ok: true, status: 200, json: async () => token };
    }
    return { ok: restStatus >= 200 && restStatus < 300, status: restStatus, json: async () => restBody };
  });
}

const clientOptions = (fetchImpl) => ({
  clientId: 'rest-client-id',
  clientSecret: 'x'.repeat(40),
  authBaseUrl: 'https://auth.example.com',
  restBaseUrl: 'https://rest.example.com',
  fetchImpl,
  logger: silent,
});

describe('createMarketingCloudRestClient', () => {
  it('exchanges client credentials for a token and calls the event definition endpoint', async () => {
    const fetchImpl = createFetchDouble({
      restBody: { data: { dataExtension: { fields: [{ name: 'CustomerId', type: 'Text' }] } } },
    });
    const client = createMarketingCloudRestClient(clientOptions(fetchImpl));

    const { fields } = await client.getEventDefinitionFields('ORDER_ENTRY');

    expect(fields).toEqual([{ name: 'CustomerId', type: 'Text' }]);
    const [tokenUrl, tokenInit] = fetchImpl.mock.calls[0];
    expect(tokenUrl).toBe('https://auth.example.com/v2/token');
    expect(tokenInit.body).toContain('grant_type=client_credentials');
    expect(tokenInit.body).toContain('client_id=rest-client-id');
    const [restUrl, restInit] = fetchImpl.mock.calls[1];
    expect(restUrl).toBe('https://rest.example.com/interaction/v1/eventDefinitions/ORDER_ENTRY');
    expect(restInit.headers.authorization).toBe('Bearer ACCESS_TOKEN_VALUE');
  });

  it('reads Data Extension attributes from the dataevents endpoint', async () => {
    const fetchImpl = createFetchDouble({
      restBody: { items: [{ name: 'MobilePhone', dataType: 'Phone' }, { name: 'CustomerId' }] },
    });
    const client = createMarketingCloudRestClient(clientOptions(fetchImpl));

    const { fields } = await client.getDataExtensionAttributes('DE-KEY');

    expect(fields).toEqual([
      { name: 'MobilePhone', type: 'Phone' },
      { name: 'CustomerId' },
    ]);
    expect(fetchImpl.mock.calls[1][0]).toBe('https://rest.example.com/hub/v1/dataevents/DE-KEY/attributes');
  });

  it('reuses the cached token within its lifetime', async () => {
    const fetchImpl = createFetchDouble({ restBody: { fields: [{ name: 'A', type: 'Text' }] } });
    const client = createMarketingCloudRestClient(clientOptions(fetchImpl));

    await client.getEventDefinitionFields('K1');
    await client.getEventDefinitionFields('K2');

    const tokenCalls = fetchImpl.mock.calls.filter(([url]) => url.endsWith('/v2/token'));
    expect(tokenCalls).toHaveLength(1);
  });

  it('treats a 404 as an empty field list', async () => {
    const fetchImpl = createFetchDouble({ restStatus: 404, restBody: {} });
    const client = createMarketingCloudRestClient(clientOptions(fetchImpl));

    await expect(client.getEventDefinitionFields('MISSING')).resolves.toEqual({ fields: [] });
  });

  it('maps 401/403 from Marketing Cloud to a safe MarketingCloudError', async () => {
    const fetchImpl = createFetchDouble({ restStatus: 403, restBody: { message: 'insufficient scope' } });
    const client = createMarketingCloudRestClient(clientOptions(fetchImpl));

    const error = await client.getEventDefinitionFields('K').catch((e) => e);

    expect(error).toBeInstanceOf(MarketingCloudError);
    expect(error.message).not.toContain('insufficient scope');
  });

  it('maps a failed token exchange to a safe error', async () => {
    const fetchImpl = jest.fn(async () => ({ ok: false, status: 400, json: async () => ({ error: 'invalid_grant' }) }));
    const client = createMarketingCloudRestClient(clientOptions(fetchImpl));

    const error = await client.getEventDefinitionFields('K').catch((e) => e);

    expect(error).toBeInstanceOf(MarketingCloudError);
    expect(error.message).not.toContain('invalid_grant');
  });

  it('maps an unreachable host to a safe error', async () => {
    const fetchImpl = jest.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    const client = createMarketingCloudRestClient(clientOptions(fetchImpl));

    const error = await client.getEventDefinitionFields('K').catch((e) => e);

    expect(error).toBeInstanceOf(MarketingCloudError);
    expect(error.message).toContain('could not be reached');
  });

  it('drops malformed field entries and keeps only names and types', async () => {
    const fetchImpl = createFetchDouble({
      restBody: { data: { schema: [{ name: 'Valid', type: 'Text' }, { noName: true }, 'garbage', { name: '  ' }] } },
    });
    const client = createMarketingCloudRestClient(clientOptions(fetchImpl));

    const { fields } = await client.getEventDefinitionFields('K');

    expect(fields).toEqual([{ name: 'Valid', type: 'Text' }]);
  });

  it('encodes the event key in the URL', async () => {
    const fetchImpl = createFetchDouble({ restBody: { fields: [] } });
    const client = createMarketingCloudRestClient(clientOptions(fetchImpl));

    await client.getEventDefinitionFields('DE/Audience-1');

    expect(fetchImpl.mock.calls[1][0]).toBe('https://rest.example.com/interaction/v1/eventDefinitions/DE%2FAudience-1');
  });
});