# Correction Spec — `config.json` Exact Alignment with the Official Sample

| Field | Value |
|---|---|
| Document ID | SPEC-NHT-005 |
| Version | 1.0 |
| Status | Ready to implement |
| Date | 2026-10-26 |
| Author | Solution Architect |
| Supersedes | [SPEC-NHT-003](./activity-config-correction-spec.md) builder section (this spec is the consolidated, exact-alignment version) |
| Related | [ADR-002](../adr/ADR-002-activity-config-json-alignment.md), [SRS §6](./notification-hub-template-api-srs.md), [SPEC-NHT-004](./config-public-path-correction-spec.md) |

> **Scope note.** This document specifies the exact changes to apply. As the solution-architect agent is scoped to
> `docs/`, the source/test files below are NOT edited here; the complete target code is provided so the build
> agent can replace the file mechanically.

---

## 1. Objective

Make `GET /config.json` (and `/public/config.json`, see SPEC-NHT-004) follow the official Salesforce sample
**exactly** — same keys, same nesting, same `securityOptions`, same `category`, same schema shape — with values
adapted to this service (URLs from `PUBLIC_BASE_URL`, security key from `SFMC_SECURITY_CONTEXT_KEY`, name
"Notification Hub").

Deviations from the sample are deliberate and documented in §3.

---

## 2. Complete target — `server/services/activity-config-builder.js`

Replace the whole file body (keep `FIXED_SCHEMA_KEYS` and `LIFECYCLE_PATHS` unchanged):

```js
/*
 * Activity definition (config.json) builder.
 *
 * Every URL is derived from PUBLIC_BASE_URL. Nothing is duplicated in static files.
 * The format follows the official sample (sfmc-example-jb-custom-activity) exactly:
 *   - top-level name/description (required by Journey Builder)
 *   - metaData.category = "Custom" (palette group)
 *   - securityOptions.securityContext on execute and every lifecycle endpoint
 *   - schema entries use dataType / isNullable / direction
 *   - copySettings.ignoreArguments excludes the eventDefinitionKey from copies
 *
 * Deviations (documented in SPEC-NHT-005 §3):
 *   - one wizard step (the config modal is a single fullscreen step)
 *   - no runningModal / runningHover (no dedicated running-state UI)
 *   - securityOptions omitted entirely when JWT verification is off (development)
 */

export const FIXED_SCHEMA_KEYS = Object.freeze([
  'source',
  'channel',
  'templateKey',
  'templateVersion',
  'eventDefinitionKey',
]);

export const LIFECYCLE_PATHS = Object.freeze({
  save: '/journey/save',
  validate: '/journey/validate',
  publish: '/journey/publish',
  stop: '/journey/stop',
  execute: '/journey/execute',
});

/**
 * @param {{ publicBaseUrl: string, requireJwt: boolean, securityContextKey?: string }} config
 * @returns {object} the activity definition served at GET /config.json
 */
export function buildActivityConfig({ publicBaseUrl, requireJwt, securityContextKey }) {
  const url = (path) => `${publicBaseUrl}${path}`;
  const securityOptions = requireJwt
    ? { securityType: 'securityContext', securityContextKey: securityContextKey || '' }
    : null;
  const lifecycle = (path) =>
    securityOptions ? { url: url(path), securityOptions } : { url: url(path) };

  return {
    workflowApiVersion: '1.1',
    name: 'Notification Hub',
    description: 'Send a notification through Notification Hub.',
    metaData: {
      icon: url('/assets/icon.svg'),
      category: 'Custom',
      isConfigured: false,
    },
    type: 'REST',
    lang: {
      'en-US': {
        name: 'Notification Hub',
        description: 'Send a notification through Notification Hub.',
        label1: 'Configure notification',
      },
    },
    arguments: {
      execute: {
        inArguments: [
          {
            source: 'sf-marketing-cloud',
            channel: '',
            templateKey: '',
            templateVersion: '1',
            eventDefinitionKey: '',
          },
        ],
        outArguments: [{ success: true, status: 'accepted' }],
        timeout: 10000,
        retryCount: 1,
        retryDelay: 1000,
        concurrentRequests: 6,
        url: url(LIFECYCLE_PATHS.execute),
        ...(securityOptions ? { securityOptions } : {}),
      },
    },
    configurationArguments: {
      save: lifecycle(LIFECYCLE_PATHS.save),
      publish: lifecycle(LIFECYCLE_PATHS.publish),
      validate: lifecycle(LIFECYCLE_PATHS.validate),
      stop: lifecycle(LIFECYCLE_PATHS.stop),
    },
    wizardSteps: [{ label: 'label1', key: 'step1' }],
    userInterfaces: {
      configModal: {
        url: url('/regional/'),
        height: 700,
        width: 900,
        fullscreen: true,
      },
    },
    schema: {
      arguments: {
        execute: {
          inArguments: [
            { source: { dataType: 'Text', isNullable: false, direction: 'in' } },
            { channel: { dataType: 'Text', isNullable: false, direction: 'in' } },
            { templateKey: { dataType: 'Text', isNullable: false, direction: 'in' } },
            { templateVersion: { dataType: 'Text', isNullable: false, direction: 'in' } },
            { eventDefinitionKey: { dataType: 'Text', isNullable: false, direction: 'in' } },
          ],
          outArguments: [
            { success: { dataType: 'Boolean', isNullable: false, direction: 'out' } },
            { status: { dataType: 'Text', isNullable: false, direction: 'out' } },
          ],
        },
      },
    },
    copySettings: {
      allowCopy: true,
      ignoreArguments: ['eventDefinitionKey'],
    },
  };
}
```

Supporting changes (unchanged from SPEC-NHT-003 / SPEC-NHT-004):

- `server/config.js`: add `SFMC_SECURITY_CONTEXT_KEY` → `securityContextKey`; required in production when
  `SFMC_REQUIRE_JWT=true`.
- `server/routes/config.routes.js`: pass `securityContextKey`; serve the same definition at `/config.json` and
  `/public/config.json`.

---

## 3. Sample alignment map and deliberate deviations

| Sample key | Target value | Notes |
|---|---|---|
| `name` / `description` | `"Notification Hub"` / `"Send a notification through Notification Hub."` | Matched (required by JB). |
| `metaData.category` | `"Custom"` | Matched (palette group). |
| `metaData.icon` | `url('/assets/icon.svg')` | Sample uses relative path; absolute URL is equivalent and consistent with "every URL from PUBLIC_BASE_URL". |
| `lang.en-US` | name, description, `label1` | **Deviation**: sample has label1..3 for 3 wizard steps; this activity has 1 step, so only `label1`. |
| `arguments.execute.inArguments` | one object with the 5 fixed keys + defaults | Mirrors the sample's example-value pattern; JB prefills these. |
| `arguments.execute.outArguments` | `{ success: true, status: 'accepted' }` | Matches the real `/journey/execute` response. |
| `timeout` / `retryCount` / `retryDelay` / `concurrentRequests` | `10000` / `1` / `1000` / `6` | Sample values adopted (were 20000/2/1000/6). |
| `verb` | removed | Sample omits it; JB defaults to POST. |
| `securityOptions` | `{ securityType: "securityContext", securityContextKey }` on execute + save/publish/validate/stop | Matched. **Deviation**: omitted entirely when JWT is off (development) — an empty key would break registration. |
| `configurationArguments` order | save, publish, validate, stop | Sample order (JSON key order is cosmetic but matched). |
| `wizardSteps` | `[{ label: "label1", key: "step1" }]` | **Deviation**: sample has 3 steps; the config modal is a single fullscreen step (Postmonger `nextStep` flow would break with dummy steps). |
| `userInterfaces.configModal` | `{ url: url('/regional/'), height: 700, width: 900, fullscreen: true }` | Matched; regional entry per SPEC-NHT-006 (the guide's `https://domain/regional/`). |
| `userInterfaces.runningModal` / `runningHover` | omitted | **Deviation**: no dedicated running-state UI exists; pointing at the root would open the config UI as the running modal. Optional per SFMC; add later with real pages. |
| `schema.arguments.execute.inArguments` | `{ dataType, isNullable: false, direction: 'in' }` per fixed key | Matched (replaces the former `access: 'visible'` shape). |
| `schema.arguments.execute.outArguments` | `success` (Boolean) + `status` (Text) | Matches the real output. |
| `copySettings` | `{ allowCopy: true, ignoreArguments: ["eventDefinitionKey"] }` | Matched. |
| `metaData.isConfigured` | `false` | Extra vs sample; required by this app to gate the save button (README §9). |

---

## 4. Resulting `config.json` (production, JWT on)

```json
{
  "workflowApiVersion": "1.1",
  "name": "Notification Hub",
  "description": "Send a notification through Notification Hub.",
  "metaData": {
    "icon": "https://<host>/assets/icon.svg",
    "category": "Custom",
    "isConfigured": false
  },
  "type": "REST",
  "lang": {
    "en-US": {
      "name": "Notification Hub",
      "description": "Send a notification through Notification Hub.",
      "label1": "Configure notification"
    }
  },
  "arguments": {
    "execute": {
      "inArguments": [
        { "source": "sf-marketing-cloud", "channel": "", "templateKey": "", "templateVersion": "1", "eventDefinitionKey": "" }
      ],
      "outArguments": [{ "success": true, "status": "accepted" }],
      "timeout": 10000,
      "retryCount": 1,
      "retryDelay": 1000,
      "concurrentRequests": 6,
      "url": "https://<host>/journey/execute",
      "securityOptions": { "securityType": "securityContext", "securityContextKey": "<EXTERNAL_KEY>" }
    }
  },
  "configurationArguments": {
    "save": { "url": "https://<host>/journey/save", "securityOptions": { "securityType": "securityContext", "securityContextKey": "<EXTERNAL_KEY>" } },
    "publish": { "url": "https://<host>/journey/publish", "securityOptions": { "securityType": "securityContext", "securityContextKey": "<EXTERNAL_KEY>" } },
    "validate": { "url": "https://<host>/journey/validate", "securityOptions": { "securityType": "securityContext", "securityContextKey": "<EXTERNAL_KEY>" } },
    "stop": { "url": "https://<host>/journey/stop", "securityOptions": { "securityType": "securityContext", "securityContextKey": "<EXTERNAL_KEY>" } }
  },
  "wizardSteps": [{ "label": "label1", "key": "step1" }],
  "userInterfaces": {
    "configModal": { "url": "https://<host>/regional/", "height": 700, "width": 900, "fullscreen": true }
  },
  "schema": {
    "arguments": {
      "execute": {
        "inArguments": [
          { "source": { "dataType": "Text", "isNullable": false, "direction": "in" } },
          { "channel": { "dataType": "Text", "isNullable": false, "direction": "in" } },
          { "templateKey": { "dataType": "Text", "isNullable": false, "direction": "in" } },
          { "templateVersion": { "dataType": "Text", "isNullable": false, "direction": "in" } },
          { "eventDefinitionKey": { "dataType": "Text", "isNullable": false, "direction": "in" } }
        ],
        "outArguments": [
          { "success": { "dataType": "Boolean", "isNullable": false, "direction": "out" } },
          { "status": { "dataType": "Text", "isNullable": false, "direction": "out" } }
        ]
      }
    }
  },
  "copySettings": { "allowCopy": true, "ignoreArguments": ["eventDefinitionKey"] }
}
```

---

## 5. Test updates

### 5.1 `tests/deployment/activity-config-and-adapters.test.js`

- Builder calls: `buildActivityConfig({ publicBaseUrl: BASE, requireJwt: true, securityContextKey: 'EXTERNAL_KEY' })`.
- Replace `useJwt` assertions with `securityOptions` (see SPEC-NHT-003 §5.1).
- Update the schema-shape assertion (formerly L48–56):

```js
// before
expect(entry[key]).toEqual({ dataType: 'Text', direction: 'in', access: 'visible' });

// after
expect(entry[key]).toEqual({ dataType: 'Text', isNullable: false, direction: 'in' });
```

- Add assertions for the sample-aligned fields:

```js
expect(config.name).toBe('Notification Hub');
expect(config.metaData.category).toBe('Custom');
expect(config.userInterfaces.configModal.url).toBe(`${BASE}/`);
expect(config.arguments.execute.timeout).toBe(10000);
expect(config.arguments.execute.retryCount).toBe(1);
expect(config.arguments.execute.verb).toBeUndefined();
expect(config.arguments.execute.inArguments[0]).toEqual({
  source: 'sf-marketing-cloud', channel: '', templateKey: '', templateVersion: '1', eventDefinitionKey: '',
});
expect(config.arguments.execute.outArguments).toEqual([{ success: true, status: 'accepted' }]);
expect(config.schema.arguments.execute.outArguments).toEqual([
  { success: { dataType: 'Boolean', isNullable: false, direction: 'out' } },
  { status: { dataType: 'Text', isNullable: false, direction: 'out' } },
]);
expect(config.copySettings).toEqual({ allowCopy: true, ignoreArguments: ['eventDefinitionKey'] });
expect(config.configurationArguments).toEqual(
  expect.objectContaining({ save: expect.anything(), publish: expect.anything(), validate: expect.anything(), stop: expect.anything() })
);
```

- Development (`requireJwt: false`): `securityOptions` undefined on execute and lifecycle; `name`/`category`/
  `configModal.url` still present.

### 5.2 `tests/deployment/config.test.js`

- Add `SFMC_SECURITY_CONTEXT_KEY: 'EXTERNAL_KEY'` to `prodEnv()`; assert `config.securityContextKey`; add the
  required-key validation test (see SPEC-NHT-003 §5.2).

### 5.3 `tests/deployment/lifecycle-routes.test.js`

- Add `GET /public/config.json` companion test (see SPEC-NHT-004 §3).

---

## 6. Verification

1. `npm test` — all suites green.
2. `GET /config.json` and `GET /public/config.json` return the §4 shape (byte-identical bodies).
3. Diff the output against the sample: every sample key present with the documented adaptations; no `useJwt`,
   no `verb`, no `access` in schema.
4. Development mode: no `securityOptions`; everything else unchanged.
5. In Marketing Cloud: activity appears under **Custom**; config modal opens; save/validate/publish/stop succeed
   with the JWT signed by the Installed Package secret whose External Key equals `SFMC_SECURITY_CONTEXT_KEY`.