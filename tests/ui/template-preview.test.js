/**
 * @jest-environment jsdom
 */

import { describe, it, expect, beforeEach } from '@jest/globals';

import { TemplatePreview } from '../../public/js/ui/templatePreview.js';

const template = {
  templateKey: 'fptlc.order-confirm.zns.6a12eabf',
  displayName: 'Order Confirmation ZNS',
  channel: 'ZNS',
  content: '{customerName} thân mến, mã đơn: {shortOrderCode}, giá trị: {amount} VND. {khongPhaiBien}',
  addresses: [{ name: 'phone', required: true, type: 'phone' }],
  recipientFields: [{ name: 'customerId', required: true, type: 'string' }],
  params: [
    { name: 'customerName', required: true, type: 'string' },
    { name: 'shortOrderCode', required: true, type: 'string' },
    { name: 'amount', required: true, type: 'number' },
    { name: 'note', required: false, type: 'string' },
  ],
};

const fields = [
  { id: 'CustomerName', name: 'CustomerName', label: 'Customer Name', dataType: 'Text' },
  { id: 'ShortOrderCode', name: 'ShortOrderCode', label: 'Short Order Code', dataType: 'Text' },
  { id: 'Amount', name: 'Amount', label: 'Amount', dataType: 'Decimal' },
];

describe('TemplatePreview', () => {
  let container;
  let preview;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
    preview = new TemplatePreview({ container });
  });

  it('renders the content and highlights every placeholder as a variable chip', () => {
    preview.render({ template, mappings: {} });

    const chips = [...container.querySelectorAll('.template-preview__var')];
    expect(chips.map((chip) => chip.dataset.variable)).toEqual(['customerName', 'shortOrderCode', 'amount', 'khongPhaiBien']);
    expect(container.querySelector('.template-preview__content').textContent).toContain('thân mến');
  });

  it('colors mapped variables green and required-unmapped variables red', () => {
    preview.render({
      template,
      mappings: {
        'params.customerName': { mode: 'field', value: 'CustomerName' },
        'params.shortOrderCode': { mode: 'static', value: 'DH123' },
      },
      fields,
    });

    const chips = [...container.querySelectorAll('.template-preview__var')];
    const byName = Object.fromEntries(chips.map((chip) => [chip.dataset.variable, chip]));

    expect(byName.customerName.className).toContain('--mapped');
    expect(byName.shortOrderCode.className).toContain('--mapped');
    expect(byName.amount.className).toContain('--missing');
    expect(byName.khongPhaiBien.className).toContain('--unknown');
  });

  it('marks a manually selected variable as mapped', () => {
    preview.render({
      template,
      mappings: { 'params.amount': { mode: 'field', value: 'Amount' } },
      fields,
      modifiedTargets: new Set(['params.amount']),
    });

    const chip = container.querySelector('[data-variable="amount"]');
    expect(chip.className).toContain('--mapped');
    expect(chip.title).toContain('params.amount');
  });

  it('colors an unmapped optional variable gray', () => {
    const withOptional = { ...template, content: 'ghi chu: {note}' };

    preview.render({ template: withOptional, mappings: {} });

    const chip = container.querySelector('[data-variable="note"]');
    expect(chip.className).toContain('--optional');
  });

  it('shows a meta line with variable counts', () => {
    preview.render({
      template,
      mappings: { 'params.customerName': { mode: 'field', value: 'CustomerName' } },
      fields,
    });

    const meta = container.querySelector('.template-preview__meta').textContent;
    expect(meta).toContain('Biến: 4');
    expect(meta).toContain('Đã ánh xạ: 1');
    expect(meta).toContain('Thiếu: 2');
    expect(meta).toContain('Không phải biến: 1');
  });

  it('renders a legend', () => {
    preview.render({ template, mappings: {} });

    expect(container.querySelectorAll('.template-preview__legend-item').length).toBe(4);
  });

  it('shows a placeholder when no template is selected', () => {
    preview.render({ template: null, mappings: {} });

    expect(container.textContent).toContain('Chọn một mẫu');
  });

  it('shows a placeholder when the template has no content', () => {
    preview.render({ template: { ...template, content: '' }, mappings: {} });

    expect(container.textContent).toContain('không có nội dung để xem trước');
  });
});