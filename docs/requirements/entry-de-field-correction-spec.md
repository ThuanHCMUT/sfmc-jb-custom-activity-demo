# Correction Spec — Entry Data Extension Fields Without a Metadata Field List

| Field | Value |
|---|---|
| Document ID | SPEC-NHT-008 |
| Version | 1.0 |
| Status | Executed (2026-10-26); live gates B–E still open |
| Date | 2026-10-26 |
| Author | Solution Architect |
| Decision | [ADR-003](../adr/ADR-003-entry-de-field-source.md) (hybrid field source, manual fallback) |
| Related | [SPEC-NHT-007](./vendored-postmonger-correction-spec.md), README §9.4 / §9.10–9.11 |

> **Scope note.** The solution-architect agent is scoped to `docs/`. The source and test changes below are
> specified precisely so the build agent can apply them. Where a file was not fully read during review, the
> change says so and the build agent must verify before editing.

---

## 1. Problem

Field mapping needs a READY field catalog. The catalog is filled only from `requestedInteraction` metadata. When
Journey Builder omits the field list, which the official sample shows is the normal case, every field mapping is
rejected and Next stays disabled. The designer cannot finish the activity, so the DE data cannot be used.

Evidence (current code):

| Location | Behavior |
|---|---|
| `public/js/domain/mappingValidator.js` L98 | `catalogReady = Boolean(fieldCatalog) && fieldCatalog.fields.length > 0` |
| `public/js/domain/mappingValidator.js` L147–148 | field mapping with a non-ready catalog → error `SCHEMA_UNAVAILABLE` |
| `public/js/app.js` L192 | `fieldsEnabled = schema READY && catalog.fields.length > 0` |
| `public/js/flat-inarguments-builder.js` L63 | `findField(fieldCatalog, mapping.value)` — field must exist in catalog |
| `public/js/schema/entry-schema-normalizer.js` header | records that the official sample has no field list in `triggers[0].metaData` |

---

## 2. Target behavior

1. Event definition key is read from `triggers[0].metaData.eventDefinitionKey` (unchanged). If missing, Next stays
   disabled and the status says so. This is the only hard requirement for DE data.
2. The field catalog is used when Journey Builder provides it. Otherwise field mapping accepts a **typed field
   name**.
3. A typed field name must match `^[A-Za-z_][A-Za-z0-9_]*$` (the same rule as `SAFE_FIELD_NAME` in
   `entry-schema-normalizer.js`).
4. Schema discovery failure is informational. It never blocks Next, the mapping table, or saving.
5. Bindings are always produced by `buildEventBinding` (`public/js/shared/event-binding-builder.js`). No other
   module builds `{{Event...}}` strings.

---

## 3. Changes

### 3.1 `public/js/domain/mappingValidator.js` — `validateFieldMapping`

Replace the catalog-not-ready branch (currently around L147–149) with:

```js
// before
if (!catalogReady) {
  return { valid: false, errors: [{ code: 'SCHEMA_UNAVAILABLE', targetKey, message: '...' }] };
}

// after
if (!catalogReady) {
  // No metadata field list: accept a typed, safe field name (ADR-003 decision 3).
  if (!SAFE_TYPED_FIELD.test(mapping.value ?? '')) {
    return { valid: false, errors: [{ code: 'FIELD_NAME_INVALID', targetKey, message: 'Use letters, numbers and underscores; the name must not start with a number.' }] };
  }
  return { valid: true, errors: [], warnings: [] };
}
```

Define `const SAFE_TYPED_FIELD = /^[A-Za-z_][A-Za-z0-9_]*$/;` at module scope.

Keep the `eventDefinitionKey` check (L143) unchanged. When the catalog IS ready, keep the existing
existence check and `SOURCE_*` stale rule (L152 onward).

> **Verify before editing:** read the full `validateFieldMapping` function. The line numbers above come from the
> review grep, not from a full read.

### 3.2 `public/js/flat-inarguments-builder.js` — field resolution (L63–64)

When the catalog is not ready, pass the typed name through instead of requiring a catalog entry:

```js
// before
const field = mapping.mode === MAPPING_MODES.FIELD ? findField(fieldCatalog, mapping.value) : null;

// after
const catalogReady = Boolean(fieldCatalog) && fieldCatalog.fields.length > 0;
const field = mapping.mode === MAPPING_MODES.FIELD
  ? (catalogReady ? findField(fieldCatalog, mapping.value) : { name: mapping.value, bindingPath: mapping.value })
  : null;
```

Then `buildBindingExpression({ mapping, field, eventDefinitionKey })` receives a field with `bindingPath`, which is
what it needs. Confirm that `buildBindingExpression` (`public/js/binding-builder.js` or
`public/js/shared/event-binding-builder.js`) reads only `bindingPath` for the field. **Verify before editing.**

### 3.3 `public/js/ui/mapping-table-row.js` — input when no catalog

When `fieldsEnabled` is false, render a text input for field mappings instead of a dropdown. The input commits on
change through the existing `onChange(targetKey, mapping)` callback with `{ mode: 'field', value: <typed> }`.
The row shows the hint "Type the Data Extension field name. The catalog is not available."

> **Verify before editing:** this file was not read during review. Confirm how the row chooses between dropdown
> and static input today, and reuse that branch rather than adding a parallel one.

### 3.4 `public/js/app.js`

No logic change to `computeSaveReadiness` (L569–591). Once §3.1 passes, readiness depends only on channel,
template, mappings and key. Keep `schemaLoading` in the readiness check.

Change the status text in `renderSchemaPanel` (or `schemaStatusPanel.js`) for `SCHEMA_NOT_AVAILABLE` to:
"Field list not provided by Journey Builder. Type the Data Extension field names in the mapping table."
This is informational, not an error.

### 3.5 `public/js/schema/entry-schema-provider.js`

No change required. `#run` already returns a result with `valid: false` and a `SCHEMA_NOT_AVAILABLE` error when the
field list is absent. The provider does not gate anything; only the consumers decide. **Verify** that no caller
treats `result.valid === false` as fatal (search `discover(` callers in `app.js`).

---

## 4. Tests

| File | Add or change |
|---|---|
| `tests/ui/mappingValidator.test.js` | Catalog not ready + safe typed name → valid. Catalog not ready + `Bad-Name` → `FIELD_NAME_INVALID`. Catalog ready + unknown field → unchanged error. Missing `eventDefinitionKey` → `EVENT_DEFINITION_KEY_MISSING` regardless of catalog. |
| `tests/ui/flat-inarguments-builder` (existing file that covers `buildFlatInArguments`) | Catalog not ready: a field mapping produces `{{Event.<KEY>."<Name>"}}` (the current binding form, see V1). |
| `tests/ui/mapping-table*.test.js` (existing) | Catalog not ready: field mapping row renders a text input and emits `{ mode: 'field', value }` on change. |
| `tests/ui/schema…` (existing) | `SCHEMA_NOT_AVAILABLE` does not change `computeSaveReadiness` to invalid when mappings are complete. |

Use the existing test helpers. Do not weaken current assertions. Where an existing test asserted the
`SCHEMA_UNAVAILABLE` error, change it to the new behavior and note it in the report.

---

## 5. Verification

1. `npm test` — all suites green.
2. Local (standalone mode `?standalone=true`) with the fixture: field mappings still work with the catalog.
3. Local with the catalog removed (force `fieldCatalog` empty, e.g. `?debugSchema=true` plus a
   test): a typed name produces a valid `inArguments` entry and Next is enabled once channel, template and
   mappings are complete.
4. Inside Journey Builder (requester action): Next/Done enables with a typed DE field name, and the activity
   saves. Then run live gate B (V1 binding syntax) with a real contact. If Journey Builder rejects the quoted form,
   switch the single `buildEventBinding` call to the unquoted form and record the result in ADR-003.

---

## 6. Explicitly out of scope

- Changing the saved-state location (V2) or the `inArguments` shape (V3). Both need live gates C–E first.
- Calling Salesforce REST APIs for DE metadata.
- Changing the binding syntax before live gate B has been run.
