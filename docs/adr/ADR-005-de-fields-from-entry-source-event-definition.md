# ADR-005: Obtain Data Extension Fields from the Entry-Source Event Definition

## Status

Accepted (live-verified by the designer against a real Journey Builder session).

## Context

The Custom Activity needs the Data Extension (DE) field list of the Journey
entry source to drive field mapping. Two Postmonger requests can supply it:

1. `requestInteraction` → `requestedInteraction` — the interaction object,
   whose `triggers[0].metaData` carries the `eventDefinitionKey` and, when
   present, an embedded field list (`metaData.schema` or
   `metaData.deSchema.fields`). The official Salesforce sample
   (`sfmc-example-jb-custom-activity`) confirms the key location but contains
   **no** field list, so this path frequently yields an empty catalog.
2. `requestTriggerEventDefinition` → `requestedTriggerEventDefinition` — the
   entry-source event definition. Until now this path was implemented in the
   bridge wrapper but **not used** by discovery; the README marked it "kept
   for compatibility".

The designer tested the second path against a live Journey Builder session:

```js
var connection = new Postmonger.Session();
connection.trigger('requestTriggerEventDefinition');
connection.on('requestedTriggerEventDefinition', function (eventDefinitionModel) {
    // eventDefinitionModel.dataExtensionFields is the DE field list
    var deFields = eventDefinitionModel.dataExtensionFields;
    populateDropdown(deFields);
});
```

The test succeeded: Journey Builder answered `requestedTriggerEventDefinition`
with an event definition model whose `dataExtensionFields` property is
populated with the entry Data Extension field list. This is the first
**journey-verified** source of DE fields in this project.

## Decision

Make the entry-source event definition the **primary** source of Data
Extension fields:

1. **Parse `dataExtensionFields`** in `entry-schema-normalizer.js` as the
   first field-list candidate of the entry-source payload (before `schema`,
   `deSchema.fields`, `fields`).
2. **Flip the merge priority** in `entry-schema-provider.js`: when both the
   entry-source definition and the interaction metadata carry a usable field
   list, prefer `ENTRY_SOURCE_DEFINITION` over
   `INTERACTION_TRIGGER_METADATA`.
3. **Keep the remaining ladder intact** as fallbacks, in order:
   - interaction `triggers[0].metaData` embedded field list,
   - server-side lookup `GET /api/entry-fields` (ADR-004),
   - typed-name fallback (ADR-003).
4. **Keep `requestInteraction`** in the flow: it remains the key source for
   `eventDefinitionKey` and for detecting that the entry source changed since
   the activity was saved.
5. **Mirror the confirmed shape in standalone mode**: the standalone adapter
   answers `requestedTriggerEventDefinition` with a payload that also carries
   `dataExtensionFields`, so local development exercises the same code path
   as production.

## Consequences

### Positive

- **Journey-verified source of DE fields** — the field list is now read from
  a location confirmed against live Journey Builder, closing the largest
  uncertainty in entry-schema discovery (live gate A, partially).
- **Simpler happy path** — in the common case (entry source is a Data
  Extension) the catalog is populated directly from the entry-source event
  definition; the server-side lookup (ADR-004) becomes a fallback instead of
  a frequent dependency.
- **No new event surface** — both Postmonger events were already implemented
  in `postmonger-client.js` and `standalone-adapter.js`; this change only
  activates and prioritizes the existing path.
- **Better developer experience** — standalone mode now exercises the exact
  payload shape that production returns.

### Negative

- **Merge semantics change** — the provider currently asserts
  "prefers the interaction field list over the entry-source list"
  (`tests/schema/entry-schema-provider.test.js`); that expectation and
  related `source` assertions must be inverted.
- **Two requests still fired** — `requestInteraction` remains necessary for
  the key and the entry-source-changed notice, so the change does not reduce
  the number of Postmonger round trips.

### Risks

- **Per-field attribute shape not yet fixture-captured.** The presence of
  `dataExtensionFields` is confirmed, but the exact per-field attributes
  (`name`, `type`/`dataType`, `ordinal`, `isPrimaryKey`, ...) observed in the
  live payload have not been captured into a fixture. Mitigation: capture the
  live `requestedTriggerEventDefinition` payload into
  `public/fixtures/` and add a normalizer test before release (see the change
  spec, step 6).
- **Behavior may differ by journey type.** Entry sources other than a Data
  Extension (e.g. API event, Salesforce data entry) may answer differently or
  not at all. Mitigation: the existing deadline + `SCHEMA_NOT_AVAILABLE`
  recovery and the fallback ladder stay in place.
- **Attribute naming variance across accounts.** Some accounts historically
  expose `deSchema.fields`; `dataExtensionFields` is the confirmed name here.
  The normalizer keeps the other candidates, so a renamed property degrades
  gracefully instead of breaking.

## Related

- [SPEC-NHT-012](../requirements/entry-source-dataextensionfields-correction-spec.md) — implementation spec for
  this decision (approved 2026-10-27).
- [ADR-003](./ADR-003-entry-de-field-source.md) — typed-name fallback; its 2026-10-26 evidence is qualified by this
  decision.
- [ADR-004](./ADR-004-server-side-entry-field-lookup.md) — server-side field lookup; option E3 is now verified.
- [SPEC-NHT-009](../requirements/entry-field-discovery-correction-spec.md) §2.3 — merge precedence superseded by
  this decision.
- [SPEC-NHT-010](../requirements/entry-source-grace-correction-spec.md) — grace wait, unchanged.
- README sections affected: §9.9, §9.10, §9.11, §9.20, §9.23 (live gate A), roadmap §10 Phase 4.