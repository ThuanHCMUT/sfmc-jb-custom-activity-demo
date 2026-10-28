import { describe, it, expect, jest } from '@jest/globals';

import { createEntryFieldsService, collectSchemaWarnings } from '../../server/services/entry-fields-service.js';
import { ValidationError } from '../../server/errors.js';
import { storedActivity } from '../helpers/stored-activity.js';

const silent = { info: () => {}, warn: () => {} };

const TEMPLATE_KEY = 'fptlc.order-confirm.zns.6a12eabf';
const TEMPLATE = {
  templateKey: TEMPLATE_KEY,
  channel: 'ZALO',
  addresses: [{ name: 'phone', required: true, type: 'phone' }],
  recipientFields: [{ name: 'customerId', required: true, type: 'string' }],
  params: [{ name: 'customerName', type: 'string' }],
};

const fields = [
  { name: 'CustomerId', type: 'Text' },
  { name: 'MobilePhone', type: 'Phone' },
];

const restClient = (overrides = {}) => ({
  getEventDefinitionFields: jest.fn(async () => ({ fields })),
  getDataExtensionAttributes: jest.fn(async () => ({ fields })),
  ...overrides,
});

describe('createEntryFieldsService', () => {
  it('is disabled when no REST client is configured', () => {
    const service = createEntryFieldsService({ restClient: null, logger: silent });

    expect(service.isEnabled()).toBe(false);
  });

  it('is enabled when a REST client is configured', () => {
    const service = createEntryFieldsService({ restClient: restClient(), logger: silent });

    expect(service.isEnabled()).toBe(true);
  });

  it('returns the field list from the REST client', async () => {
    const client = restClient();
    const service = createEntryFieldsService({ restClient: client, logger: silent });

    await expect(service.getFieldsByEventDefinitionKey('ORDER_ENTRY_EVENT')).resolves.toEqual({ fields });
    expect(client.getEventDefinitionFields).toHaveBeenCalledWith('ORDER_ENTRY_EVENT');
  });

  it('rejects an unsupported key format', async () => {
    const service = createEntryFieldsService({ restClient: restClient(), logger: silent });

    for (const bad of ['bad key!', 'has/slash', '', 'ünïcode']) {
      await expect(service.getFieldsByEventDefinitionKey(bad)).rejects.toBeInstanceOf(ValidationError);
    }
  });

  it('accepts the documented key format', async () => {
    const service = createEntryFieldsService({ restClient: restClient(), logger: silent });

    for (const good of ['DEAudience-00000000-0000-0000-0000-000000000000', 'ORDER_ENTRY_EVENT', 'key_with-dash']) {
      await expect(service.getFieldsByEventDefinitionKey(good)).resolves.toEqual({ fields });
    }
  });

  it('caches the field list per key within the TTL', async () => {
    const client = restClient();
    const service = createEntryFieldsService({ restClient: client, cacheTtlMs: 60000, logger: silent });

    await service.getFieldsByEventDefinitionKey('K');
    await service.getFieldsByEventDefinitionKey('K');

    expect(client.getEventDefinitionFields).toHaveBeenCalledTimes(1);
  });

  it('caches an empty field list so an empty Data Extension is not re-queried', async () => {
    const client = restClient({ getEventDefinitionFields: jest.fn(async () => ({ fields: [] })) });
    const service = createEntryFieldsService({ restClient: client, cacheTtlMs: 60000, logger: silent });

    await service.getFieldsByEventDefinitionKey('EMPTY_DE');
    await service.getFieldsByEventDefinitionKey('EMPTY_DE');

    expect(client.getEventDefinitionFields).toHaveBeenCalledTimes(1);
  });

  it('honors lookupMode=data-extension', async () => {
    const client = restClient();
    const service = createEntryFieldsService({ restClient: client, lookupMode: 'data-extension', logger: silent });

    await service.getFieldsByEventDefinitionKey('K');

    expect(client.getDataExtensionAttributes).toHaveBeenCalledWith('K');
    expect(client.getEventDefinitionFields).not.toHaveBeenCalled();
  });

  it('honors lookupMode=event-definition', async () => {
    const client = restClient();
    const service = createEntryFieldsService({ restClient: client, lookupMode: 'event-definition', logger: silent });

    await service.getFieldsByEventDefinitionKey('K');

    expect(client.getEventDefinitionFields).toHaveBeenCalledWith('K');
    expect(client.getDataExtensionAttributes).not.toHaveBeenCalled();
  });

  it('falls back to Data Extension attributes when the event definition has no fields (mode=both)', async () => {
    const client = restClient({ getEventDefinitionFields: jest.fn(async () => ({ fields: [] })) });
    const service = createEntryFieldsService({ restClient: client, lookupMode: 'both', logger: silent });

    await expect(service.getFieldsByEventDefinitionKey('K')).resolves.toEqual({ fields });
    expect(client.getDataExtensionAttributes).toHaveBeenCalledWith('K');
  });

  it('does not fall back when the event definition already has fields (mode=both)', async () => {
    const client = restClient();
    const service = createEntryFieldsService({ restClient: client, lookupMode: 'both', logger: silent });

    await service.getFieldsByEventDefinitionKey('K');

    expect(client.getDataExtensionAttributes).not.toHaveBeenCalled();
  });
});

describe('collectSchemaWarnings (ADR-004 Option B)', () => {
  const activity = (eventDefinitionKey, mappings) =>
    storedActivity({
      channel: 'ZALO',
      templateKey: TEMPLATE_KEY,
      templateVersion: 1,
      eventDefinitionKey,
      mappings,
    });

  it('returns no warnings when there is no event definition key', async () => {
    const warnings = await collectSchemaWarnings({
      activity: activity(null, { 'addresses.phone': { mode: 'field', value: 'MobilePhone' } }),
      templates: [TEMPLATE],
      lookupFields: jest.fn(),
    });

    expect(warnings).toEqual([]);
  });

  it('returns no warnings when there are no field mappings', async () => {
    const lookupFields = jest.fn();
    const warnings = await collectSchemaWarnings({
      activity: activity('K', { 'params.shopName': { mode: 'static', value: 'Shop' } }),
      templates: [TEMPLATE],
      lookupFields,
    });

    expect(warnings).toEqual([]);
    expect(lookupFields).not.toHaveBeenCalled();
  });

  it('returns no warnings when every typed name is in the schema', async () => {
    const warnings = await collectSchemaWarnings({
      activity: activity('K', {
        'addresses.phone': { mode: 'field', value: 'MobilePhone' },
        customerId: { mode: 'field', value: 'CustomerId' },
      }),
      templates: [TEMPLATE],
      lookupFields: async () => ({ fields }),
    });

    expect(warnings).toEqual([]);
  });

  it('warns about typed names that are not in the schema', async () => {
    const warnings = await collectSchemaWarnings({
      activity: activity('K', {
        'addresses.phone': { mode: 'field', value: 'MobilePhne' },
        customerId: { mode: 'field', value: 'CustomerId' },
      }),
      templates: [TEMPLATE],
      lookupFields: async () => ({ fields }),
    });

    expect(warnings).toEqual([
      {
        code: 'FIELD_NOT_IN_SCHEMA',
        key: 'addresses.phone',
        message: 'The field "MobilePhne" is not in the entry Data Extension schema.',
      },
    ]);
  });

  it('never throws when the lookup fails; the typed-name fallback stays', async () => {
    const warnings = await collectSchemaWarnings({
      activity: activity('K', { customerId: { mode: 'field', value: 'CustomerId' } }),
      templates: [TEMPLATE],
      lookupFields: async () => {
        throw new Error('Marketing Cloud is down');
      },
    });

    expect(warnings).toEqual([]);
  });

  it('returns no warnings when the schema is empty', async () => {
    const warnings = await collectSchemaWarnings({
      activity: activity('K', { customerId: { mode: 'field', value: 'CustomerId' } }),
      templates: [TEMPLATE],
      lookupFields: async () => ({ fields: [] }),
    });

    expect(warnings).toEqual([]);
  });

  it('returns no warnings when the template is unknown', async () => {
    const warnings = await collectSchemaWarnings({
      activity: activity('K', { customerId: { mode: 'field', value: 'CustomerId' } }),
      templates: [],
      lookupFields: jest.fn(),
    });

    expect(warnings).toEqual([]);
  });
});