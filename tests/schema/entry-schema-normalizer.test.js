import { describe, it, expect } from '@jest/globals';

import {
  normalizeSchemaPayload,
  normalizeFieldList,
  normalizeField,
  describeStructure,
  SCHEMA_ERROR_CODES,
  SCHEMA_WARNING_CODES,
} from '../../public/js/schema/entry-schema-normalizer.js';

const KEY = 'DEAudience-TestEntry-0001';

/** One entry of the requestedSchema payload, in the Journey Builder form. */
const rawField = (name, overrides = {}) => ({
  key: `Event.${KEY}.${name}`,
  name,
  type: 'Text',
  length: 100,
  default: null,
  isNullable: true,
  isPrimaryKey: null,
  ...overrides,
});

/** The live payload shape Journey Builder returned for the DEAudience entry source. */
const livePayload = {
  schema: [rawField('ContactKey'), rawField('Phone', { length: 20 }), rawField('Voucher')],
};

describe('normalizeSchemaPayload (requestedSchema)', () => {
  it('derives the event definition key from the field key', () => {
    const result = normalizeSchemaPayload(livePayload);

    expect(result.eventDefinitionKey).toBe(KEY);
    expect(result.fieldList).toHaveLength(3);
    expect(result.error).toBeNull();
  });

  it('keeps the whole schema array as the field list', () => {
    const result = normalizeSchemaPayload(livePayload);

    expect(result.fieldList.map((f) => f.name)).toEqual(['ContactKey', 'Phone', 'Voucher']);
  });

  it('takes the key from the middle segment even when the field name is the last segment', () => {
    const result = normalizeSchemaPayload({ schema: [{ key: 'Event.ORDER_ENTRY_EVENT.CustomerId', name: 'CustomerId', type: 'Text' }] });

    expect(result.eventDefinitionKey).toBe('ORDER_ENTRY_EVENT');
  });

  it.each([
    ['an empty schema array', { schema: [] }],
    ['a null schema (DEAudience without fields)', { schema: null, eventDefinitionKey: 'K' }],
    ['a missing schema property', { eventDefinitionKey: 'K' }],
    ['a legacy dataExtensionFields list', { eventDefinitionKey: 'K', dataExtensionFields: [rawField('A')] }],
  ])('returns SCHEMA_NOT_AVAILABLE for %s', (_label, payload) => {
    const result = normalizeSchemaPayload(payload);

    expect(result.eventDefinitionKey).toBeNull();
    expect(result.error.code).toBe(SCHEMA_ERROR_CODES.SCHEMA_NOT_AVAILABLE);
  });

  it('returns EVENT_DEFINITION_KEY_MISSING when no field key can be parsed', () => {
    const result = normalizeSchemaPayload({ schema: [{ name: 'Phone', type: 'Text' }] });

    expect(result.eventDefinitionKey).toBeNull();
    expect(result.error.code).toBe(SCHEMA_ERROR_CODES.EVENT_DEFINITION_KEY_MISSING);
  });

  it('returns EVENT_DEFINITION_KEY_INVALID for unsafe key characters', () => {
    const result = normalizeSchemaPayload({ schema: [rawField('Phone', { key: 'Event.KEY }} evil.Phone' })] });

    expect(result.eventDefinitionKey).toBeNull();
    expect(result.error.code).toBe(SCHEMA_ERROR_CODES.EVENT_DEFINITION_KEY_INVALID);
  });

  it.each([
    ['null payload', null],
    ['string payload', 'text'],
    ['array payload', []],
  ])('returns INVALID_EVENT_DEFINITION for %s', (_label, payload) => {
    const result = normalizeSchemaPayload(payload);

    expect(result.eventDefinitionKey).toBeNull();
    expect(result.error.code).toBe(SCHEMA_ERROR_CODES.INVALID_EVENT_DEFINITION);
  });
});

describe('normalizeField', () => {
  it('produces the normalized field model from a live entry', () => {
    const field = normalizeField(rawField('Phone', { length: 20, isNullable: false, isPrimaryKey: false }));

    expect(field).toMatchObject({
      id: 'Phone',
      name: 'Phone',
      label: 'Phone',
      dataType: 'Text',
      source: 'entryEvent',
      bindingPath: 'Phone',
      nullable: false,
      length: 20,
      isPrimaryKey: false,
    });
  });

  it('maps the Journey Builder type names onto the internal type system', () => {
    expect(normalizeField({ name: 'MobilePhone', type: 'Phone' }).dataType).toBe('Phone');
    expect(normalizeField({ name: 'OrderAmount', type: 'Decimal' }).dataType).toBe('Decimal');
    expect(normalizeField({ name: 'Email', type: 'EmailAddress' }).dataType).toBe('Email');
  });

  it('humanizes the label from the name', () => {
    expect(normalizeField({ name: 'CustomerId', type: 'Text' }).label).toBe('Customer Id');
  });

  it('derives the name from the last segment of the key when name is absent', () => {
    expect(normalizeField({ key: 'Event.ORDER_ENTRY_EVENT.CustomerId', type: 'Text' }).id).toBe('CustomerId');
  });

  it('returns null for entries without a usable name', () => {
    expect(normalizeField(null)).toBeNull();
    expect(normalizeField('Phone')).toBeNull();
    expect(normalizeField({ type: 'Text' })).toBeNull();
    expect(normalizeField({ name: '1bad' })).toBeNull();
    expect(normalizeField({ name: 'has space' })).toBeNull();
  });
});

describe('normalizeFieldList', () => {
  it('returns SCHEMA_NOT_AVAILABLE for an empty or non-array list', () => {
    expect(normalizeFieldList([], KEY).error.code).toBe(SCHEMA_ERROR_CODES.SCHEMA_NOT_AVAILABLE);
    expect(normalizeFieldList(undefined, KEY).error.code).toBe(SCHEMA_ERROR_CODES.SCHEMA_NOT_AVAILABLE);
  });

  it('normalizes the live payload into three fields in source order', () => {
    const result = normalizeFieldList(livePayload.schema, KEY);

    expect(result.valid).toBe(true);
    expect(result.eventDefinitionKey).toBe(KEY);
    expect(result.fields.map((f) => f.id)).toEqual(['ContactKey', 'Phone', 'Voucher']);
    expect(result.warnings).toEqual([]);
  });

  it('skips a malformed field and records a warning', () => {
    const result = normalizeFieldList([rawField('ContactKey'), { type: 'Text' }, rawField('Voucher')], KEY);

    expect(result.fields.map((f) => f.id)).toEqual(['ContactKey', 'Voucher']);
    expect(result.warnings).toContainEqual(expect.objectContaining({ code: SCHEMA_WARNING_CODES.FIELD_SKIPPED, index: 1 }));
  });

  it('skips a field that belongs to another event definition', () => {
    const foreign = rawField('Other', { key: 'Event.ANOTHER_ENTRY.Other' });
    const result = normalizeFieldList([rawField('Phone'), foreign], KEY);

    expect(result.fields.map((f) => f.id)).toEqual(['Phone']);
    expect(result.warnings).toContainEqual(expect.objectContaining({ code: SCHEMA_WARNING_CODES.FIELD_SKIPPED, index: 1 }));
  });

  it('removes duplicate fields (first occurrence wins) with a warning', () => {
    const result = normalizeFieldList([rawField('Phone', { type: 'Phone' }), rawField('Phone', { type: 'Text' })], KEY);

    expect(result.fields).toHaveLength(1);
    expect(result.fields[0].dataType).toBe('Phone');
    expect(result.warnings).toContainEqual(expect.objectContaining({ code: SCHEMA_WARNING_CODES.DUPLICATE_FIELD }));
  });

  it('maps an unknown type to Unknown with a warning, without rejecting the schema', () => {
    const result = normalizeFieldList([rawField('Mystery', { type: 'Locale' })], KEY);

    expect(result.valid).toBe(true);
    expect(result.fields[0].dataType).toBe('Unknown');
    expect(result.warnings).toContainEqual(expect.objectContaining({ code: SCHEMA_WARNING_CODES.UNKNOWN_FIELD_TYPE }));
  });

  it('does not mutate the raw input', () => {
    const raw = [rawField('Phone'), rawField('Voucher')];
    const snapshot = JSON.parse(JSON.stringify(raw));

    normalizeFieldList(raw, KEY);

    expect(raw).toEqual(snapshot);
  });
});

describe('describeStructure (development logging)', () => {
  it('describes property names and types, never values', () => {
    const description = describeStructure({ schema: [{ key: `Event.${KEY}.Email`, type: 'Text' }] });

    expect(description).toContain('schema:array(1)');
    expect(description).not.toContain(KEY);
    expect(description).not.toContain('Email');
  });
});
