/*
 * Entry-schema provider.
 *
 * Journey Builder answers one Postmonger request about the entry source:
 *
 *   requestSchema   ->  requestedSchema
 *
 * The response is { schema: [{ key, name, type, ... }] }. Each field key has the form
 * "Event.<eventDefinitionKey>.<FieldName>", so the event definition key and the Data
 * Extension field list both come from this one payload. A payload without a usable
 * schema array yields SCHEMA_NOT_AVAILABLE.
 *
 * Responses are accepted at any time:
 *   - prefetch() sends the request right after bridge.initialize(), without waiting.
 *   - The response is cached as the latest payload, even when nobody waits for it.
 *   - discover() uses the cached payload when present. Otherwise it sends the request
 *     (not if already in flight) and waits for it or the deadline.
 *
 * Listeners are registered exactly once, in the constructor, which must run
 * before bridge.initialize(). Concurrent calls to discover() share one in-flight
 * promise, so the Retry button can never start a second request.
 *
 * Response deadline:
 *   The awaited request waits at most `responseTimeoutMs`. A timed-out request yields
 *   SCHEMA_NOT_AVAILABLE and is recoverable through Retry. A response that arrives
 *   after its deadline is cached and used by the next discovery.
 *
 * Retry:
 *   A failed discovery clears the cache, so Retry asks Journey Builder again
 *   instead of replaying a payload that was already rejected.
 */

import { normalizeSchemaPayload, normalizeFieldList, describeStructure, SCHEMA_ERROR_CODES } from './entry-schema-normalizer.js';

export const DISCOVERY_RESPONSE_TIMEOUT_MS = 8000;

export const DISCOVERY_SOURCE = Object.freeze({
  SCHEMA: 'requestedSchema',
  NONE: 'none',
});

const REQUEST_EVENT = 'requestSchema';
const RESPONSE_EVENT = 'requestedSchema';

/** Key names of a plain object (never values); null for anything else. */
const keyNamesOf = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value) : null;

/**
 * Key names only, one level deep: `a, b, c(x, y)` where c is a nested object.
 * Values are never read into the output.
 */
function describeKeyNames(value) {
  const keys = keyNamesOf(value);
  if (!keys) return '(none)';
  return keys
    .map((key) => {
      const childKeys = keyNamesOf(value[key]);
      return childKeys ? `${key}(${childKeys.join(', ')})` : key;
    })
    .join(', ');
}

/**
 * @typedef {{
 *   valid: boolean,
 *   eventDefinitionKey: string|null,
 *   fields: object[],
 *   warnings: object[],
 *   error: { code: string, message: string } | null,
 *   source: string
 * }} DiscoveryResult
 */

export class EntrySchemaProvider {
  #bridge;
  #timeoutMs;
  #debug;
  #logger;
  /** Latest received payload, wrapped as { payload } so a null payload still counts as received. */
  #cache = null;
  /** True while the request has been sent and its response has not arrived yet. */
  #sent = false;
  /** @type {{ resolve: Function, timer: ReturnType<typeof setTimeout> } | null} */
  #waiter = null;
  /** @type {Promise<DiscoveryResult>|null} */
  #inFlight = null;

  /**
   * @param {object} options
   * @param {object} options.bridge - PostmongerClient or StandaloneAdapter
   * @param {number} [options.responseTimeoutMs]
   * @param {boolean} [options.debug] - logs the normalized result (structure is always logged)
   * @param {{ info: Function, warn: Function }} [options.logger]
   */
  constructor({ bridge, responseTimeoutMs = DISCOVERY_RESPONSE_TIMEOUT_MS, debug = false, logger = console }) {
    if (!bridge) {
      throw new Error('EntrySchemaProvider requires a bridge.');
    }
    this.#bridge = bridge;
    this.#timeoutMs = responseTimeoutMs;
    this.#debug = debug;
    this.#logger = logger;

    bridge.onRequestedSchema((payload) => this.#receive(payload));
  }

  /** @returns {boolean} true while a discovery run is in progress */
  isDiscovering() {
    return this.#inFlight !== null;
  }

  /**
   * Sends the request now and does not wait. The response is cached for discover().
   * Call once, right after bridge.initialize(). A request already in flight is not repeated.
   */
  prefetch() {
    if (this.#cache || this.#sent) return;
    try {
      this.#send();
    } catch (error) {
      this.#logger.warn?.(`[EntrySchema] Prefetch of ${REQUEST_EVENT} failed: ${error.message}`);
    }
  }

  /**
   * Runs discovery. Concurrent calls share the same in-flight promise.
   *
   * @returns {Promise<DiscoveryResult>}
   */
  discover() {
    if (this.#inFlight) return this.#inFlight;

    this.#inFlight = this.#run().finally(() => {
      this.#inFlight = null;
    });
    return this.#inFlight;
  }

  async #run() {
    this.prefetch();

    const response = await this.#obtain();
    const result = this.#normalize(response);
    if (!result.valid) {
      this.#cache = null;
    }
    return this.#result(result);
  }

  /**
   * Returns the cached payload, or sends the request and waits for it.
   *
   * @returns {Promise<{ payload: unknown, failure: string|null }>}
   */
  #obtain() {
    if (this.#cache) {
      return Promise.resolve({ payload: this.#cache.payload, failure: null });
    }

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.#waiter = null;
        this.#sent = false;
        resolve({ payload: null, failure: `Journey Builder không phản hồi ${REQUEST_EVENT} đúng hạn.` });
      }, this.#timeoutMs);

      this.#waiter = { resolve, timer };

      // A prefetch request may already be in flight. Wait for it instead of sending again.
      if (this.#sent) return;

      try {
        this.#send();
      } catch (error) {
        clearTimeout(timer);
        this.#waiter = null;
        resolve({ payload: null, failure: `Không thể gửi yêu cầu: ${error.message}` });
      }
    });
  }

  #send() {
    this.#sent = true;
    try {
      this.#bridge.requestSchema();
    } catch (error) {
      this.#sent = false;
      throw error;
    }
  }

  /**
   * Caches every response. Resolves the awaited request only when one is pending.
   * A response with no waiter (early, or after the deadline) is kept for later use.
   */
  #receive(payload) {
    this.#logger.info(
      `[EntrySchema] ${RESPONSE_EVENT} structure: ${describeStructure(payload, 3)}; top-level keys: ${describeKeyNames(payload)}`
    );

    this.#cache = { payload };
    this.#sent = false;

    const waiter = this.#waiter;
    if (!waiter) return;

    this.#waiter = null;
    clearTimeout(waiter.timer);
    waiter.resolve({ payload, failure: null });
  }

  /**
   * Turns the response into a discovery result. The event definition key and the
   * field list both come from the schema payload.
   *
   * @returns {object} result without the source applied yet
   */
  #normalize({ payload, failure }) {
    if (failure) {
      return failureResult(null, SCHEMA_ERROR_CODES.SCHEMA_NOT_AVAILABLE, failure);
    }

    const schema = normalizeSchemaPayload(payload);
    const key = schema.eventDefinitionKey;
    if (!key) {
      return failureResult(null, schema.error.code, schema.error.message);
    }

    const fields = normalizeFieldList(schema.fieldList, key);
    if (!fields.valid) {
      return failureResult(key, SCHEMA_ERROR_CODES.SCHEMA_NOT_AVAILABLE, fields.error.message);
    }

    return { ...fields, source: DISCOVERY_SOURCE.SCHEMA };
  }

  #result(result) {
    const normalized = {
      valid: result.valid === true,
      eventDefinitionKey: result.eventDefinitionKey ?? null,
      fields: result.fields ?? [],
      warnings: result.warnings ?? [],
      error: result.error ?? null,
      source: result.source ?? DISCOVERY_SOURCE.NONE,
    };

    if (this.#debug) {
      this.#logger.info(
        `[EntrySchema] Normalized: eventDefinitionKey=${normalized.eventDefinitionKey ?? 'none'} fieldCount=${normalized.fields.length} warnings=${normalized.warnings.length} source=${normalized.source}`
      );
    }
    return normalized;
  }
}

function failureResult(eventDefinitionKey, code, message) {
  return {
    valid: false,
    eventDefinitionKey,
    fields: [],
    warnings: [],
    error: { code, message },
  };
}
