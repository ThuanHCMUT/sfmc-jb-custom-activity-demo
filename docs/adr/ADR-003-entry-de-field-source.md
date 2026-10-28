# ADR-003: Source of Entry Data Extension Fields for Mapping

## Status

Accepted for the code path (SPEC-NHT-008 executed; 36 suites / 446 tests green). Open verification points V1–V3 remain for live Journey Builder gates B–E.

## Context

Journey Builder delivers the entry event to the Custom Activity through the Postmonger session:

1. `requestInteraction` is sent, `requestedInteraction` comes back.
2. The activity reads `triggers[0].metaData.eventDefinitionKey` to learn which Data Extension (DE) feeds the journey.

Our design also expects the DE **field list** in the same response (`metaData.schema` or `metaData.deSchema.fields`), so the UI can offer a dropdown of fields for each template parameter.

Symptom reported on 2026-10-26: the activity cannot obtain DE data. The field catalog stays empty, so:

- `public/js/domain/mappingValidator.js` L147–152 rejects every field mapping with a "catalog not ready" error (`SCHEMA_UNAVAILABLE`).
- `computeSaveReadiness()` in `public/js/app.js` therefore never becomes valid, and Next/Done stays disabled.
- `public/js/schema/entry-schema-normalizer.js` (header comment) already records that the official sample `sfmc-example-jb-custom-activity` does **not** include a field list in `triggers[0].metaData`.

A working reference project (provided by the requester) gets the data differently:

- It reads only `triggers[0].metaData.eventDefinitionKey`.
- The journey designer types the DE field names (`phoneField`, `customerIdField`, `voucherField`), validated with `^[A-Za-z0-9_]+$`.
- It builds Journey Builder Event bindings `{{Event.<key>.<Field>}}` itself and sends them in `inArguments`. Journey Builder resolves the value at execution time, so no field catalog is needed.

## Decision

Adopt a **hybrid field source** with a manual fallback:

1. **Event definition key** always comes from the interaction metadata (unchanged). If it is absent, the activity shows a recoverable error and keeps Next disabled.
2. **Field catalog** is populated from interaction metadata **only when present**. It is an enhancement, never a requirement.
3. **Field mapping** is valid when a key exists and the field name is a safe identifier:
   - If the catalog is ready, the field must exist in it (current behavior).
   - If the catalog is not ready, the name must match `^[A-Za-z_][A-Za-z0-9_]*$` and is used as typed. The designer sees a text input instead of a dropdown.
4. **Schema discovery failure** (`SCHEMA_NOT_AVAILABLE`) is informational. It must not block Next, the mapping table, or saving.
5. **Event binding** keeps the single shared builder (`public/js/shared/event-binding-builder.js`), so the rest of the system never builds bindings by hand.

Rejected alternatives:

- **Metadata only (current).** Fails whenever Journey Builder omits the field list, which the official sample shows is the normal case.
- **Manual entry only.** Gives up the auto-matching and validation the designer already relies on when the catalog is available.
- **Call a Salesforce REST API for DE fields.** Needs extra credentials and an installed-package scope that the MVP does not have. Out of scope for now.

## Consequences

### Positive

- Designers can complete the activity even when Journey Builder sends no field list.
- Behavior is identical to the working reference for the manual path, and richer when metadata is present.
- The fallback is a single validation branch, not a second UI.

### Negative

- Typed field names are not checked against the real DE schema until execution. A typo is caught only at runtime (the binding resolves to empty).
- Two code paths (catalog-ready and manual) must both be tested.

### Risks

- If Journey Builder rejects the `{{Event.<key>."<Field>"}}` form, every field binding fails. See open verification points below.

## Superseding evidence (2026-10-27)

A later live Journey Builder session (different journey shape: the entry Data Extension has columns at configure
time) **did** answer the entry-source request. `requestedTriggerEventDefinition` returned an event definition model
whose `dataExtensionFields` property carries the DE field list. The entry-source event definition is therefore a
real, journey-verified field source — see [ADR-005](./ADR-005-de-fields-from-entry-source-event-definition.md) and
[SPEC-NHT-012](../requirements/entry-source-dataextensionfields-correction-spec.md).

Qualification of the 2026-10-26 conclusion: "a field list cannot be obtained from Journey Builder" holds **for that
journey shape** (Data Extension with no columns before the step; entry-source request unanswered). It is not
universal. The typed-name fallback (decision 3) remains the supported design for the no-columns shape and for any
journey that does not answer the entry-source request.

## Evidence from the live capture (2026-10-26)

A real Journey Builder session returned this `requestedInteraction` payload. Values are trimmed and the key is redacted:

```
triggers[0] = {
  key: "TRIGGER", type: "EmailAudience",
  metaData: {
    eventDefinitionKey: "<redacted>",   // present, usable
    title: "Data Extension", chainType: "none",
    entrySourceGroupConfigUrl: "jb:///data/entry/audience/entrysourcegroupconfig.json"
  }
}
```

Findings:

1. **No field list in the interaction.** Neither `metaData.schema` nor `metaData.deSchema.fields` is present. The
   designer reported that the Data Extension has no fields before the journey step runs, so no field list exists to
   deliver at configure time.
2. **The entry-source response was never received.** Only the interaction arrived. The entry-source request
   (`requestTriggerEventDefinition`) went unanswered, and discovery waited the full 8 s deadline (SPEC-NHT-009).
3. **The event key is sufficient** to build bindings. The typed-name fallback (decision 3) was verified with this shape:
   discovery keeps the key, the mapping validates with an empty catalog, and `inArguments` contains
   `{{Event.<key>."<Field>"}}` bindings.

Consequence: a field list cannot be obtained from Journey Builder for this journey shape. The typed-name fallback is the
supported design, not a temporary workaround. The remaining risk moves to runtime (live gate B): a typed name that is not
a column of the Data Extension resolves to an empty value. The mitigation is operational: the Data Extension columns must
match the typed names before the journey is activated (SPEC-NHT-010 §4). The wait for the unanswered entry-source response
is addressed by SPEC-NHT-010.

## Reference implementation check (2026-10-26)

The requester supplied a sample Custom Activity reported to work in Journey Builder. Review against it:

1. **It does not read a Data Extension field list.** The sample reads only `triggers[0].metaData.eventDefinitionKey`
   from `requestedInteraction`. The field names are typed by the designer into `phoneField`, `customerIdField` and
   `voucherField`. This is the typed-name approach in decision 3, not a new field source.
2. **Binding syntax.** The sample builds `{{Event.<key>.<Field>}}` (unquoted). This code builds `{{Event.<key>."<Field>"}}`
   (quoted). The sample's field names are restricted to `^[A-Za-z0-9_]+$`, so the quoted form is not needed for them.
   The sample is the only evidence of a working binding in this project, so the unquoted form is adopted (SPEC-NHT-011).
   This decides V1 provisionally; live gate B still confirms it with a test contact.
3. **Saved state and input shape differ.** The sample stores its settings in `configurationArguments.notificationConfig`
   (V2) and sends one flat `inArguments` object with fixed keys (V3). Both differ from this code's decisions. They are
   not changed here: V2 and V3 need the live gates C–E before a choice is made, and the sample's fixed keys do not cover
   the dynamic template parameters this application needs.

## Open verification points (live gates, not decidable from docs)

These cannot be settled without a live Journey Builder session. Each one is listed so it is tested, not assumed.

| # | Question | Current design | Reference project | Gate |
|---|---|---|---|---|
| V1 | Event binding syntax | Quoted: `{{Event.KEY."Field"}}` (`event-binding-builder.js` L42) | Unquoted: `{{Event.KEY.Field}}` | Gate B |
| V2 | Where editor state is stored | `metaData.customActivityConfig` (README §9) | `configurationArguments.notificationConfig` | Gate D |
| V3 | Shape of `inArguments` | One object per dynamic key (`address__*`, `param__*`) | One flat object with fixed keys (`phone`, `customerId`, `voucher`) | Gate C / E |

The reference works in its own environment, which is evidence that V2 and V3 can work. It is not proof for this codebase. The team should choose after running gates B–E, not by copying the reference.

## References

- [SPEC-NHT-008](../requirements/entry-de-field-correction-spec.md) — implementation of this decision.
- [ADR-002](./ADR-002-activity-config-json-alignment.md) — activity definition alignment.
- README §9.4 (event bindings), §9.10–9.11 (schema discovery), §9.8 (manual test checklist).
