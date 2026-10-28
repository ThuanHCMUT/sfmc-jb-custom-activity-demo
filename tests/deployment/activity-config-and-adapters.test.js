import { describe, it, expect, jest } from '@jest/globals';

import { buildActivityConfig, FIXED_SCHEMA_KEYS, LIFECYCLE_PATHS } from '../../server/services/activity-config-builder.js';
import { createNotificationHubAdapter } from '../../server/services/notification-hub-adapter.js';
import { buildNotificationPayload, redactPayload } from '../../server/services/notification-payload-builder.js';
import { NotificationHubError } from '../../server/errors.js';

const BASE = 'https://activity.example.com';

describe('buildActivityConfig (config.json)', () => {
  const config = buildActivityConfig({ publicBaseUrl: BASE, requireJwt: true, securityContextKey: 'EXTERNAL_KEY' });

  it('builds every URL from PUBLIC_BASE_URL', () => {
    expect(config.arguments.execute.url).toBe(`${BASE}/journey/execute`);
    expect(config.configurationArguments.save.url).toBe(`${BASE}/journey/save`);
    expect(config.configurationArguments.validate.url).toBe(`${BASE}/journey/validate`);
    expect(config.configurationArguments.publish.url).toBe(`${BASE}/journey/publish`);
    expect(config.configurationArguments.stop.url).toBe(`${BASE}/journey/stop`);
    expect(config.metaData.icon).toBe(`${BASE}/assets/icon.svg`);
  });

  it('contains no localhost or plain-HTTP URL when the base is public HTTPS', () => {
    const text = JSON.stringify(config);

    expect(text).not.toMatch(/localhost|127\.0\.0\.1|http:\/\//);
  });

  it('is a REST activity that is not configured until the user completes setup', () => {
    expect(config.type).toBe('REST');
    expect(config.workflowApiVersion).toBe('1.1');
    expect(config.metaData.isConfigured).toBe(false);
  });

  it('requires JWT on execute and on every lifecycle call when verification is enabled', () => {
    const security = { securityType: 'securityContext', securityContextKey: 'EXTERNAL_KEY' };
    expect(config.arguments.execute.securityOptions).toEqual(security);
    for (const key of ['save', 'validate', 'publish', 'stop']) {
      expect(config.configurationArguments[key].securityOptions).toEqual(security);
    }
  });

  it('turns JWT off consistently in development', () => {
    const dev = buildActivityConfig({ publicBaseUrl: 'http://localhost:3000', requireJwt: false });

    expect(dev.arguments.execute.securityOptions).toBeUndefined();
    expect(dev.configurationArguments.save.securityOptions).toBeUndefined();
  });

  it('declares the fixed runtime keys in the one-key-per-object schema format', () => {
    const declared = config.schema.arguments.execute.inArguments;

    expect(declared.map((entry) => Object.keys(entry)[0])).toEqual(FIXED_SCHEMA_KEYS);
    for (const entry of declared) {
      const [key] = Object.keys(entry);
      expect(entry[key]).toEqual({ dataType: 'Text', isNullable: false, direction: 'in' });
    }
  });

  it('matches the official sample for the registration-critical fields', () => {
    expect(config.name).toBe('Notification Hub');
    expect(config.description).toBe('Send a notification through Notification Hub.');
    expect(config.metaData.category).toBe('Custom');
    expect(config.userInterfaces.configModal).toEqual({
      url: `${BASE}/frt/`,
      height: 700,
      width: 900,
      fullscreen: true,
    });
    expect(config.arguments.execute.timeout).toBe(10000);
    expect(config.arguments.execute.retryCount).toBe(1);
    expect(config.arguments.execute.verb).toBeUndefined();
    expect(config.arguments.execute.inArguments[0]).toEqual({
      source: 'sf-marketing-cloud',
      channel: '',
      templateKey: '',
      templateVersion: '1',
      eventDefinitionKey: '',
    });
    expect(config.arguments.execute.outArguments).toEqual([{ success: true, status: 'accepted' }]);
    expect(config.schema.arguments.execute.outArguments).toEqual([
      { success: { dataType: 'Boolean', isNullable: false, direction: 'out' } },
      { status: { dataType: 'Text', isNullable: false, direction: 'out' } },
    ]);
    expect(config.copySettings).toEqual({ allowCopy: true, ignoreArguments: ['eventDefinitionKey'] });
    expect(config.configurationArguments).toEqual(
      expect.objectContaining({
        save: expect.anything(),
        publish: expect.anything(),
        validate: expect.anything(),
        stop: expect.anything(),
      })
    );
  });

  it('keeps the lifecycle paths in one place', () => {
    expect(LIFECYCLE_PATHS).toEqual({
      save: '/journey/save',
      validate: '/journey/validate',
      publish: '/journey/publish',
      stop: '/journey/stop',
      execute: '/journey/execute',
    });
  });

  it('stores no editor state in the activity-level configurationArguments', () => {
    expect(Object.keys(config.configurationArguments).sort()).toEqual(['publish', 'save', 'stop', 'validate']);
  });
});

describe('createNotificationHubAdapter', () => {
  const payload = { source: 'sf-marketing-cloud', recipients: [] };

  it('simulation mode accepts without sending', async () => {
    const fetchImpl = jest.fn();
    const adapter = createNotificationHubAdapter({ mode: 'simulation', fetchImpl });

    await expect(adapter.send(payload)).resolves.toEqual({ accepted: true, simulated: true });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('http mode posts the payload with a bearer key and the configured path', async () => {
    const fetchImpl = jest.fn(async () => ({ ok: true, status: 200 }));
    const adapter = createNotificationHubAdapter({
      mode: 'http',
      baseUrl: 'https://nh.example.com',
      apiKey: 'secret-key',
      sendPath: '/send',
      fetchImpl,
    });

    await expect(adapter.send(payload)).resolves.toEqual({ accepted: true, simulated: false });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://nh.example.com/send');
    expect(init.headers.authorization).toBe('Bearer secret-key');
    expect(JSON.parse(init.body)).toEqual(payload);
  });

  it('maps a non-2xx response to a safe error without copying the response body', async () => {
    const fetchImpl = jest.fn(async () => ({ ok: false, status: 503, text: async () => 'customer data' }));
    const adapter = createNotificationHubAdapter({ mode: 'http', baseUrl: 'https://nh', apiKey: 'k', sendPath: '/s', fetchImpl });

    const error = await adapter.send(payload).catch((e) => e);

    expect(error).toBeInstanceOf(NotificationHubError);
    expect(error.message).toBe('Notification Hub responded with HTTP 503.');
    expect(error.message).not.toContain('customer data');
  });

  it('maps an unreachable host to a safe error', async () => {
    const fetchImpl = jest.fn(async () => {
      throw new Error('ECONNREFUSED secret-key');
    });
    const adapter = createNotificationHubAdapter({ mode: 'http', baseUrl: 'https://nh', apiKey: 'k', sendPath: '/s', fetchImpl });

    const error = await adapter.send(payload).catch((e) => e);

    expect(error.message).toBe('Notification Hub could not be reached.');
  });
});

describe('buildNotificationPayload', () => {
  const template = {
    templateKey: 'fptlc.order-confirm.zns.6a12eabf',
    channel: 'ZALO',
    addresses: [{ name: 'phone', required: true, type: 'phone' }],
    recipientFields: [{ name: 'customerId', required: true, type: 'string' }],
    params: [
      { name: 'customerName', required: true, type: 'string' },
      { name: 'shopName', required: false, type: 'string' },
    ],
  };
  const base = {
    source: 'sf-marketing-cloud',
    'address__phone': '0961234567',
    'recipient__customerId': 'KH0001',
    'param__customerName': 'Nguyen Van A',
    templateKey: template.templateKey,
    channel: 'ZALO',
    templateVersion: '1',
    eventDefinitionKey: 'ORDER_ENTRY_EVENT',
  };

  it('builds the nested Notification Hub shape from flat values', () => {
    const result = buildNotificationPayload({
      template,
      values: base,
      idempotencyKey: 'idem',
      correlationId: 'corr',
    });

    expect(result.ok).toBe(true);
    expect(result.payload).toEqual({
      source: 'sf-marketing-cloud',
      idempotencyKey: 'idem',
      templateKey: template.templateKey,
      correlationId: 'corr',
      recipients: [
        {
          addresses: [{ type: 'phone', value: '0961234567' }],
          customerId: 'KH0001',
          params: { customerName: 'Nguyen Van A' },
        },
      ],
    });
  });

  it('omits unmapped optional parameters', () => {
    const result = buildNotificationPayload({ template, values: base, idempotencyKey: 'i', correlationId: 'c' });

    expect(result.payload.recipients[0].params).not.toHaveProperty('shopName');
  });

  it('reports a missing required value by key, without its value', () => {
    const { 'param__customerName': _omitted, ...incomplete } = base;

    const result = buildNotificationPayload({ template, values: incomplete, idempotencyKey: 'i', correlationId: 'c' });

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual([expect.objectContaining({ code: 'REQUIRED_VALUE_MISSING', key: 'param__customerName' })]);
    expect(JSON.stringify(result.errors)).not.toContain('0961234567');
  });

  it('rejects a runtime key that does not belong to the template', () => {
    const result = buildNotificationPayload({
      template,
      values: { ...base, 'param__unknown': 'x' },
      idempotencyKey: 'i',
      correlationId: 'c',
    });

    expect(result.errors).toEqual([expect.objectContaining({ code: 'UNKNOWN_RUNTIME_KEY', key: 'param__unknown' })]);
  });

  it('pins the configured source over the runtime value', () => {
    const result = buildNotificationPayload({
      template,
      values: { ...base, source: 'sf-service-cloud' },
      idempotencyKey: 'i',
      correlationId: 'c',
      source: 'sf-configured',
    });

    expect(result.payload.source).toBe('sf-configured');
  });

  it('uses the runtime source when no configured source is given', () => {
    const result = buildNotificationPayload({
      template,
      values: { ...base, source: 'sf-service-cloud' },
      idempotencyKey: 'i',
      correlationId: 'c',
    });

    expect(result.payload.source).toBe('sf-service-cloud');
  });

  it('defaults to the standard source when neither is present', () => {
    const { source: _omitted, ...withoutSource } = base;

    const result = buildNotificationPayload({
      template,
      values: withoutSource,
      idempotencyKey: 'i',
      correlationId: 'c',
    });

    expect(result.payload.source).toBe('sf-marketing-cloud');
  });
});

describe('redactPayload', () => {
  it('keeps the structure and replaces every string value with a length marker', () => {
    const payload = {
      source: 'sf-service-cloud',
      templateKey: 'vac.service-change-notice.sms.988dfeff',
      recipients: [
        {
          addresses: [{ type: 'phone', value: '0961234567' }],
          customerId: 'KH0001',
          params: { customerName: 'Nguyen Van A' },
        },
      ],
    };

    const preview = redactPayload(payload);

    expect(preview).toEqual({
      source: '[REDACTED len=16]',
      templateKey: '[REDACTED len=38]',
      recipients: [
        {
          addresses: [{ type: '[REDACTED len=5]', value: '[REDACTED len=10]' }],
          customerId: '[REDACTED len=6]',
          params: { customerName: '[REDACTED len=12]' },
        },
      ],
    });
    expect(JSON.stringify(preview)).not.toContain('0961234567');
    expect(JSON.stringify(preview)).not.toContain('Nguyen Van A');
  });

  it('passes through non-string leaves unchanged', () => {
    expect(redactPayload({ count: 3, ok: true, nothing: null })).toEqual({ count: 3, ok: true, nothing: null });
  });
});
