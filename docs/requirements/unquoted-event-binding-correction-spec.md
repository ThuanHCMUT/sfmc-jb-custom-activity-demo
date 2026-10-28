# Correction Spec — Unquoted Event Binding Syntax

| Field | Value |
|---|---|
| Document ID | SPEC-NHT-011 |
| Version | 1.0 |
| Status | Executed (2026-10-26); 36 suites / 468 tests green; live gate B pending |
| Date | 2026-10-26 |
| Author | Solution Architect |
| Related | [ADR-003](../adr/ADR-003-entry-de-field-source.md) (reference check, V1), [SPEC-NHT-008](./entry-de-field-correction-spec.md) |

> **Scope note.** The solution-architect agent is scoped to `docs/`. The code change is specified for the build agent.

---

## 1. Decision

Build Event bindings in the unquoted form `{{Event.<eventDefinitionKey>.<FieldName>}}`.

Reason: the only sample reported to work in Journey Builder for this project uses the unquoted form (ADR-003, reference
check). Field names are already restricted to `^[A-Za-z_][A-Za-z0-9_]*$` (SPEC-NHT-008), so no quoting is needed for
safety. Live gate B still confirms the decision with one test contact.

## 2. Change

### 2.1 `public/js/shared/event-binding-builder.js`

Only the expression changes. Current code (ADR-003 says ~L42):

```js
// before
return { valid: true, value: `{{Event.${eventDefinitionKey}."${bindingPath}"}}` };

// after
return { valid: true, value: `{{Event.${eventDefinitionKey}.${bindingPath}}}` };
```

Keep the existing validation of `eventDefinitionKey` (`SAFE_EVENT_DEFINITION_KEY`) and of `bindingPath`. Add a check
that `bindingPath` matches `^[A-Za-z_][A-Za-z0-9_]*$`, because the unquoted form is only valid for plain identifiers.
Return the existing error code when it does not match.

### 2.2 Callers and tests

Every assertion that expects the quoted form changes to the unquoted form. Known locations (found by search in review):
`tests/deployment/lifecycle-routes.test.js` (expected `{{Event.ORDER_ENTRY_EVENT."MobilePhone"}}`), `tests/ui/binding-builder.test.js`,
`tests/ui/flat-inarguments` tests, and the mapping tests that check `value`. The build agent must search for `."` in
`tests/` and `public/` and update every match. Do not change assertions unrelated to binding syntax.

Add one test: a `bindingPath` containing a space or a hyphen is rejected, not quoted.

## 3. Verification

1. `npm test` — all suites green.
2. Inside Journey Builder (requester): save an activity with typed field names, run one test contact, and confirm the
   typed Data Extension column resolves to its value (live gate B). If the values come through empty, revert the
   change in §2.1 and report it; ADR-003 V1 is then re-opened.
