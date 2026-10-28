/**
 * @jest-environment jsdom
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

import { MappingTable } from '../../public/js/ui/mapping-table.js';

const template = {
  templateKey: 'zns.1',
  displayName: 'Order Confirmation ZNS',
  channel: 'ZALO',
  addresses: [{ name: 'phone', required: true, type: 'phone' }],
  recipientFields: [{ name: 'customerId', required: true, type: 'string' }],
  params: [
    { name: 'customerName', required: true, type: 'string' },
    { name: 'amount', required: true, type: 'number' },
    { name: 'note', required: false, type: 'string' },
  ],
};

const fields = [
  { id: 'CustomerId', name: 'CustomerId', label: 'Customer ID', dataType: 'Text' },
  { id: 'CustomerName', name: 'CustomerName', label: 'Customer Name', dataType: 'Text' },
  { id: 'MobilePhone', name: 'MobilePhone', label: 'Mobile Phone', dataType: 'Phone' },
  { id: 'Phone', name: 'Phone', label: 'Phone', dataType: 'Phone' },
  { id: 'OrderAmount', name: 'OrderAmount', label: 'Order Amount', dataType: 'Decimal' },
  { id: 'Amount', name: 'Amount', label: 'Amount', dataType: 'Decimal' },
];

const autoMappings = {
  'addresses.phone': { mode: 'field', value: 'Phone' },
  customerId: { mode: 'field', value: 'CustomerId' },
  'params.customerName': { mode: 'field', value: 'CustomerName' },
  'params.amount': { mode: 'field', value: 'Amount' },
};

function setup() {
  document.body.innerHTML = `
    <table class="mapping-table">
      <thead>
        <tr>
          <th><button type="button" data-sort="type">Type</button></th>
          <th><button type="button" data-sort="name">Template Field</button></th>
          <th><button type="button" data-sort="required">Required</button></th>
          <th>Entry DE Field</th>
          <th><button type="button" data-sort="status">Status</button></th>
        </tr>
      </thead>
      <tbody id="tbody"></tbody>
    </table>
  `;
  const tbody = document.getElementById('tbody');
  const onChange = jest.fn();
  const table = new MappingTable({ tbody, onChange });
  return { table, tbody, onChange };
}

function update(table, { mappings = autoMappings, modifiedTargets = new Set() } = {}) {
  table.update({
    mappings,
    errorsByTarget: {},
    warningsByTarget: {},
    staleTargets: new Set(),
    fields,
    fieldsEnabled: true,
    modifiedTargets,
  });
}

function rows(tbody) {
  return [...tbody.querySelectorAll('tr.mapping-table__row')];
}

function chipFor(tbody, targetKey) {
  return tbody.querySelector(`[data-target-key="${targetKey}"] .status-chip`);
}

describe('MappingTable', () => {
  let ctx;

  beforeEach(() => {
    ctx = setup();
  });

  it('renders every template target as a row with its template field name', () => {
    ctx.table.render({ template });
    update(ctx.table);

    const rendered = rows(ctx.tbody);
    expect(rendered).toHaveLength(5);
    expect(rendered.map((row) => row.dataset.targetKey)).toEqual([
      'addresses.phone',
      'customerId',
      'params.customerName',
      'params.amount',
      'params.note',
    ]);
    expect(rendered[0].querySelector('.template-field').textContent).toBe('phone');
    expect(rendered[0].querySelector('.type-chip').textContent).toBe('Addr');
    expect(rendered[3].querySelector('.type-chip').textContent).toBe('Param');
  });

  it('shows the Auto state on untouched automatic matches', () => {
    ctx.table.render({ template });
    update(ctx.table);

    expect(chipFor(ctx.tbody, 'customerId').dataset.status).toBe('auto');
    expect(chipFor(ctx.tbody, 'customerId').textContent).toContain('Tự động');
    expect(chipFor(ctx.tbody, 'params.amount').dataset.status).toBe('auto');
    expect(ctx.tbody.querySelector('[data-target-key="customerId"]').dataset.status).toBe('auto');
  });

  it('shows Missing for a required field without a mapping', () => {
    ctx.table.render({ template });
    update(ctx.table, { mappings: {} });

    expect(chipFor(ctx.tbody, 'customerId').dataset.status).toBe('missing');
    expect(chipFor(ctx.tbody, 'customerId').textContent).toContain('Thiếu');
  });

  it('shows Optional for an optional field left unmapped', () => {
    ctx.table.render({ template });
    update(ctx.table, { mappings: {} });

    expect(chipFor(ctx.tbody, 'params.note').dataset.status).toBe('optional');
  });

  it('reports a manual dropdown selection and flips the status to Manual', () => {
    ctx.table.render({ template });
    update(ctx.table);

    const select = ctx.tbody.querySelector('[data-target-key="params.amount"] select');
    select.value = 'OrderAmount';
    select.dispatchEvent(new Event('change', { bubbles: true }));

    expect(ctx.onChange).toHaveBeenCalledWith('params.amount', { mode: 'field', value: 'OrderAmount' });

    update(ctx.table, {
      mappings: { ...autoMappings, 'params.amount': { mode: 'field', value: 'OrderAmount' } },
      modifiedTargets: new Set(['params.amount']),
    });

    expect(chipFor(ctx.tbody, 'params.amount').dataset.status).toBe('manual');
    expect(chipFor(ctx.tbody, 'params.amount').textContent).toContain('Thủ công');
  });

  it('shows Ambiguous when several fields match an unmapped target', () => {
    const dupFields = [
      { id: 'CustomerId', name: 'CustomerId', label: 'Customer ID', dataType: 'Text' },
      { id: 'Customer_ID', name: 'Customer_ID', label: 'Customer ID 2', dataType: 'Text' },
    ];
    ctx.table.render({ template });
    ctx.table.update({
      mappings: {},
      errorsByTarget: {},
      warningsByTarget: {},
      staleTargets: new Set(),
      fields: dupFields,
      fieldsEnabled: true,
      modifiedTargets: new Set(),
    });

    expect(chipFor(ctx.tbody, 'customerId').dataset.status).toBe('ambiguous');
    expect(chipFor(ctx.tbody, 'customerId').textContent).toContain('Mơ hồ');
  });

  it('groups rows under section headers with counts', () => {
    ctx.table.render({ template });
    update(ctx.table);

    const groups = [...ctx.tbody.querySelectorAll('tr.mapping-table__group th')];
    expect(groups.map((th) => th.textContent)).toEqual([
      'Địa chỉ (1)',
      'Trường người nhận (1)',
      'Tham số mẫu (3)',
    ]);
  });

  it('filters rows by search query', () => {
    ctx.table.render({ template });
    update(ctx.table);

    ctx.table.setFilterState({ query: 'amount', filter: 'all' });

    const visible = rows(ctx.tbody).filter((row) => !row.hidden);
    expect(visible.map((row) => row.dataset.targetKey)).toEqual(['params.amount']);

    const visibleGroups = [...ctx.tbody.querySelectorAll('tr.mapping-table__group')].filter((g) => !g.hidden);
    expect(visibleGroups).toHaveLength(1);
  });

  it('filters rows by status filter', () => {
    ctx.table.render({ template });
    update(ctx.table, { mappings: {} });

    ctx.table.setFilterState({ query: '', filter: 'missing' });

    const visible = rows(ctx.tbody).filter((row) => !row.hidden);
    expect(visible.map((row) => row.dataset.targetKey).sort()).toEqual([
      'addresses.phone',
      'customerId',
      'params.amount',
      'params.customerName',
    ]);

    ctx.table.setFilterState({ query: '', filter: 'optional' });
    const optionalVisible = rows(ctx.tbody).filter((row) => !row.hidden);
    expect(optionalVisible.map((row) => row.dataset.targetKey)).toEqual(['params.note']);
  });

  it('sorts rows by template field name and flattens groups while sorted', () => {
    ctx.table.render({ template });
    update(ctx.table);

    const nameButton = ctx.tbody.closest('table').querySelector('[data-sort="name"]');
    nameButton.click();

    expect(rows(ctx.tbody).map((row) => row.dataset.targetKey)).toEqual([
      'params.amount',
      'customerId',
      'params.customerName',
      'params.note',
      'addresses.phone',
    ]);
    expect(ctx.tbody.querySelectorAll('tr.mapping-table__group')).toHaveLength(0);

    nameButton.click();
    expect(rows(ctx.tbody).map((row) => row.dataset.targetKey)).toEqual([
      'addresses.phone',
      'params.note',
      'params.customerName',
      'customerId',
      'params.amount',
    ]);

    nameButton.click();
    expect(rows(ctx.tbody).map((row) => row.dataset.targetKey)).toEqual([
      'addresses.phone',
      'customerId',
      'params.customerName',
      'params.amount',
      'params.note',
    ]);
    expect(ctx.tbody.querySelectorAll('tr.mapping-table__group')).toHaveLength(3);
  });

  it('sorts by status putting missing rows first', () => {
    ctx.table.render({ template });
    update(ctx.table, { mappings: {} });

    const statusButton = ctx.tbody.closest('table').querySelector('[data-sort="status"]');
    statusButton.click();

    const order = rows(ctx.tbody).map((row) => row.dataset.targetKey);
    expect(order.slice(0, 4)).toEqual(
      expect.arrayContaining(['addresses.phone', 'customerId', 'params.customerName', 'params.amount'])
    );
    expect(order[4]).toBe('params.note');
  });

  it('keeps the row DOM stable across updates (no rebuild on dropdown change)', () => {
    ctx.table.render({ template });
    update(ctx.table);

    const before = rows(ctx.tbody)[0];
    update(ctx.table, {
      mappings: { ...autoMappings, 'params.amount': { mode: 'field', value: 'OrderAmount' } },
      modifiedTargets: new Set(['params.amount']),
    });

    expect(rows(ctx.tbody)[0]).toBe(before);
  });

  it('renders a typed field input when the catalog is not available and emits the typed name', () => {
    ctx.table.render({ template });
    ctx.table.update({
      mappings: { customerId: { mode: 'field', value: 'CustomerId' } },
      errorsByTarget: {},
      warningsByTarget: {},
      staleTargets: new Set(),
      fields: [],
      fieldsEnabled: false,
      modifiedTargets: new Set(),
    });

    const row = ctx.tbody.querySelector('[data-target-key="customerId"]');
    const input = row.querySelector('.de-control__typed-input');
    expect(input.closest('.de-control__typed').hidden).toBe(false);
    expect(row.querySelector('.de-control__catalog').hidden).toBe(true);
    expect(input.value).toBe('CustomerId');
    expect(row.querySelector('.de-control__hint').textContent).toBe(
      'Nhập tên trường Data Extension. Danh sách trường hiện không khả dụng.'
    );

    input.value = 'PhoneNo';
    input.dispatchEvent(new Event('change', { bubbles: true }));

    expect(ctx.onChange).toHaveBeenCalledWith('customerId', { mode: 'field', value: 'PhoneNo' });
  });

  it('shows a placeholder row when no template is selected', () => {
    ctx.table.render({ template: null });

    expect(ctx.tbody.querySelector('tr.mapping-table__empty')).not.toBeNull();
    expect(rows(ctx.tbody)).toHaveLength(0);
  });
});