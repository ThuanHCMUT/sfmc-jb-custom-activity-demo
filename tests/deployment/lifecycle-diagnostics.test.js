import { describe, it, expect, beforeAll, afterEach, jest } from '@jest/globals';
import request from 'supertest';

import { createApp } from '../../server/app.js';
import { createContainer } from '../../server/container.js';
import { loadConfig } from '../../server/config.js';
import { configureLogger } from '../../server/logger.js';
import { describeLifecycleRequest } from '../../server/services/lifecycle-service.js';

describe('describeLifecycleRequest', () => {
  const activity = {
    arguments: { execute: { inArguments: [{ source: 'secret-source' }, { templateKey: 'secret-template' }] } },
    metaData: {
      isConfigured: true,
      customActivityConfig: { channel: 'ZNS', templateKey: 'secret-template', mappings: {} },
    },
  };

  it('reports key names and flags of a configured activity', () => {
    const shape = describeLifecycleRequest(activity, 'application/json');
    expect(shape).toMatchObject({
      contentType: 'application/json',
      bodyKind: 'object',
      topLevelKeys: ['arguments', 'metaData'],
      wrappedInActivity: false,
      hasExecuteArguments: true,
      inArgumentsCount: 2,
      metaDataKeys: ['isConfigured', 'customActivityConfig'],
      hasEditorState: true,
      isConfigured: true,
    });
  });

  it('never includes a value from the request', () => {
    expect(JSON.stringify(describeLifecycleRequest(activity))).not.toContain('secret');
  });

  it('sees through an "activity" wrapper', () => {
    const shape = describeLifecycleRequest({ activity, activityId: 'x' });
    expect(shape.wrappedInActivity).toBe(true);
    expect(shape.hasEditorState).toBe(true);
  });

  it('describes an empty or non-object body without throwing', () => {
    expect(describeLifecycleRequest(undefined)).toMatchObject({ bodyKind: 'none', topLevelKeys: [], inArgumentsCount: null });
    expect(describeLifecycleRequest('eyJhbGciOi...')).toMatchObject({ bodyKind: 'string', hasEditorState: false });
    expect(describeLifecycleRequest([])).toMatchObject({ bodyKind: 'array', topLevelKeys: [] });
  });
});

describe('lifecycle logging', () => {
  let app;

  beforeAll(async () => {
    const config = loadConfig({ NODE_ENV: 'development' });
    const container = await createContainer({ config });
    app = createApp({ container, config });
  });

  afterEach(() => {
    configureLogger({ silent: true });
    jest.restoreAllMocks();
  });

  it('names the failing codes of a rejected validate call in the log', async () => {
    configureLogger({ level: 'info', silent: false });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const info = jest.spyOn(console, 'log').mockImplementation(() => {});

    const res = await request(app).post('/journey/validate').send({ arguments: { execute: {} } });

    expect(res.status).toBe(400);
    expect(warn.mock.calls.map((call) => call[0]).join('\n')).toContain(
      'Request rejected: VALIDATION_FAILED POST /journey/validate [CONFIGURATION_MISSING]'
    );
    expect(info.mock.calls.map((call) => call[0]).join('\n')).toContain('/journey/validate request shape:');
  });
});
