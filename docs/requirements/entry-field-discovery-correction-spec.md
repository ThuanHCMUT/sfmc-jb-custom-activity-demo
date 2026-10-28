# Correction Spec — Entry Field Discovery: Early Responses and the Entry-Source Event

| Field | Value |
|---|---|
| Document ID | SPEC-NHT-009 |
| Version | 1.0 |
| Status | Executed (2026-10-26); live verification (§5) still required |
| Date | 2026-10-26 |
| Author | Solution Architect |
| Related | [ADR-003](../adr/ADR-003-entry-de-field-source.md), [SPEC-NHT-008](./entry-de-field-correction-spec.md), README §9.10–9.11 |

> **Scope note.** The solution-architect agent is scoped to `docs/`. The code changes below are specified for the
> build agent. The exact Journey Builder payload shape is **not** verified by this document; it must be confirmed
> from a live capture (§5).

---

## 1. Review findings

The requester asked to apply the approach: send `requestInteraction`, read
`interaction.triggers[0].metaData.schema` or `.deSchema.fields`, and take `eventDefinitionKey` from the same
metadata. Review of the current code shows the **paths are already read** (`entry-schema-normalizer.js`,
`pickEmbeddedFieldList`, `normalizeInteraction`). Three defects remain that explain why discovery still fails in
Journey Builder.

### 1.1 Early `requestedInteraction` responses are dropped

`public/js/schema/entry-schema-provider.js` `#deliver` (L153–162):

```js
const waiter = this.#waiter;
if (!waiter) {
  this.#logger.info?.(`[EntrySchema] Ignored unsolicited response: ${RESPONSE_EVENT}`);
  return;
}
```

The response is discarded when no request is pending. The request is sent only from `discover()`, which runs
only after `loadTemplates()` and `initActivity` (`app.js` `initializeActivity`, L664 and L678). If Journey Builder
answers before that point, or after the 8 s deadline (`DISCOVERY_RESPONSE_TIMEOUT_MS`), the payload is lost and the
UI shows `SCHEMA_NOT_AVAILABLE` even though the data arrived.

The reference sends `requestInteraction` immediately after `ready` and handles the response at any time. This is
the timing difference.

### 1.2 The entry-source event definition is never requested

`postmonger-client.js` already exposes `requestTriggerEventDefinition()` (L149) and
`onRequestedTriggerEventDefinition()` (L103), but **no caller uses them**. The Salesforce Postmonger reference
describes `requestedTriggerEventDefinition` as the response that returns "the current Entry Source Event
Definition Model". Salesforce Knowledge article 000366322 states that the event key used by data bindings must come
from that event. Community answers (Stack Exchange 221821) use it to obtain the Data Extension name, ID and schema.

The current design depends only on `requestedInteraction`. If the field list is in the entry-source definition and
not in the interaction trigger, discovery can never succeed.

### 1.3 No live evidence in the logs

Structure logging exists only behind `?debugSchema=true`. The normal run does not record which payload arrived or
what it contained, so a failure cannot be diagnosed from a customer's console.

---

## 2. Target behavior

1. **Send both requests immediately** after `bridge.initialize()` (the `ready` trigger): `requestInteraction` and
   `requestTriggerEventDefinition`. Do not wait for templates or `initActivity`.
2. **Accept responses at any time.** Store the latest `requestedInteraction` and
   `requestedTriggerEventDefinition` payloads. A response that arrives before `discover()` is used, not dropped.
3. **Merge with a fixed precedence.**
   - `eventDefinitionKey`: `interaction.triggers[0].metaData.eventDefinitionKey`, else the entry-source definition's
     `eventDefinitionKey`.
   - Field list, first non-empty of: `interaction.triggers[0].metaData.schema`,
     `interaction.triggers[0].metaData.deSchema.fields`, the entry-source definition's `schema`, then its
     `deSchema.fields` (and `fields` if present). Each candidate goes through the existing `normalizeFieldList`.
4. **Always log structure** of both payloads (`describeStructure`, depth 3, keys and types only, no values) at
   `info` level, so the requester can paste the console output. This is not gated by `?debugSchema`.
5. **Non-fatal.** A missing field list keeps the ADR-003 typed-name fallback. It never blocks saving.

---

## 3. Changes

### 3.1 `public/js/schema/entry-schema-provider.js`

- Add a cache: `#latest = { interaction: null, entrySource: null }`. In the response handlers, always store the
  payload. Only resolve the pending waiter if one exists.
- Subscribe to both events in the constructor:
  - `bridge.onRequestedInteraction((payload) => this.#receive('interaction', payload))`
  - `bridge.onRequestedTriggerEventDefinition((payload) => this.#receive('entrySource', payload))`
- Add `prefetch()`: sends `requestInteraction()` and `requestTriggerEventDefinition()` (both via the bridge). It
  does not wait. Called once from `app.js` right after `bridge.initialize()`.
- `discover()`: if both cached payloads are present, use them. Otherwise send the two requests (if not already
  in flight) and wait for both responses or the deadline. Then merge per §2.3.
- Keep the response deadline and the "late responses are ignored" rule for the awaited request only.
  Responses that are cached are always kept.

### 3.2 `public/js/postmonger-client.js`

No logic change. Confirm that `onRequestedTriggerEventDefinition` (L103) and `requestTriggerEventDefinition` (L149)
are wired to the SDK. The `#registerSdkListeners` method (L168–179) must also register
`REQUESTED_TRIGGER_EVENT_DEFINITION` (it does, L173). **Verify this in the file before editing.**

### 3.3 `public/js/app.js`

In `initializeActivity()`, right after `bridge.initialize()` (L657), call `provider?.prefetch()`. Keep the existing
`discoverSchema()` call (L678) so the merge still runs once the activity arrives. Do not change the readiness logic.

### 3.4 `public/js/schema/entry-schema-normalizer.js`

Add `normalizeEntrySource(payload)` that returns `{ eventDefinitionKey, schema|null }` from the
entry-source definition, using the same key rules as `normalizeInteraction`. Accept `schema`, `deSchema.fields`
and `fields`. Reuse `normalizeFieldList` for the field list. Never throw.

---

## 4. Tests

| File | Add |
|---|---|
| `tests/schema/entry-schema-provider.test.js` | A `requestedInteraction` that arrives before `discover()` is used (not dropped). A field list only in the entry-source definition is used when the interaction has none. Both lists missing → `SCHEMA_NOT_AVAILABLE`, activity still valid with typed-name fallback. |
| `tests/schema/discovery-integration.test.js` | End-to-end: `prefetch()` then `requestedTriggerEventDefinition` with a field list, then `discover()` → fields present. |
| `tests/ui/postmonger-client.test.js` | `prefetch` sends both requests; the entry-source event is dispatched to its handler. |

Do not weaken existing assertions. Where an existing test expects an unsolicited response to be ignored, change it
and report the change.

---

## 5. Live verification (requester action, required)

The payload shape is not confirmed by documentation. Before a field list can be relied on, capture both payloads
once:

1. Open the activity in Journey Builder with the console open and `?debugSchema=true` appended to the activity URL.
   (After §3.1, the structure log runs without the flag; the flag is still useful for the normalized result.)
2. Copy the two `[EntrySchema]` log lines: the `requestedInteraction` shape and the `requestedTriggerEventDefinition`
   shape. They contain key names and types only, no customer values.
3. Send them back. The field list location is then fixed in `normalizeInteraction` / `normalizeEntrySource`, or
   the typed-name fallback (ADR-003) stays the supported path.

---

## 6. Out of scope

- Changing the binding syntax (ADR-003 V1), the saved-state location (V2) or the `inArguments` shape (V3).
- Calling Salesforce REST APIs for DE metadata.
