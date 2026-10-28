import { describe, it, expect } from '@jest/globals';

import { ActivityState, LOAD_STATUS, SCHEMA_STATUS } from '../../public/js/state/activityState.js';
import { EntrySchemaProvider } from '../../public/js/schema/entry-schema-provider.js';
import { loadActivityIntoState, ACTIVITY_LOAD_STATUS } from '../../public/js/activity-loader.js';
import { buildUpdatedActivity, SAVE_ERROR_CODES } from '../../public/js/activity-saver.js';
import { validateMappings, VALIDATION_CODES } from '../../public/js/domain/mappingValidator.js';
import { suggestFieldMappings } from '../../public/js/domain/fieldMatching.js';
import { StandaloneAdapter } from '../../public/js/standalone-adapter.js';
import { storedActivity } from '../helpers/stored-activity.js';

/**
 * Logic-level integration scenarios. The Postmonger bridge is mocked; the provider,
 * state, loader, matcher, validator and saver are the real modules.
 */

const KEY = 'ORDER_ENTRY_EVENT';
const silent = { info: () => {}, warn: () => {} };

const template = {
  templateKey: 'fptlc.order-confirm.zns.6a12eabf',
  displayName: 'Order Confirmation ZNS',
  channel: 'ZALO',
  version: 1,
  addresses: [{ name: 'phone', required: true, type: 'phone' }],
  recipientFields: [{ name: 'customerId', required: true, type: 'string' }],
  params: [
    { name: 'customerName', required: true, type: 'string' },
    { name: 'amount', required: true, type: 'number' },
    { name: 'shopName', required: false, type: 'string' },
  ],
};

const entryFields = [
  { name: 'CustomerId', type: 'Text', ordinal: 0 },
  { name: 'CustomerName', type: 'Text', ordinal: 1 },
  { name: 'MobilePhone', type: 'Phone', ordinal: 2 },
  { name: 'OrderAmount', type: 'Decimal', ordinal: 3 },
];

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
    respond: (payload) => handler?.(payload),
  };
}

/** requestedSchema payload: one { key, name, type } entry per Data Extension field. */
const schemaFor = (fields) => ({
  schema: fields.map((field) => ({
    key: `Event.${KEY}.${field.name}`,
    name: field.name,
    type: field.type,
    length: 100,
    default: null,
    isNullable: true,
    isPrimaryKey: null,
  })),
});

/** Delivers the requestedSchema response, as Journey Builder does. */
async function discover(provider, bridge, payload) {
  const pending = provider.discover();
  bridge.respond(payload);
  return pending;
}

function editorWith(activity = null) {
  const state = new ActivityState();
  state.setTemplates([template]);
  state.setLoadStatus(LOAD_STATUS.READY);
  loadActivityIntoState({ state, activity, templates: state.getTemplates() });
  return state;
}

describe('Scenario 1: new activity with real schema', () => {
  it('discovers fields, auto-matches names, and saves a flat activity once required fields are chosen', async () => {
    const bridge = createFakeBridge();
    const provider = new EntrySchemaProvider({ bridge, logger: silent });
    const state = editorWith();
    state.setSelectedChannel('ZALO');
    state.restoreSelectedTemplate(template.templateKey);

    state.setEntrySchemaResult(await discover(provider, bridge, schemaFor(entryFields)));
    expect(state.getSchemaStatus()).toBe(SCHEMA_STATUS.READY);

    state.restoreMappings(suggestFieldMappings({ template, fields: state.getAvailableFields(), mappings: state.getMappings() }));
    expect(state.getMappings().customerId).toEqual({ mode: 'field', value: 'CustomerId' });
    expect(state.getMappings()['params.amount']).toBeUndefined();

    expect(buildUpdatedActivity({ state, activity: null, eventDefinitionKey: KEY }).ok).toBe(false);

    state.setMapping('addresses.phone', { mode: 'field', value: 'MobilePhone' });
    state.setMapping('params.amount', { mode: 'field', value: 'OrderAmount' });

    const saved = buildUpdatedActivity({ state, activity: null, eventDefinitionKey: KEY });
    expect(saved.ok).toBe(true);
    expect(saved.inArguments.find((e) => 'address__phone' in e)).toEqual({
      address__phone: '{{Event.ORDER_ENTRY_EVENT.MobilePhone}}',
    });
    expect(saved.inArguments.every((e) => Object.keys(e).length === 1)).toBe(true);
  });
});

describe('Scenario 2: reopen restores mappings', () => {
  it('restores saved mappings when the schema still contains them', async () => {
    const bridge = createFakeBridge();
    const provider = new EntrySchemaProvider({ bridge, logger: silent });
    const activity = storedActivity({
      channel: 'ZALO',
      templateKey: template.templateKey,
      eventDefinitionKey: KEY,
      mappings: {
        'addresses.phone': { mode: 'field', value: 'MobilePhone' },
        customerId: { mode: 'field', value: 'CustomerId' },
        'params.customerName': { mode: 'field', value: 'CustomerName' },
        'params.amount': { mode: 'field', value: 'OrderAmount' },
        'params.shopName': { mode: 'static', value: 'Long Chau' },
      },
    });
    const state = editorWith(activity);
    expect(state.getSavedEventDefinitionKey()).toBe(KEY);

    state.setEntrySchemaResult(await discover(provider, bridge, schemaFor(entryFields)));

    expect(state.getMissingMappedFields()).toEqual([]);
    expect(Object.keys(state.getMappings())).toHaveLength(5);
    expect(buildUpdatedActivity({ state, activity, eventDefinitionKey: KEY }).ok).toBe(true);
  });
});

describe('Scenario 3: stale mapping', () => {
  it('keeps the stale value, blocks save, and unblocks after a replacement', async () => {
    const bridge = createFakeBridge();
    const provider = new EntrySchemaProvider({ bridge, logger: silent });
    const activity = storedActivity({
      channel: 'ZALO',
      templateKey: template.templateKey,
      eventDefinitionKey: KEY,
      mappings: {
        'addresses.phone': { mode: 'field', value: 'OldPhone' },
        customerId: { mode: 'field', value: 'CustomerId' },
        'params.customerName': { mode: 'field', value: 'CustomerName' },
        'params.amount': { mode: 'field', value: 'OrderAmount' },
      },
    });
    const state = editorWith(activity);

    state.setEntrySchemaResult(await discover(provider, bridge, schemaFor(entryFields)));

    expect(state.getMissingMappedFields()).toEqual([{ targetKey: 'addresses.phone', value: 'OldPhone' }]);
    const blocked = buildUpdatedActivity({ state, activity, eventDefinitionKey: KEY });
    expect(blocked.ok).toBe(false);
    expect(blocked.errors.map((e) => e.code)).toContain(VALIDATION_CODES.SOURCE_FIELD_NOT_FOUND);

    state.setMapping('addresses.phone', { mode: 'field', value: 'MobilePhone' });
    expect(buildUpdatedActivity({ state, activity, eventDefinitionKey: KEY }).ok).toBe(true);
  });
});

describe('Scenario 4: schema unavailable', () => {
  it('accepts typed field names, keeps static mappings valid and does not block save', async () => {
    const bridge = createFakeBridge();
    const provider = new EntrySchemaProvider({ bridge, logger: silent });
    const state = editorWith();
    state.setSelectedChannel('ZALO');
    state.restoreSelectedTemplate(template.templateKey);

    state.setEntrySchemaResult(await discover(provider, bridge, { schema: null }));
    expect(state.getSchemaStatus()).toBe(SCHEMA_STATUS.UNAVAILABLE);

    state.setMapping('addresses.phone', { mode: 'field', value: 'MobilePhone' });
    state.setMapping('customerId', { mode: 'static', value: 'KH0001' });
    state.setMapping('params.customerName', { mode: 'static', value: 'Nguyen Van A' });
    state.setMapping('params.amount', { mode: 'static', value: '250000' });

    const validation = validateMappings({
      template,
      mappings: state.getMappings(),
      fieldCatalog: state.getFieldCatalog(),
      eventDefinitionKey: KEY,
    });
    expect(validation.errors).toEqual([]);
    expect(validation.valid).toBe(true);

    state.setMapping('addresses.phone', { mode: 'field', value: 'Mobile-Phone' });
    const unsafe = validateMappings({
      template,
      mappings: state.getMappings(),
      fieldCatalog: state.getFieldCatalog(),
      eventDefinitionKey: KEY,
    });
    expect(unsafe.errors.map((e) => e.code)).toEqual([VALIDATION_CODES.FIELD_NAME_INVALID]);

    state.removeMapping('addresses.phone');
    state.setMapping('addresses.phone', { mode: 'static', value: '0961234567' });
    expect(buildUpdatedActivity({ state, activity: null, eventDefinitionKey: KEY }).ok).toBe(true);
  });
});


describe('Scenario 5: discovery retry', () => {
  it('recovers after a malformed first response and populates fields on retry', async () => {
    const bridge = createFakeBridge();
    const provider = new EntrySchemaProvider({ bridge, logger: silent });
    const state = editorWith();

    state.setEntrySchemaResult(await discover(provider, bridge, 'malformed'));
    expect(state.getSchemaStatus()).toBe(SCHEMA_STATUS.ERROR);

    state.setEntrySchemaResult(await discover(provider, bridge, schemaFor(entryFields)));

    expect(state.getSchemaStatus()).toBe(SCHEMA_STATUS.READY);
    expect(state.getAvailableFields()).toHaveLength(4);
    expect(bridge.requests).toEqual(['requestSchema', 'requestSchema']);
  });
});

describe('Scenario 7: prefetch and the requestedSchema payload', () => {
  it('prefetch, then the schema payload, then discover() returns the fields', async () => {
    const bridge = createFakeBridge();
    const provider = new EntrySchemaProvider({ bridge, logger: silent });
    const state = editorWith();
    state.setSelectedChannel('ZALO');
    state.restoreSelectedTemplate(template.templateKey);

    provider.prefetch();
    bridge.respond(schemaFor(entryFields));
    state.setEntrySchemaResult(await provider.discover());

    expect(state.getSchemaStatus()).toBe(SCHEMA_STATUS.READY);
    expect(state.getEventDefinitionKey()).toBe(KEY);
    expect(state.getAvailableFields().map((f) => f.id)).toEqual(['CustomerId', 'CustomerName', 'MobilePhone', 'OrderAmount']);
    expect(bridge.requests).toEqual(['requestSchema']);
  });
});

describe('Scenario 6: standalone mode binds to the local key only', () => {
  it('discovers LOCAL_ORDER_ENTRY through the standalone adapter and binds to it', async () => {
    const fixture = {
      eventDefinitionKey: 'LOCAL_ORDER_ENTRY',
      fields: [{ name: 'MobilePhone', label: 'Mobile Phone', dataType: 'Phone' }],
    };
    const adapter = new StandaloneAdapter({ storage: null, fixtureLoader: async () => fixture });
    const provider = new EntrySchemaProvider({ bridge: adapter, logger: silent });
    const state = editorWith();
    state.setSelectedChannel('ZALO');
    state.restoreSelectedTemplate(template.templateKey);

    state.setEntrySchemaResult(await provider.discover());
    state.setMapping('addresses.phone', { mode: 'field', value: 'MobilePhone' });
    state.setMapping('customerId', { mode: 'static', value: 'K' });
    state.setMapping('params.customerName', { mode: 'static', value: 'N' });
    state.setMapping('params.amount', { mode: 'static', value: '1' });

    const saved = buildUpdatedActivity({ state, activity: null, eventDefinitionKey: state.getEventDefinitionKey() });

    expect(state.getEventDefinitionKey()).toBe('LOCAL_ORDER_ENTRY');
    expect(saved.inArguments).toContainEqual({ address__phone: '{{Event.LOCAL_ORDER_ENTRY.MobilePhone}}' });
  });

  it('never saves field bindings when the save key is missing', () => {
    const state = editorWith();
    state.setSelectedChannel('ZALO');
    state.restoreSelectedTemplate(template.templateKey);
    state.setMapping('addresses.phone', { mode: 'field', value: 'MobilePhone' });

    const saved = buildUpdatedActivity({ state, activity: null, eventDefinitionKey: null });

    expect(saved.ok).toBe(false);
    expect(saved.errors.map((e) => e.code)).toContain(VALIDATION_CODES.EVENT_DEFINITION_KEY_MISSING);
    expect(SAVE_ERROR_CODES.EVENT_DEFINITION_KEY_MISSING).toBe('EVENT_DEFINITION_KEY_MISSING');
    expect(ACTIVITY_LOAD_STATUS.NEW).toBe('new');
  });
});
