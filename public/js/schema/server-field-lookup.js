/*
 * Server-side entry-field lookup client (ADR-004, Option A).
 *
 * Calls GET /api/entry-fields?eventDefinitionKey=<key> on this server, which
 * reads the schema from Marketing Cloud REST. Returns field names and types
 * only. Every failure mode resolves to { ok: false } so the caller keeps the
 * typed-name fallback (ADR-003); it never throws.
 */

export const SERVER_LOOKUP_TIMEOUT_MS = 5000;

/**
 * @param {object} input
 * @param {string} input.eventDefinitionKey
 * @param {number} [input.timeoutMs]
 * @param {typeof fetch} [input.fetchImpl] - injectable for tests
 * @returns {Promise<{ ok: true, fields: Array<{ name: string, type?: string }> }
 *   | { ok: false, error: { code: string, message: string } }>}
 */
export async function lookupEntryFieldsFromServer({
  eventDefinitionKey,
  timeoutMs = SERVER_LOOKUP_TIMEOUT_MS,
  fetchImpl = globalThis.fetch,
}) {
  const url = `/api/entry-fields?eventDefinitionKey=${encodeURIComponent(eventDefinitionKey)}`;

  let response;
  try {
    response = await fetchImpl(url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    return { ok: false, error: { code: 'SERVER_LOOKUP_UNREACHABLE', message: 'The entry-field lookup could not be reached.' } };
  }

  if (response.status === 501) {
    return { ok: false, error: { code: 'SERVER_LOOKUP_DISABLED', message: 'The entry-field lookup is not configured on this server.' } };
  }
  if (!response.ok) {
    return { ok: false, error: { code: 'SERVER_LOOKUP_FAILED', message: `The entry-field lookup failed with HTTP ${response.status}.` } };
  }

  let body;
  try {
    body = await response.json();
  } catch {
    return { ok: false, error: { code: 'SERVER_LOOKUP_INVALID', message: 'The entry-field lookup returned an invalid response.' } };
  }

  const fields = Array.isArray(body?.fields) ? body.fields : [];
  return { ok: true, fields };
}