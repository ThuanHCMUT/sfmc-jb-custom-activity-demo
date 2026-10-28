import { describe, it, expect } from '@jest/globals';

import { TemplateRepository } from '../server/repositories/templateRepository.js';
import { TemplateService } from '../server/services/templateService.js';

const service = () =>
  new TemplateService({
    templateRepository: new TemplateRepository({
      dataPath: new URL('../server/data/templates.json', import.meta.url),
    }),
  });

describe('template channel filter (server)', () => {
  it('returns every template when no channel is given', async () => {
    const all = await service().getTemplates({});

    expect(all).toHaveLength(146);
    expect(new Set(all.map((t) => t.channel))).toEqual(new Set(['SMS', 'CHATAPP', 'ZNS', 'LIVECHAT', 'BRC_ZALO']));
  });

  it('filters by display name and by code', async () => {
    const byName = await service().getTemplates({ channel: 'Zalo' });
    const byCode = await service().getTemplates({ channel: 'ZALO' });
    const byCanonical = await service().getTemplates({ channel: 'ZNS' });

    expect(byName).toHaveLength(82);
    expect(byName.every((t) => t.channel === 'ZNS')).toBe(true);
    expect(byCode).toEqual(byName);
    expect(byCanonical).toEqual(byName);
  });

  it('returns the BRC Zalo templates for "BRC Zalo"', async () => {
    const brc = await service().getTemplates({ channel: 'BRC Zalo' });

    expect(brc).toHaveLength(3);
    expect(brc.every((t) => t.channel === 'BRC_ZALO')).toBe(true);
  });

  it('returns the Live Chat templates for "Livechat"', async () => {
    const livechat = await service().getTemplates({ channel: 'Livechat' });

    expect(livechat).toHaveLength(5);
    expect(livechat.every((t) => t.channel === 'LIVECHAT')).toBe(true);
  });

  it('rejects an unsupported channel with status 400', async () => {
    await expect(service().getTemplates({ channel: 'email' })).rejects.toMatchObject({ status: 400 });
  });
});