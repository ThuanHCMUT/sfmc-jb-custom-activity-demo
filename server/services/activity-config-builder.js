/*
 * Activity definition (config.json) builder.
 *
 * Every URL is derived from PUBLIC_BASE_URL. Nothing is duplicated in static files.
 * The format follows the official sample (sfmc-example-jb-custom-activity) exactly:
 *   - top-level name/description (required by Journey Builder)
 *   - metaData.category = "Custom" (palette group)
 *   - securityOptions.securityContext on execute and every lifecycle endpoint
 *   - schema entries use dataType / isNullable / direction
 *   - copySettings.ignoreArguments excludes the eventDefinitionKey from copies
 *
 * Deviations (documented in SPEC-NHT-005 §3):
 *   - one wizard step (the config modal is a single fullscreen step)
 *   - no runningModal / runningHover (no dedicated running-state UI)
 *   - securityOptions omitted entirely when JWT verification is off (development)
 */

export const FIXED_SCHEMA_KEYS = Object.freeze([
  'source',
  'channel',
  'templateKey',
  'templateVersion',
  'eventDefinitionKey',
]);

export const LIFECYCLE_PATHS = Object.freeze({
  save: '/journey/save',
  validate: '/journey/validate',
  publish: '/journey/publish',
  stop: '/journey/stop',
  execute: '/journey/execute',
});

/**
 * @param {{ publicBaseUrl: string, requireJwt: boolean, securityContextKey?: string }} config
 * @returns {object} the activity definition served at GET /config.json
 */
export function buildActivityConfig({ publicBaseUrl, requireJwt, securityContextKey }) {
  const url = (path) => `${publicBaseUrl}${path}`;
  const securityOptions = requireJwt
    ? { securityType: 'securityContext', securityContextKey: securityContextKey || '' }
    : null;
  const lifecycle = (path) =>
    securityOptions ? { url: url(path), securityOptions } : { url: url(path) };

  return {
    workflowApiVersion: '1.1',
    name: 'Notification Hub',
    description: 'Send a notification through Notification Hub.',
    metaData: {
      icon: url('/assets/icon.svg'),
      category: 'Custom',
      isConfigured: false,
    },
    type: 'REST',
    lang: {
      'en-US': {
        name: 'Notification Hub',
        description: 'Send a notification through Notification Hub.',
        label1: 'Configure notification',
      },
    },
    arguments: {
      execute: {
        inArguments: [
          {
            source: 'sf-marketing-cloud',
            channel: '',
            templateKey: '',
            templateVersion: '1',
            eventDefinitionKey: '',
          },
        ],
        outArguments: [{ success: true, status: 'accepted' }],
        timeout: 10000,
        retryCount: 1,
        retryDelay: 1000,
        concurrentRequests: 6,
        url: url(LIFECYCLE_PATHS.execute),
        ...(securityOptions ? { securityOptions } : {}),
      },
    },
    configurationArguments: {
      save: lifecycle(LIFECYCLE_PATHS.save),
      publish: lifecycle(LIFECYCLE_PATHS.publish),
      validate: lifecycle(LIFECYCLE_PATHS.validate),
      stop: lifecycle(LIFECYCLE_PATHS.stop),
    },
    wizardSteps: [{ label: 'label1', key: 'step1' }],
    userInterfaces: {
      configModal: {
        url: url('/frt/'),
        height: 700,
        width: 900,
        fullscreen: true,
      },
    },
    schema: {
      arguments: {
        execute: {
          inArguments: [
            { source: { dataType: 'Text', isNullable: false, direction: 'in' } },
            { channel: { dataType: 'Text', isNullable: false, direction: 'in' } },
            { templateKey: { dataType: 'Text', isNullable: false, direction: 'in' } },
            { templateVersion: { dataType: 'Text', isNullable: false, direction: 'in' } },
            { eventDefinitionKey: { dataType: 'Text', isNullable: false, direction: 'in' } },
          ],
          outArguments: [
            { success: { dataType: 'Boolean', isNullable: false, direction: 'out' } },
            { status: { dataType: 'Text', isNullable: false, direction: 'out' } },
          ],
        },
      },
    },
    copySettings: {
      allowCopy: true,
      ignoreArguments: ['eventDefinitionKey'],
    },
  };
}