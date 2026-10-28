import { describe, it, expect, beforeAll } from '@jest/globals';
import request from 'supertest';

import { createApp } from '../../server/app.js';
import { createContainer } from '../../server/container.js';
import { loadConfig } from '../../server/config.js';

const restEnv = {
  NODE_ENV: 'development',
  SFMC_REST_CLIENT_ID: 'rest-client-id',
  SFMC_REST_CLIENT_SECRET: 'x'.repeat(40),
  SFMC_REST_AUTH_BASE_URL: 'https://auth.example.com',
  SFMC_REST_BASE_URL: 'https://rest.example.com',
};

describe('GET /api/entry-fields (ADR-004, Option A)', () => {
  describe('when the lookup is not configured', () => {
    let app;

    beforeAll(async () => {
      const config = loadConfig({ NODE_ENV: 'development' });
      const container = await createContainer({ config });
      app = createApp({ container, config });
    });

    it('answers 501 ENTRY_FIELDS_DISABLED', async () => {
      const res = await request(app).get('/api/entry-fields?eventDefinitionKey=K');

      expect(res.status).toBe(501);
      expect(res.body.error.code).toBe('ENTRY_FIELDS_DISABLED');
    });
  });

  describe('when the lookup is configured', () => {
    let app;
    let container;

    beforeAll(async () => {
      const config = loadConfig(restEnv);
      container = await createContainer({ config });
      app = createApp({ container, config });
    });

    it('requires the eventDefinitionKey query parameter', async () => {
      const res = await request(app).get('/api/entry-fields');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('EVENT_DEFINITION_KEY_REQUIRED');
    });

    it('rejects an unsupported key format', async () => {
      const res = await request(app).get('/api/entry-fields?eventDefinitionKey=bad%20key%21');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
      expect(res.body.error.details[0].code).toBe('EVENT_DEFINITION_KEY_INVALID');
    });

    it('returns field names and types for a known key', async () => {
      const fields = [
        { name: 'CustomerId', type: 'Text' },
        { name: 'MobilePhone', type: 'Phone' },
      ];
      container.entryFieldsService.getFieldsByEventDefinitionKey = async () => ({ fields });

      const res = await request(app).get('/api/entry-fields?eventDefinitionKey=ORDER_ENTRY_EVENT');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.fields).toEqual(fields);
    });

    it('returns an empty field list for a Data Extension without columns', async () => {
      container.entryFieldsService.getFieldsByEventDefinitionKey = async () => ({ fields: [] });

      const res = await request(app).get('/api/entry-fields?eventDefinitionKey=EMPTY_DE');

      expect(res.status).toBe(200);
      expect(res.body.fields).toEqual([]);
    });

    it('maps an upstream Marketing Cloud failure to 502 without leaking details', async () => {
      container.entryFieldsService.getFieldsByEventDefinitionKey = async () => {
        throw new Error('boom');
      };

      const res = await request(app).get('/api/entry-fields?eventDefinitionKey=K');

      expect(res.status).toBe(500);
      expect(res.body.error.message).not.toContain('boom');
    });

    it('rate-limits per IP', async () => {
      container.entryFieldsService.getFieldsByEventDefinitionKey = async () => ({ fields: [] });

      const config = loadConfig({ ...restEnv, SFMC_ENTRY_FIELDS_RATE_LIMIT_MAX: '2' });
      const limitedContainer = await createContainer({ config });
      const limitedApp = createApp({ container: limitedContainer, config });

      await request(limitedApp).get('/api/entry-fields?eventDefinitionKey=K');
      await request(limitedApp).get('/api/entry-fields?eventDefinitionKey=K');
      const third = await request(limitedApp).get('/api/entry-fields?eventDefinitionKey=K');

      expect(third.status).toBe(429);
      expect(third.body.error.code).toBe('RATE_LIMITED');
    });
  });
});