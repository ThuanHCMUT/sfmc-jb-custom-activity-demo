# Correction Spec — Obtain DE Fields from the Entry-Source Event Definition (`dataExtensionFields`)

| Field | Value |
|---|---|
| Document ID | SPEC-NHT-012 |
| Version | 1.0 |
| Status | Approved (2026-10-27); live-verified by the requester; implementation pending |
| Date | 2026-10-27 |
| Author | Solution Architect |
| Related | [ADR-005](../adr/ADR-005-de-fields-from-entry-source-event-definition.md), [ADR-003](../adr/ADR-003-entry-de-field-source.md), [ADR-004](../adr/ADR-004-server-side-entry-field-lookup.md), [SPEC-NHT-009](./entry-field-discovery-correction-spec.md), [SPEC-NHT-010](./entry-source-grace-correction-spec.md) |

> **Scope note.** The solution-architect agent is scoped to `docs/`. The code changes below are specified for the
> build agent. This spec describes behavior and payload shapes only; it does not contain implementation code.

---

## 1. Problem

SPEC-NHT-009 §2.3 fixed the merge precedence as: interaction metadata field lists first
(`triggers[0].metaData.schema`, `triggers[0].metaData.deSchema.fields`), then the entry-source definition lists
(`schema`, `deSchema.fields`, `fields`). The live capture of 2026-10-26 (ADR-003 evidence) showed no field list in
either payload for that journey shape, and the entry-source response was never answered — hence the typed-name
fallback (ADR-003) and the grace wait (SPEC-NHT-010).

On 2026-10-27 the requester tested the entry-source path against a **different, live Journey Builder session** and
it **worked**:

```js
var connection = new Postmonger.Session();
connection.trigger('requestTriggerEventDefinition');
connection.on('requestedTriggerEventDefinition', function (eventDefinitionModel) {
    // eventDefinitionModel.dataExtensionFields is the DE field list
    var deFields = eventDefinitionModel.dataExtensionFields;
    populateDropdown(deFields);
});
```

Findings:

1. `requestedTriggerEventDefinition` **is answered** and carries the entry Data Extension field list in
   `eventDefinitionModel.dataExtensionFields`.
2. The current normalizer does **not** read `dataExtensionFields` — `pickEntrySourceFieldList` accepts only
   `schema`, `deSchema.fields`, `fields` (`entry-schema-normalizer.js`).
3. The current merge prefers interaction metadata over the entry-source definition
   (`entry-schema-provider.js` `#merge`; asserted by
   `tests/schema/entry-schema-provider.test.js` "prefers the interaction field list over the entry-source list").

So the confirmed source of DE fields exists but is neither parsed nor preferred.

---

## 2. Target behavior

1. **Parse `dataExtensionFields`** as the first field-list candidate of the entry-source event definition:
   `dataExtensionFields`, then `schema`, `deSchema.fields`, `fields`. First non-empty array wins.
2. **Prefer the entry-source definition** over the interaction metadata when both carry a usable field list
   (ADR-005). The discovery source reported becomes `ENTRY_SOURCE_DEFINITION` in the common case.
3. **Key resolution is unchanged**: interaction `triggers[0].metaData.eventDefinitionKey` first, then the
   entry-source `eventDefinitionKey`.
4. **Fallback ladder is unchanged**: interaction metadata list → server lookup (ADR-004) → typed-name fallback
   (ADR-003). Deadlines, caching, retry and the grace wait (SPEC-NHT-010) are unchanged.
5. **Standalone mode mirrors the confirmed shape**: the standalone adapter answers
   `requestedTriggerEventDefinition` with a payload that also carries `dataExtensionFields`, so local development
   exercises the same code path as production.

---

## 3. Changes

### 3.1 `public/js/schema/entry-schema-normalizer.js`

- In the entry-source field-list picker, prepend `dataExtensionFields` to the candidate list.
- Field normalization is unchanged (`name`/`key` resolution, type normalization, ordinals, warnings). No new
  error or warning codes.

### 3.2 `public/js/schema/entry-schema-provider.js`

- In `#merge`, evaluate the entry-source field list (`ENTRY_SOURCE_DEFINITION`) **before** the interaction
  metadata list (`INTERACTION_TRIGGER_METADATA`).
- Do not change key resolution, `prefetch`, deadlines, caching, retry, or the server-lookup trigger condition.

### 3.3 `public/js/standalone-adapter.js`

- `toStandaloneEntrySource(fixture)` must include `dataExtensionFields` (same fixture-derived field list as the
  existing `deSchema.fields`), so the standalone entry-source payload matches the confirmed production shape.

### 3.4 `public/js/postmonger-client.js`

- No logic change. Update the header comment to state that discovery uses the entry-source path.

### 3.5 `public/fixtures/entry-schema.fixture.json`

- No change required: the fixture fields already flow into both `deSchema.fields` and the new
  `dataExtensionFields` via `toStandaloneEntrySource`.

### 3.6 Tests

| File | Change |
|---|---|
| `tests/schema/entry-schema-provider.test.js` | Invert the "prefers the interaction field list" case; update `result.source` expectations that depended on the old order. Add: entry-source `dataExtensionFields` wins when both payloads carry a list. |
| `tests/schema/entry-schema-normalizer.test.js` | Add `dataExtensionFields` cases: happy path, empty array, malformed entries (FIELD_SKIPPED), duplicates. |
| `tests/schema/standalone-adapter.test.js` | Assert the standalone entry-source response carries `dataExtensionFields`. |
| `tests/schema/discovery-integration.test.js` | Scenario 7: deliver the field list via `dataExtensionFields`; assert `source === ENTRY_SOURCE_DEFINITION`. |

### 3.7 README (build-agent follow-up, outside `docs/`)

- §9.9: discovery is driven by `requestTriggerEventDefinition` → `requestedTriggerEventDefinition`; interaction
  metadata is the fallback.
- §9.10: mark both events "in use"; record `dataExtensionFields` as journey-verified.
- §9.11: add the confirmed `dataExtensionFields` payload shape.
- §9.20: rewrite the extraction list with the new priority ladder.
- §9.23 live gate A: entry-source field path verified; interaction-metadata field path still unverified.
- §10 Phase 4: note the entry-source discovery is journey-verified.

---

## 4. Confirmed payload shape (evidence, 2026-10-27)

Response to `requestTriggerEventDefinition`, as observed by the requester:

```json
{
  "eventDefinitionKey": "ORDER_ENTRY_EVENT",
  "dataExtensionFields": [
    { "name": "CustomerId", "type": "Text", "ordinal": 0 },
    { "name": "CustomerName", "type": "Text", "ordinal": 1 },
    { "name": "MobilePhone", "type": "Phone", "ordinal": 2 },
    { "name": "OrderAmount", "type": "Decimal", "ordinal": 3 }
  ]
}
```

> The presence of `dataExtensionFields` is confirmed. The per-field attribute names (`name`, `type`, `ordinal`, ...)
> follow the existing normalization rules; the exact attribute set observed live must be pinned by a captured
> fixture (§6.2) before release.

---

## 5. Relationship to earlier decisions

- **ADR-003** (typed-name fallback): still required for journeys whose Data Extension has no columns at configure
  time and for journey shapes that do not answer the entry-source request. Its 2026-10-26 conclusion that "a field
  list cannot be obtained from Journey Builder" is qualified: it holds for that journey shape, not universally.
- **ADR-004** (server lookup): demoted to a fallback for the common DE case; still the path when the entry source
  is not a Data Extension or the DE has no columns yet.
- **SPEC-NHT-009 §2.3** merge precedence: superseded by §2 of this spec (entry-source first).
- **SPEC-NHT-010** grace wait: unchanged — the entry-source response is still not guaranteed for every journey
  shape.

---

## 6. Verification

### 6.1 Automated

1. `npm test` — all suites green (existing 34 suites / 430+ tests plus the new cases).
2. New assertions cover: `dataExtensionFields` populates the catalog; entry-source list beats interaction list;
   interaction list still wins when the entry source has no usable list; standalone entry source carries
   `dataExtensionFields`; server lookup and typed-name fallback untouched.

### 6.2 Live (requester action)

1. Capture the full `requestedTriggerEventDefinition` payload (console, `?debugSchema=true`) from the test journey
   and save it as a fixture; add a normalizer test locked to it. This pins the per-field attribute names.
2. Open the activity in a Journey with a Data Extension entry source; confirm the field dropdown lists the DE
   fields **without** the server lookup configured.
3. Re-run the 2026-10-26 journey shape (DE with no columns) to confirm the typed-name fallback still works.

---

## 7. Out of scope

- Binding syntax (ADR-003 V1), saved-state location (V2), `inArguments` shape (V3).
- Removing `requestInteraction` — it remains the key source and the basis for the entry-source-changed notice.
- Removing the server lookup (ADR-004) or the typed-name fallback (ADR-003).