# Correction Spec — Do Not Block on an Unanswered Entry-Source Response

| Field | Value |
|---|---|
| Document ID | SPEC-NHT-010 |
| Version | 1.0 |
| Status | Executed (2026-10-26); 36 suites / 466 tests green; live verification (§6) required |
| Date | 2026-10-26 |
| Author | Solution Architect |
| Related | [ADR-003](../adr/ADR-003-entry-de-field-source.md) (evidence section), [SPEC-NHT-009](./entry-field-discovery-correction-spec.md) |

> **Scope note.** The solution-architect agent is scoped to `docs/`. The code change below is specified for the
> build agent.

---

## 1. Problem

Live capture (ADR-003, "Evidence from the live capture"): the interaction returns the event key, and the
entry-source response (`requestedTriggerEventDefinition`) is never returned. The Data Extension has no fields before
the journey step, so no field list exists either way.

Current behavior (`public/js/schema/entry-schema-provider.js`, `#run`, L180–192):

- `#run` waits for **both** `#obtain(KIND.INTERACTION)` and `#obtain(KIND.ENTRY_SOURCE)` with `Promise.all`.
- The entry-source wait lasts the full `DISCOVERY_RESPONSE_TIMEOUT_MS` (8000 ms) when it is never answered.
- `discoverSchema()` in `public/js/app.js` sets the schema status to LOADING first, and
  `computeSaveReadiness()` requires `!schemaLoading`. Next stays disabled for the full 8 s on every activity
  open.

The key is already present in the interaction, so the wait adds nothing for this journey shape. It only delays
the designer.

---

## 2. Target behavior

1. When the interaction response contains a valid `eventDefinitionKey`, discovery does **not** wait the full
   deadline for the entry-source response. It waits at most `ENTRY_SOURCE_GRACE_MS = 1500` ms more, then proceeds
   with the interaction result. A late entry-source response is still cached and used by the next discovery.
2. When the interaction has **no** valid key, behavior is unchanged: wait for the entry-source response up to the
   full deadline, as today.
3. The field list merge (SPEC-NHT-009 §2.3) is unchanged. Typed-name fallback (ADR-003) is unchanged.

---

## 3. Change — `public/js/schema/entry-schema-provider.js`

Add the constant next to `DISCOVERY_RESPONSE_TIMEOUT_MS`:

```js
export const ENTRY_SOURCE_GRACE_MS = 1500;
```

Replace the `Promise.all` in `#run` with sequential awaits:

```js
// before
const [interaction, entrySource] = await Promise.all([
  this.#obtain(KIND.INTERACTION),
  this.#obtain(KIND.ENTRY_SOURCE),
]);

// after
const interaction = await this.#obtain(KIND.INTERACTION);
const hasKey = !interaction.failure && normalizeInteraction(interaction.payload).valid;
const entrySource = hasKey
  ? await this.#obtainWithin(KIND.ENTRY_SOURCE, ENTRY_SOURCE_GRACE_MS)
  : await this.#obtain(KIND.ENTRY_SOURCE);
```

Add `#obtainWithin(kind, ms)`: identical to `#obtain` but with the given deadline. It must still:

- resolve immediately from cache when a payload is already stored;
- clear its waiter on timeout and reset `#sent[kind]` so a later response is cached (not dropped), exactly as
  `#obtain` does today.

Refactor `#obtain(kind)` to call `#obtainWithin(kind, this.#timeoutMs)` so there is one implementation.

Keep `Promise.all`-free ordering safe: `#receive` must still resolve a waiter for ENTRY_SOURCE that is registered
during the grace wait.

---

## 4. Operational requirement (documented, not code)

The field names the designer types must exist as columns of the entry Data Extension **before** the journey is
activated. Add this to the README journey checklist (build-agent follow-up, outside `docs/`):

> Create the Data Extension columns that the activity maps before activating the journey. The activity cannot read
> them at configure time, and a typed name that is not a column resolves to an empty value at runtime.

---

## 5. Tests — `tests/schema/entry-schema-provider.test.js`

| Case | Expected |
|---|---|
| Interaction answers with a key; entry-source never answers | `discover()` resolves in about `ENTRY_SOURCE_GRACE_MS` (assert < 3000 ms with `responseTimeoutMs: 8000`), result `eventDefinitionKey` set, `SCHEMA_NOT_AVAILABLE` |
| Interaction answers with no key; entry-source never answers | Waits the full deadline (unchanged behavior) |
| Entry-source answers after the grace period | Cached; the next `discover()` uses it and returns its field list |
| Interaction with key and field list | Unchanged: no wait for entry-source beyond what is already cached |

Existing tests must still pass. If one asserted the `Promise.all` timing, update it and report the change.

---

## 6. Verification

1. `npm test` — all suites green.
2. Inside Journey Builder (requester): the Next button enables within about 2 seconds of opening the activity
   (previously about 8 seconds), with a typed field name and the mappings complete.
3. Live gate B (ADR-003 V1): run one test contact and confirm that the typed Data Extension column resolves.
