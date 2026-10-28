# Correction Spec — Expose `/config.json` and `/public/config.json`

| Field | Value |
|---|---|
| Document ID | SPEC-NHT-004 |
| Version | 1.0 |
| Status | Ready to implement |
| Date | 2026-10-26 |
| Author | Solution Architect |
| Related | [SRS §6 Activity Definition](./notification-hub-template-api-srs.md), [ADR-002](../adr/ADR-002-activity-config-json-alignment.md), [SPEC-NHT-003](./activity-config-correction-spec.md) |

> **Scope note.** This document specifies the exact changes to apply. As the solution-architect agent is scoped to
> `docs/`, the source/test files below are NOT edited here; every change is given as a precise before/after so the
> build agent can apply it mechanically.

> **Update (SPEC-NHT-013, 2026-10-27).** A third alias is added: `GET /regional/config.json` serves the same
> definition, for deployments whose activity endpoint is `https://<host>/regional/` (the configModal path).
> See [regional-config-json-correction-spec.md](./regional-config-json-correction-spec.md).

---

## 1. Requirement

Serve the same Journey Builder activity definition at **two public paths**:

- `GET /config.json` (existing — used when the activity endpoint is the service root)
- `GET /public/config.json` (new — used when the activity endpoint is configured as `https://<host>/public`,
  which some Marketing Cloud deployments use)

Both paths MUST be publicly accessible (no JWT, no auth), return `application/json`, and carry
`Cache-Control: no-store`.

---

## 2. Change — `server/routes/config.routes.js`

Register both paths against the same handler (the definition is built once):

```js
// before
export function createConfigRouter({ config }) {
  const router = Router();
  const definition = buildActivityConfig({ publicBaseUrl: config.publicBaseUrl, requireJwt: config.requireJwt });

  router.get('/config.json', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.status(200).json(definition);
  });

  return router;
}

// after
export function createConfigRouter({ config }) {
  const router = Router();
  const definition = buildActivityConfig({
    publicBaseUrl: config.publicBaseUrl,
    requireJwt: config.requireJwt,
    securityContextKey: config.securityContextKey,
  });

  const sendDefinition = (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.status(200).json(definition);
  };

  router.get('/config.json', sendDefinition);
  router.get('/public/config.json', sendDefinition);

  return router;
}
```

Notes:

- The handler is extracted once and reused, so both paths return byte-identical bodies.
- `server/app.js` needs **no change**: `app.use(createConfigRouter({ config }))` is mounted before
  `express.static(publicDir)`, so `/public/config.json` matches the router first and never falls through to the
  static file server or the 404 handler.
- No collision with the static UI: `express.static(publicDir)` serves the `public/` directory **at the root**
  (`/index.html`, `/css/...`, `/js/...`); `/public/...` is not a static path.
- The `securityContextKey` threading from [SPEC-NHT-003](./activity-config-correction-spec.md) is included in the
  `after` block so both changes land together.

---

## 3. Test update — `tests/deployment/lifecycle-routes.test.js`

Add a companion test next to the existing `GET /config.json` test (L89–96):

```js
it('GET /public/config.json serves the same activity definition', async () => {
  const root = await request(app).get('/config.json');
  const res = await request(app).get('/public/config.json');

  expect(res.status).toBe(200);
  expect(res.headers['content-type']).toMatch(/application\/json/);
  expect(res.body).toEqual(root.body);
});
```

---

## 4. Documentation updates (this package)

| File | Change |
|---|---|
| `docs/requirements/notification-hub-template-api-srs.md` | Add FR-CFG-006 (dual-path exposure) + acceptance criterion to §6; bump revision to 1.3. |
| `README.md` (build-agent follow-up; outside `docs/`) | Endpoint table: add `GET /public/config.json` — "Activity definition, alias of `/config.json` for deployments whose activity endpoint is `https://<host>/public`". |

---

## 5. Verification

1. `npm test` — lifecycle-routes suite green (both paths asserted).
2. `GET /config.json` and `GET /public/config.json` both return 200, `application/json`, identical bodies, and
   `Cache-Control: no-store`.
3. In Marketing Cloud, the activity endpoint may be set to either the service root or `https://<host>/public`;
   both resolve the activity definition.