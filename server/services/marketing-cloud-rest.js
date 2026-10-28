/*
 * Marketing Cloud REST client (ADR-004).
 *
 * Exchanges the Installed Package client credentials for a short-lived access
 * token at the authentication base URI, then reads entry-field schemas from the
 * REST base URI:
 *
 *   event-definition   GET /interaction/v1/eventDefinitions/{key}
 *                      (schema candidates: data.dataExtension.fields,
 *                       data.schema, schema, fields)
 *   data-extension     GET /hub/v1/dataevents/{key}/attributes
 *                      (documented response: { items: [{ name, dataType }] })
 *
 * The token is cached until shortly before its expiry. Field names and types are
 * returned only; the token, the client secret and raw response bodies are never
 * returned or logged. A 404 is a valid "no schema" answer; 401/403 and 5xx are
 * upstream failures.
 */

import { MarketingCloudError } from '../errors.js';

const TOKEN_REFRESH_MARGIN_MS = 60_000;

/** Form-encoded body for the OAuth2 client-credentials grant. */
function tokenBody({ clientId, clientSecret }) {
  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
  });
  return params.toString();
}

/**
 * @param {object} options
 * @param {string} options.clientId
 * @param {string} options.clientSecret
 * @param {string} options.authBaseUrl - e.g. https://<subdomain>.auth.marketingcloudapis.com
 * @param {string} options.restBaseUrl - e.g. https://<subdomain>.rest.marketingcloudapis.com
 * @param {number} [options.timeoutMs]
 * @param {typeof fetch} [options.fetchImpl] - injectable for tests
 * @param {{ info: Function, warn: Function }} [options.logger]
 * @returns {{
 *   getEventDefinitionFields: (key: string) => Promise<{ fields: Array<{ name: string, type?: string }> }>,
 *   getDataExtensionAttributes: (key: string) => Promise<{ fields: Array<{ name: string, type?: string }> }>,
 * }}
 */
export function createMarketingCloudRestClient({
  clientId,
  clientSecret,
  authBaseUrl,
  restBaseUrl,
  timeoutMs = 10000,
  fetchImpl = globalThis.fetch,
  logger = console,
}) {
  /** @type {{ token: string, expiresAt: number }|null} */
  let cachedToken = null;

  async function getAccessToken() {
    const now = Date.now();
    if (cachedToken && cachedToken.expiresAt > now + TOKEN_REFRESH_MARGIN_MS) {
      return cachedToken.token;
    }

    let response;
    try {
      response = await fetchImpl(`${authBaseUrl}/v2/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: tokenBody({ clientId, clientSecret }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new MarketingCloudError('Marketing Cloud authentication could not be reached.');
    }

    if (!response.ok) {
      logger.warn(`Marketing Cloud token exchange failed with HTTP ${response.status}.`);
      throw new MarketingCloudError('Marketing Cloud authentication was rejected. Check the REST client credentials and scopes.');
    }

    let body;
    try {
      body = await response.json();
    } catch {
      throw new MarketingCloudError('Marketing Cloud authentication returned an invalid response.');
    }
    if (typeof body.access_token !== 'string' || body.access_token === '') {
      throw new MarketingCloudError('Marketing Cloud authentication returned no access token.');
    }

    const expiresInMs = Number.isFinite(Number(body.expires_in)) ? Number(body.expires_in) * 1000 : 3600_000;
    cachedToken = { token: body.access_token, expiresAt: now + expiresInMs };
    return cachedToken.token;
  }

  /** GETs a REST resource with the bearer token. Returns null on 404. */
  async function getJson(path) {
    const token = await getAccessToken();
    let response;
    try {
      response = await fetchImpl(`${restBaseUrl}${path}`, {
        method: 'GET',
        headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new MarketingCloudError('Marketing Cloud could not be reached.');
    }

    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      logger.warn(`Marketing Cloud REST ${path} failed with HTTP ${response.status}.`);
      throw new MarketingCloudError('Marketing Cloud rejected the field lookup. Check the REST scopes.');
    }

    let body;
    try {
      body = await response.json();
    } catch {
      throw new MarketingCloudError('Marketing Cloud returned an invalid field response.');
    }
    return body;
  }

  return {
    /** Fields of the event definition by key. Empty when the definition has no readable schema. */
    async getEventDefinitionFields(key) {
      const body = await getJson(`/interaction/v1/eventDefinitions/${encodeURIComponent(key)}`);
      const rawFields = pickEventDefinitionFields(body);
      return { fields: normalizeRawFields(rawFields) };
    },

    /** Attributes of the Data Extension by customer key. Empty when none are returned. */
    async getDataExtensionAttributes(key) {
      const body = await getJson(`/hub/v1/dataevents/${encodeURIComponent(key)}/attributes`);
      const items = body && Array.isArray(body.items) ? body.items : [];
      return { fields: normalizeRawFields(items) };
    },
  };
}

/** First non-empty field-list candidate in the event-definition response. */
function pickEventDefinitionFields(body) {
  if (!body || typeof body !== 'object') return [];
  const candidates = [
    body.data && typeof body.data === 'object' && body.data.dataExtension && body.data.dataExtension.fields,
    body.data && typeof body.data === 'object' ? body.data.schema : undefined,
    body.data && typeof body.data === 'object' ? body.data.fields : undefined,
    body.schema,
    body.fields,
  ];
  return candidates.find((list) => Array.isArray(list) && list.length > 0) ?? [];
}

/** Reduces raw field entries to { name, type } pairs; malformed entries are dropped. */
function normalizeRawFields(rawFields) {
  if (!Array.isArray(rawFields)) return [];
  const fields = [];
  for (const raw of rawFields) {
    if (!raw || typeof raw !== 'object') continue;
    const name = typeof raw.name === 'string' && raw.name.trim() !== '' ? raw.name.trim() : null;
    if (!name) continue;
    const type = typeof raw.type === 'string' && raw.type !== '' ? raw.type : typeof raw.dataType === 'string' ? raw.dataType : undefined;
    fields.push(type === undefined ? { name } : { name, type });
  }
  return fields;
}