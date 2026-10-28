import { describe, it, expect } from '@jest/globals';

import {
  deriveMappingStatus,
  summarizeMappings,
  matchesMappingFilter,
  matchesMappingSearch,
  compareRows,
  MAPPING_STATUS,
  MAPPING_FILTERS,
} from '../../public/js/domain/mappingStatus.js';

const target = (overrides = {}) => ({
  key: 'params.amount',
  groupId: 'params',
  name: 'amount',
  required: true,
  type: 'number',
  isRouting: false,
  ...overrides,
});

const fields = [
  { id: 'CustomerId', name: 'CustomerId', label: 'Customer ID', dataType: 'Text' },
  { id: 'CustomerName', name: 'CustomerName', label: 'Customer Name', dataType: 'Text' },
  { id: 'MobilePhone', name: 'MobilePhone', label: 'Mobile Phone', dataType: 'Phone' },
  { id: 'Phone', name: 'Phone', label: 'Phone', dataType: 'Phone' },
  { id: 'OrderAmount', name: 'OrderAmount', label: 'Order Amount', dataType: 'Decimal' },
  { id: 'Amount', name: 'Amount', label: 'Amount', dataType: 'Decimal' },
];

describe('deriveMappingStatus', () => {
  it('marks a unique automatic match as Auto when the user did not touch it', () => {
    const status = deriveMappingStatus({
      target: target({ name: 'customerId', key: 'customerId' }),
      mapping: { mode: 'field', value: 'CustomerId' },
      fields,
    });
    expect(status).toBe(MAPPING_STATUS.AUTO);
  });

  it('marks a mapping as Manual once the user modified the target', () => {
    const status = deriveMappingStatus({
      target: target({ name: 'customerId', key: 'customerId' }),
      mapping: { mode: 'field', value: 'CustomerId' },
      fields,
      modifiedTargets: new Set(['customerId']),
    });
    expect(status).toBe(MAPPING_STATUS.MANUAL);
  });

  it('marks a mapping as Manual when it differs from the automatic suggestion', () => {
    const status = deriveMappingStatus({
      target: target({ name: 'customerId', key: 'customerId' }),
      mapping: { mode: 'field', value: 'MobilePhone' },
      fields,
    });
    expect(status).toBe(MAPPING_STATUS.MANUAL);
  });

  it('marks a static mapping as Manual', () => {
    const status = deriveMappingStatus({
      target,
      mapping: { mode: 'static', value: 'fixed' },
      fields,
    });
    expect(status).toBe(MAPPING_STATUS.MANUAL);
  });

  it('marks a stale mapping (field gone from the schema) as Manual', () => {
    const status = deriveMappingStatus({
      target,
      mapping: { mode: 'field', value: 'GoneField' },
      fields,
    });
    expect(status).toBe(MAPPING_STATUS.MANUAL);
  });

  it('marks an unmapped required target as Missing', () => {
    expect(deriveMappingStatus({ target: target({ required: true }), mapping: null, fields })).toBe(
      MAPPING_STATUS.MISSING
    );
  });

  it('marks an unmapped routing target as Missing even when not flagged required', () => {
    expect(
      deriveMappingStatus({ target: target({ required: false, isRouting: true }), mapping: null, fields })
    ).toBe(MAPPING_STATUS.MISSING);
  });

  it('marks an unmapped optional target as Optional', () => {
    expect(deriveMappingStatus({ target: target({ required: false }), mapping: null, fields })).toBe(
      MAPPING_STATUS.OPTIONAL
    );
  });

  it('marks an unmapped target with several matching fields as Ambiguous', () => {
    const dupFields = [
      { id: 'CustomerId', name: 'CustomerId' },
      { id: 'Customer_ID', name: 'Customer_ID' },
    ];
    expect(
      deriveMappingStatus({ target: target({ name: 'customerId', key: 'customerId' }), mapping: null, fields: dupFields })
    ).toBe(MAPPING_STATUS.AMBIGUOUS);
  });
});

describe('summarizeMappings', () => {
  const template = {
    templateKey: 'zns.1',
    channel: 'ZALO',
    addresses: [{ name: 'phone', required: true }],
    recipientFields: [{ name: 'customerId', required: true }],
    params: [
      { name: 'customerName', required: true },
      { name: 'amount', required: true },
      { name: 'note', required: false },
    ],
  };

  it('counts total, mapped, auto, manual and missing buckets', () => {
    const counts = summarizeMappings({
      template,
      mappings: {
        'addresses.phone': { mode: 'field', value: 'Phone' },
        customerId: { mode: 'field', value: 'CustomerId' },
        'params.customerName': { mode: 'field', value: 'CustomerName' },
        'params.amount': { mode: 'field', value: 'Amount' },
      },
      fields,
    });

    expect(counts).toEqual({
      total: 5,
      mapped: 4,
      auto: 4,
      manual: 0,
      missing: 0,
      ambiguous: 0,
      optional: 1,
    });
  });

  it('counts manual mappings separately and keeps mapped + missing + optional = total', () => {
    const counts = summarizeMappings({
      template,
      mappings: {
        'addresses.phone': { mode: 'field', value: 'Phone' },
        customerId: { mode: 'field', value: 'OrderAmount' },
        'params.amount': { mode: 'static', value: '42' },
      },
      fields,
      modifiedTargets: new Set(['customerId', 'params.amount']),
    });

    expect(counts.mapped).toBe(3);
    expect(counts.auto).toBe(1);
    expect(counts.manual).toBe(2);
    expect(counts.missing).toBe(1);
    expect(counts.optional).toBe(1);
    expect(counts.mapped + counts.missing + counts.optional).toBe(counts.total);
  });

  it('counts ambiguous rows in the missing bucket', () => {
    const dupFields = [
      { id: 'CustomerId', name: 'CustomerId' },
      { id: 'Customer_ID', name: 'Customer_ID' },
    ];
    const counts = summarizeMappings({ template, mappings: {}, fields: dupFields });

    expect(counts.ambiguous).toBe(1);
    expect(counts.missing).toBe(4);
    expect(counts.mapped).toBe(0);
  });

  it('returns zeroed counts without a template', () => {
    expect(summarizeMappings({ template: null, mappings: {} })).toEqual({
      total: 0,
      mapped: 0,
      auto: 0,
      manual: 0,
      missing: 0,
      ambiguous: 0,
      optional: 0,
    });
  });
});

describe('matchesMappingFilter', () => {
  const row = (status, required = true) => ({
    target: target({ required, isRouting: false }),
    status,
  });

  it('passes everything for All', () => {
    expect(matchesMappingFilter(row(MAPPING_STATUS.MISSING), MAPPING_FILTERS.ALL)).toBe(true);
    expect(matchesMappingFilter(row(MAPPING_STATUS.OPTIONAL, false), MAPPING_FILTERS.ALL)).toBe(true);
  });

  it('selects required and routing targets for Required', () => {
    expect(matchesMappingFilter(row(MAPPING_STATUS.AUTO), MAPPING_FILTERS.REQUIRED)).toBe(true);
    expect(matchesMappingFilter(row(MAPPING_STATUS.AUTO, false), MAPPING_FILTERS.REQUIRED)).toBe(false);
    expect(
      matchesMappingFilter(
        { target: target({ required: false, isRouting: true }), status: MAPPING_STATUS.MISSING },
        MAPPING_FILTERS.REQUIRED
      )
    ).toBe(true);
  });

  it('selects non-required, non-routing targets for Optional', () => {
    expect(matchesMappingFilter(row(MAPPING_STATUS.OPTIONAL, false), MAPPING_FILTERS.OPTIONAL)).toBe(true);
    expect(matchesMappingFilter(row(MAPPING_STATUS.AUTO), MAPPING_FILTERS.OPTIONAL)).toBe(false);
  });

  it('selects Missing and Ambiguous rows for Missing', () => {
    expect(matchesMappingFilter(row(MAPPING_STATUS.MISSING), MAPPING_FILTERS.MISSING)).toBe(true);
    expect(matchesMappingFilter(row(MAPPING_STATUS.AMBIGUOUS), MAPPING_FILTERS.MISSING)).toBe(true);
    expect(matchesMappingFilter(row(MAPPING_STATUS.AUTO), MAPPING_FILTERS.MISSING)).toBe(false);
  });

  it('selects Auto and Manual rows for Mapped', () => {
    expect(matchesMappingFilter(row(MAPPING_STATUS.AUTO), MAPPING_FILTERS.MAPPED)).toBe(true);
    expect(matchesMappingFilter(row(MAPPING_STATUS.MANUAL), MAPPING_FILTERS.MAPPED)).toBe(true);
    expect(matchesMappingFilter(row(MAPPING_STATUS.MISSING), MAPPING_FILTERS.MAPPED)).toBe(false);
  });
});

describe('matchesMappingSearch', () => {
  const row = (overrides = {}) => ({
    target: target({ name: 'customerName', groupId: 'params', type: 'string' }),
    mapping: { mode: 'field', value: 'CustomerName' },
    field: { id: 'CustomerName', name: 'CustomerName', label: 'Customer Name', dataType: 'Text' },
    ...overrides,
  });

  it('matches the template field name', () => {
    expect(matchesMappingSearch(row(), 'customerName')).toBe(true);
    expect(matchesMappingSearch(row(), 'customer')).toBe(true);
  });

  it('matches the DE field name, label and id', () => {
    expect(matchesMappingSearch(row(), 'CustomerName')).toBe(true);
    expect(matchesMappingSearch(row(), 'Customer Name')).toBe(true);
  });

  it('matches the group title (type)', () => {
    expect(matchesMappingSearch(row(), 'params')).toBe(true);
    expect(matchesMappingSearch(row(), 'param')).toBe(true);
  });

  it('matches the static value', () => {
    expect(
      matchesMappingSearch(
        row({ mapping: { mode: 'static', value: 'KH-0001' }, field: null }),
        'kh-0001'
      )
    ).toBe(true);
  });

  it('returns true for an empty query', () => {
    expect(matchesMappingSearch(row(), '')).toBe(true);
    expect(matchesMappingSearch(row(), '   ')).toBe(true);
  });

  it('returns false when nothing matches', () => {
    expect(matchesMappingSearch(row(), 'zzz')).toBe(false);
  });
});

describe('compareRows', () => {
  const view = (targetOverrides, status) => ({ target: target(targetOverrides), status });

  it('sorts by template field name ascending and descending', () => {
    const a = view({ name: 'amount' }, MAPPING_STATUS.AUTO);
    const b = view({ name: 'customerName' }, MAPPING_STATUS.AUTO);
    expect(compareRows(a, b, 'name', 'asc')).toBeLessThan(0);
    expect(compareRows(b, a, 'name', 'asc')).toBeGreaterThan(0);
    expect(compareRows(a, b, 'name', 'desc')).toBeGreaterThan(0);
  });

  it('sorts by group id for the type key', () => {
    const addr = view({ groupId: 'addresses' }, MAPPING_STATUS.AUTO);
    const param = view({ groupId: 'params' }, MAPPING_STATUS.AUTO);
    expect(compareRows(addr, param, 'type', 'asc')).toBeLessThan(0);
  });

  it('puts required targets first for the required key', () => {
    const req = view({ required: true }, MAPPING_STATUS.AUTO);
    const opt = view({ required: false }, MAPPING_STATUS.AUTO);
    expect(compareRows(req, opt, 'required', 'asc')).toBeLessThan(0);
    expect(compareRows(req, opt, 'required', 'desc')).toBeGreaterThan(0);
  });

  it('sorts by status order (missing first) for the status key', () => {
    const missing = view({}, MAPPING_STATUS.MISSING);
    const auto = view({}, MAPPING_STATUS.AUTO);
    expect(compareRows(missing, auto, 'status', 'asc')).toBeLessThan(0);
    expect(compareRows(missing, auto, 'status', 'desc')).toBeGreaterThan(0);
  });
});