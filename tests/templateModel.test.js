import { describe, it, expect } from '@jest/globals';

import {
  createTemplateModel,
  findTemplateProblems,
  SUPPORTED_CHANNELS,
  toChannelCode,
} from '../server/models/templateModel.js';

const validRaw = {
  templateKey: 'k.sms.1',
  displayName: 'SMS',
  channel: 'sms',
  addresses: [{ name: 'phone' }],
  params: [{ name: 'shopName' }],
};

describe('templateModel', () => {
  it('supports exactly the five channel codes', () => {
    expect([...SUPPORTED_CHANNELS]).toEqual(['ZNS', 'CHATAPP', 'SMS', 'LIVECHAT', 'BRC_ZALO']);
  });

  it('normalizes display names to channel codes', () => {
    expect(toChannelCode('SMS')).toBe('SMS');
    expect(toChannelCode('ChatApp')).toBe('CHATAPP');
    expect(toChannelCode('Zalo')).toBe('ZNS');
    expect(toChannelCode('ZNS')).toBe('ZNS');
    expect(toChannelCode('Livechat')).toBe('LIVECHAT');
    expect(toChannelCode('BRC Zalo')).toBe('BRC_ZALO');
    expect(toChannelCode('brc_zalo')).toBe('BRC_ZALO');
    expect(toChannelCode('email')).toBeNull();
  });

  it('stores the normalized channel code in the model', () => {
    expect(createTemplateModel({ ...validRaw, channel: 'BRC Zalo' }).channel).toBe('BRC_ZALO');
  });

  it('accepts a valid template', () => {
    expect(findTemplateProblems(validRaw)).toEqual([]);
  });

  it.each(['templateKey', 'displayName'])('reports missing %s', (field) => {
    const raw = { ...validRaw, [field]: '' };
    expect(findTemplateProblems(raw).join(' ')).toMatch(new RegExp(`${field} is required`));
  });

  it('rejects unsupported channels', () => {
    expect(findTemplateProblems({ ...validRaw, channel: 'fax' })).toHaveLength(1);
  });

  it('requires addresses and params to be arrays', () => {
    const problems = findTemplateProblems({ ...validRaw, addresses: 'phone', params: undefined });
    expect(problems).toEqual(
      expect.arrayContaining(['addresses must be an array', 'params must be an array'])
    );
  });

  it('requires every address and param to have a name', () => {
    const problems = findTemplateProblems({ ...validRaw, params: [{ type: 'string' }] });
    expect(problems).toContain('every param needs a non-empty name');
  });

  it('rejects non-object input', () => {
    expect(findTemplateProblems(null)).toEqual(['template must be an object']);
    expect(findTemplateProblems([])).toEqual(['template must be an object']);
  });

  it('creates a frozen model with defaults applied', () => {
    const model = createTemplateModel(validRaw);

    expect(model.version).toBe(1);
    expect(model.recipientFields).toEqual([]);
    expect(model.content).toBe('');
    expect(Object.isFrozen(model)).toBe(true);
    expect(Object.isFrozen(model.params)).toBe(true);
  });

  it('passes register metadata fields through the model', () => {
    const raw = {
      ...validRaw,
      templateId: '6BD33665-97CD-46D1-0819-3A1DD82B8F08',
      registerRow: 3,
      strategy: { primary: 'ZNS', fallback: 'SMS', role: 'primary' },
      failover: { channel: 'SMS' },
      usecase: '[CDP] Campaign',
      hubSubstitutedVariables: ['customer_name'],
    };
    const model = createTemplateModel(raw);

    expect(model.templateId).toBe(raw.templateId);
    expect(model.registerRow).toBe(3);
    expect(model.strategy).toEqual(raw.strategy);
    expect(model.failover).toEqual(raw.failover);
    expect(model.usecase).toBe(raw.usecase);
    expect(model.hubSubstitutedVariables).toEqual(raw.hubSubstitutedVariables);
    expect(Object.isFrozen(model.strategy)).toBe(true);
    expect(Object.isFrozen(model.hubSubstitutedVariables)).toBe(true);
  });

  it('keeps the template content in the model', () => {
    const model = createTemplateModel({ ...validRaw, content: 'Chao {customerName}, don hang {orderCode}' });

    expect(model.content).toBe('Chao {customerName}, don hang {orderCode}');
  });

  it('rejects a non-string template content', () => {
    expect(findTemplateProblems({ ...validRaw, content: 42 }).join(' ')).toMatch(/content must be a string/);
  });

  it('accepts an empty content string', () => {
    expect(findTemplateProblems({ ...validRaw, content: '' })).toEqual([]);
  });
});
