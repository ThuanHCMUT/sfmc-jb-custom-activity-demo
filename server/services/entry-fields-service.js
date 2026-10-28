/*
 * Entry-fields service (ADR-004).
 *
 * Reads the entry Data Extension field list through the Marketing Cloud REST
 * client, keyed by eventDefinitionKey, with a short in-memory cache per key.
 * Only field names and types ever leave this service. When the lookup is not
 * configured, or the Data Extension has no columns yet, the caller keeps the
 * typed-name fallback (ADR-003).
 *
 * Also provides the Option B validation aid: schema warnings for field
 * mappings whose typed name is not in the real schema, when the schema is
 * available. A lookup failure never blocks save or validate.
 */

import { ValidationError } from '../errors.js';
import { read as readEditorState } from '../../public/js/shared/editor-state-adapter.js';
import { MAPPING_MODES } from '../../public/js/domain/mappingTargets.js';

export const SAFE_EVENT_DEFINITION_KEY = /^[A-Za-z0-9_-]+$/;

/**
 * @param {object} options
 * @param {object|null} options.restClient - Marketing Cloud REST client, or null when not configured
 * @param {number} [options.cacheTtlMs]
 * @param {'event-definition'|'data-extension'|'both'} [options.lookupMode]
 * @param {{ info: Function, warn: Function }} [options.logger]
 * @returns {{
 *   isEnabled: () => boolean,
 *   getFieldsByEventDefinitionKey: (key: string) => Promise<{ fields: Array<{ name: string, type?: string }> }>,
 * }}
 */
export function createEntryFieldsService({
  restClient = null,
  cacheTtlMs = 60000,
  lookupMode = 'both',
  logger = console,
}) {
  /** @type {Map<string, { fields: Array<{ name: string, type?: string }>, expiresAt: number }>} */
  const cache = new Map();

  async function lookupFromMarketingCloud(key) {
    if (!restClient) return { fields: [] };

    if (lookupMode === 'event-definition') {
      return restClient.getEventDefinitionFields(key);
    }
    if (lookupMode === 'data-extension') {
      return restClient.getDataExtensionAttributes(key);
    }
    // 'both': the event definition first, then the Data Extension attributes.
    const eventDefinition = await restClient.getEventDefinitionFields(key);
    if (eventDefinition.fields.length > 0) return eventDefinition;
    return restClient.getDataExtensionAttributes(key);
  }

  return {
    isEnabled() {
      return restClient !== null;
    },

    /**
     * Returns the field list for an event definition key. Validates the key
     * format, serves the cache when fresh, and caches every answer (including
     * empty ones) for the TTL so an empty Data Extension is not re-queried on
     * every keystroke.
     *
     * @param {string} key
     * @returns {Promise<{ fields: Array<{ name: string, type?: string }> }>}
     * @throws {ValidationError} when the key format is unsupported
     */
    async getFieldsByEventDefinitionKey(key) {
      if (typeof key !== 'string' || !SAFE_EVENT_DEFINITION_KEY.test(key)) {
        throw new ValidationError('The event definition key has an unsupported format.', [
          { code: 'EVENT_DEFINITION_KEY_INVALID', key: 'eventDefinitionKey' },
        ]);
      }

      const cached = cache.get(key);
      if (cached && cached.expiresAt > Date.now()) {
        return { fields: cached.fields };
      }

      const { fields } = await lookupFromMarketingCloud(key);
      cache.set(key, { fields, expiresAt: Date.now() + cacheTtlMs });
      logger.info(`[EntryFields] Looked up ${fields.length} field(s) for event key ${maskKey(key)}`);
      return { fields };
    },
  };
}

/**
 * Option B: compares the typed field mappings against the real schema when it
 * is available. Returns warnings, never errors: a lookup failure or a schema
 * that cannot be read must not block save or validate (typed-name fallback).
 *
 * @param {object} input
 * @param {object} input.activity - the activity definition
 * @param {(key: string) => Promise<{ fields: Array<{ name: string, type?: string }> }>} input.lookupFields
 * @param {ReadonlyArray<object>} input.templates
 * @returns {Promise<Array<{ code: string, key: string|null, message: string }>>}
 */
export async function collectSchemaWarnings({ activity, lookupFields, templates }) {
  const state = readEditorState(activity);
  if (!state || typeof state.eventDefinitionKey !== 'string') return [];

  const template = templates.find((candidate) => candidate.templateKey === state.templateKey);
  if (!template) return [];

  const mappings = state.mappings ?? {};
  const fieldMappings = Object.entries(mappings).filter(([, mapping]) => mapping?.mode === MAPPING_MODES.FIELD);
  if (fieldMappings.length === 0) return [];

  let fields;
  try {
    ({ fields } = await lookupFields(state.eventDefinitionKey));
  } catch {
    return [];
  }
  if (fields.length === 0) return [];

  const known = new Set(fields.map((field) => field.name));
  const warnings = [];
  for (const [targetKey, mapping] of fieldMappings) {
    if (typeof mapping.value === 'string' && mapping.value !== '' && !known.has(mapping.value)) {
      warnings.push({
        code: 'FIELD_NOT_IN_SCHEMA',
        key: targetKey,
        message: `The field "${mapping.value}" is not in the entry Data Extension schema.`,
      });
    }
  }
  return warnings;
}

/** Shortens a key for logs without altering its meaning; keys are not secrets, but they identify journeys. */
function maskKey(key) {
  if (key.length <= 8) return key;
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}