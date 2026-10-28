# Correction Spec — Serve the Activity Definition at `/regional/config.json`

| Field | Value |
|---|---|
| Document ID | SPEC-NHT-013 |
| Version | 1.0 |
| Status | Ready to implement |
| Date | 2026-10-27 |
| Author | Solution Architect |
| Related | [SPEC-NHT-004](./config-public-path-correction-spec.md), [SPEC-NHT-006](./regional-ui-restructure-spec.md), [ADR-002](../adr/ADR-002-activity-config-json-alignment.md) |

> **Scope note.** The solution-architect agent is scoped to `docs/`. The code change below is specified for the
> build agent. This spec describes behavior and route semantics only; it does not contain implementation code.

---

## 1. Problem

`configModal.url` advertises the configuration UI at `{PUBLIC_BASE_URL}/regional/` (SPEC-NHT-006). Journey Builder
fetches the activity definition from the **activity endpoint + `/config.json`**. When the activity endpoint in the
Installed Package is set to `https://<host>/regional/` (the same path as the config modal), Journey Builder
requests `https://<host>/regional/config.json`.

Current behavior:

- `GET /config.json` → 200, generated definition (`server/routes/config.routes.js`, root mount).
- `GET /public/config.json` → 200, same definition (SPEC-NHT-004).
- `GET /regional/config.json` → **404**. The `/regional` mount is `express.static(publicDir)` (SPEC-NHT-006,
  `server/app.js`), and `public/` contains no `config.json`; the config router is mounted at the root and does not
  register the `/regional/config.json` path.

So a deployment that points the activity endpoint at `/regional/` cannot resolve the activity definition, and the
activity does not appear in the palette / cannot be configured.

---

## 2. Target behavior

Serve the **same generated activity definition** at three public paths:

- `GET /config.json` (existing — activity endpoint at the service root)
- `GET /public/config.json` (existing — activity endpoint at `https://<host>/public`, SPEC-NHT-004)
- `GET /regional/config.json` (**new** — activity endpoint at `https://<host>/regional/`, the configModal path)

All three MUST:

- be publicly accessible (no JWT, no auth);
- return `application/json`;
- carry `Cache-Control: no-store`;
- return byte-identical bodies (one handler, one built definition).

---

## 3. Change — `server/routes/config.routes.js`

Register the path `/regional/config.json` against the existing `sendDefinition` handler, next to the
`/public/config.json` registration. The handler and the single `buildActivityConfig(...)` call are reused, so the
third path returns a byte-identical body by construction.

Notes:

- `server/app.js` needs **no change**: `app.use(createConfigRouter({ config }))` is mounted before the
  `express.static(publicDir)` root mount and before the `/regional` static mount, so `/regional/config.json`
  matches the router first and never falls through to the static file server or the 404 handler.
- No collision with the static UI: `express.static(publicDir)` at `/regional` serves `index.html`, `css/`, `js/`,
  `assets/`, `fixtures/`; `config.json` is not a static file, so the router is the only responder for that path.
- The definition remains dynamic (derived from `PUBLIC_BASE_URL`); no static `config.json` file is introduced
  (consistent with SPEC-NHT-006 §7).

---

## 4. Test update — `tests/deployment/lifecycle-routes.test.js`

Add a companion test next to the existing `GET /config.json` / `GET /public/config.json` tests:

- `GET /regional/config.json` returns 200;
- content-type is `application/json`;
- the body equals the body of `GET /config.json`.

---

## 5. Documentation updates

| File | Change |
|---|---|
| `docs/README.md` | Add SPEC-NHT-013 to the spec series line. |
| `docs/requirements/config-public-path-correction-spec.md` | Add a note that a third alias `/regional/config.json` is added by SPEC-NHT-013. |
| `docs/requirements/regional-ui-restructure-spec.md` | Extend the "Guide items intentionally NOT changed" row for `public/config.json`: the generated definition is additionally served at `/regional/config.json` (SPEC-NHT-013). |
| `docs/adr/ADR-002-activity-config-json-alignment.md` | Extend the `configModal.url` risk note: the activity endpoint may be `/regional/`, which requires `/regional/config.json` (SPEC-NHT-013). |
| `README.md` (build-agent follow-up; outside `docs/`) | Endpoint list (§9.23): add `GET /regional/config.json` — "Activity definition, alias of `/config.json` for deployments whose activity endpoint is `https://<host>/regional/`". Checklist step 4: note the activity endpoint may be the root, `/public`, or `/regional/`; each resolves `config.json`. |

---

## 6. Verification

1. `npm test` — lifecycle-routes suite green (three-path assertion).
2. `GET /config.json`, `GET /public/config.json`, `GET /regional/config.json` all return 200,
   `application/json`, identical bodies, `Cache-Control: no-store`.
3. `GET /regional/` still serves the UI (200) — the static mount is untouched.
4. In Marketing Cloud, the activity endpoint may be set to the service root, `https://<host>/public`, or
   `https://<host>/regional/`; all three resolve the activity definition, and the config modal opens from
   `https://<host>/regional/`.

---

## 7. Out of scope

- Changing the definition format (ADR-002) or the `configModal.url` value (SPEC-NHT-006).
- Serving a static `config.json` file from `public/` — the definition must stay dynamic.