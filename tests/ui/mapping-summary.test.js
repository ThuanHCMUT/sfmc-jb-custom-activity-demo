/**
 * @jest-environment jsdom
 */

import { describe, it, expect, beforeEach } from '@jest/globals';

import { MappingSummary } from '../../public/js/ui/mapping-summary.js';

const template = {
  templateKey: 'zns.1',
  displayName: 'Order Confirmation ZNS',
  channel: 'ZNS',
  addresses: [{ name: 'phone', required: true }],
  recipientFields: [{ name: 'customerId', required: true }],
  params: [
    { name: 'customerName', required: true },
    { name: 'amount', required: true },
    { name: 'note', required: false },
  ],
};

const fields = [
  { id: 'CustomerId', name: 'CustomerId', label: 'Customer ID', dataType: 'Text' },
  { id: 'CustomerName', name: 'CustomerName', label: 'Customer Name', dataType: 'Text' },
  { id: 'Phone', name: 'Phone', label: 'Phone', dataType: 'Phone' },
  { id: 'Amount', name: 'Amount', label: 'Amount', dataType: 'Decimal' },
];

describe('MappingSummary', () => {
  let container;
  let summary;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
    summary = new MappingSummary({ container });
  });

  it('renders the template name and channel', () => {
    summary.render({ template, mappings: {} });

    const facts = [...container.querySelectorAll('.mapping-summary__fact')];
    expect(facts[0].textContent).toContain('Order Confirmation ZNS');
    expect(facts[1].textContent).toContain('Zalo');
  });

  it('counts auto, manual, missing and optional rows', () => {
    summary.render({
      template,
      mappings: {
        'addresses.phone': { mode: 'field', value: 'Phone' },
        customerId: { mode: 'field', value: 'CustomerId' },
        'params.customerName': { mode: 'field', value: 'CustomerName' },
        'params.amount': { mode: 'static', value: '42' },
      },
      fields,
      modifiedTargets: new Set(['params.amount']),
    });

    const counts = [...container.querySelectorAll('.mapping-summary__count dd')].map((el) => el.textContent);
    expect(counts).toEqual(['5', '4', '3', '1', '0']);
  });

  it('updates the counts when a mapping changes', () => {
    summary.render({ template, mappings: {}, fields });
    let counts = [...container.querySelectorAll('.mapping-summary__count dd')].map((el) => el.textContent);
    expect(counts).toEqual(['5', '0', '0', '0', '4']);

    summary.render({
      template,
      mappings: { customerId: { mode: 'field', value: 'CustomerId' } },
      fields,
    });
    counts = [...container.querySelectorAll('.mapping-summary__count dd')].map((el) => el.textContent);
    expect(counts).toEqual(['5', '1', '1', '0', '3']);
  });

  it('renders nothing without a template', () => {
    summary.render({ template: null, mappings: {} });
    expect(container.children).toHaveLength(0);
  });
});