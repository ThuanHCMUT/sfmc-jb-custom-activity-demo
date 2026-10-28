# Restructure Spec — Regional UI Entry and `configModal` URL

| Field | Value |
|---|---|
| Document ID | SPEC-NHT-006 |
| Version | 1.0 |
| Status | Ready to implement |
| Date | 2026-10-26 |
| Author | Solution Architect |
| Source | `Salesforce Marketing Cloud - Notification Hub Custom Activity.md` (uploaded repo-structure guide) |
| Related | [SRS §6](./notification-hub-template-api-srs.md), [SPEC-NHT-005](./config-exact-alignment-spec.md), [SPEC-NHT-004](./config-public-path-correction-spec.md) |

> **Scope note.** This document specifies the exact changes to apply. As the solution-architect agent is scoped to
> `docs/`, the source/test files below are NOT edited here; every change is given as a precise before/after so the
> build agent can apply it mechanically.

---

## 1. Objective

Restructure the app so the Custom Activity configuration UI is reachable at a **regional path** and
`config.json` advertises it, following the uploaded repository guide:

```json
"userInterfaces": {
  "configModal": {
    "url": "https://domain/regional/",
    "height": 700,
    "width": 900,
    "fullscreen": true
  }
}
```

**All other APIs stay as-is** (`/api/templates`, `/journey/*`, `/health`, `/ready`, `/config.json`,
`/public/config.json`).

---

## 2. Why `/regional/`

The guide's target repository serves the UI from `public/regional/index.html` and points
`configModal.url` at `https://domain/regional/`. Journey Builder opens the config modal at that URL, so the
service MUST serve the Custom Activity UI at `/regional/`.

Because the UI already uses **relative asset paths** (`css/main.css`, `js/app.js`, `js/vendor/postmonger.js`),
mounting the existing `public/` directory at `/regional` serves the same UI with zero duplication and no asset
rewrites.

---

## 3. Change 1 — `server/app.js`: serve the UI at `/regional`

```js
// before
// Activity UI served from the public root
app.use(express.static(publicDir, { index: 'index.html', dotfiles: 'ignore' }));

// after
// Activity UI served from the public root
app.use(express.static(publicDir, { index: 'index.html', dotfiles: 'ignore' }));
// Regional entry advertised as configModal.url (https://<host>/regional/)
app.use('/regional', express.static(publicDir, { index: 'index.html', dotfiles: 'ignore' }));
```

Effects:

- `GET /regional/` and `GET /regional/index.html` serve the Custom Activity UI (200).
- Relative assets resolve under `/regional/` (`/regional/css/main.css`, `/regional/js/app.js`).
- No other route changes; the API surface is untouched.

> Alternative (only if a physical `public/regional/index.html` is required by the deployment): copy
> `public/index.html` (+ assets) into `public/regional/` and mount
> `express.static(path.join(publicDir, 'regional'))` at `/regional`. The mount in Change 1 is preferred because it
> cannot drift from the root UI.

---

## 4. Change 2 — `server/services/activity-config-builder.js`: advertise the regional modal

```js
// before
userInterfaces: {
  configModal: {
    fullscreen: true,
    url: url('/'),
  },
},

// after
userInterfaces: {
  configModal: {
    url: url('/regional/'),
    height: 700,
    width: 900,
    fullscreen: true,
  },
},
```

`url('/regional/')` yields `https://<host>/regional/` exactly as the guide specifies. `height`/`width` are the
modal dimensions Journey Builder uses (kept alongside `fullscreen: true` per the guide).

---

## 5. Test updates

### 5.1 `tests/deployment/activity-config-and-adapters.test.js`

Update the configModal assertion (introduced in SPEC-NHT-005 §5.1):

```js
// before
expect(config.userInterfaces.configModal.url).toBe(`${BASE}/`);

// after
expect(config.userInterfaces.configModal).toEqual({
  url: `${BASE}/regional/`,
  height: 700,
  width: 900,
  fullscreen: true,
});
```

### 5.2 `tests/deployment/lifecycle-routes.test.js`

Add a regional-UI test next to the existing `GET /` test (L98–103):

```js
it('GET /regional/ serves the Custom Activity UI', async () => {
  const res = await request(app).get('/regional/');

  expect(res.status).toBe(200);
  expect(res.text).toContain('Notification Hub Custom Activity');
});
```

---

## 6. Documentation updates (this package)

| File | Change |
|---|---|
| `docs/requirements/notification-hub-template-api-srs.md` | Amend FR-CFG-003: `configModal.url` MUST point at the regional entry `{PUBLIC_BASE_URL}/regional/` with `height: 700`, `width: 900`, `fullscreen: true`; bump revision to 1.5. |
| `docs/requirements/config-exact-alignment-spec.md` | Update §2/§4 `configModal` to the regional URL + sizing (consistency with this spec). |
| `README.md` (build-agent follow-up; outside `docs/`) | Endpoint table: add `GET /regional/` — "Custom Activity UI (configModal entry)". |

---

## 7. Guide items intentionally NOT changed

| Guide item | Disposition |
|---|---|
| `public/config.json` as a static file | Kept dynamic: `GET /config.json` and `GET /public/config.json` (SPEC-NHT-004) serve the generated definition; a static file would drift from `PUBLIC_BASE_URL`. **Update (SPEC-NHT-013):** the generated definition is additionally served at `/regional/config.json`, so the activity endpoint may be the root, `/public`, or `/regional/`. |
| `functions/`, `lib/`, `examples/`, `original-ui/` folders | Out of scope; the current `server/` layout already provides the same responsibilities (controllers/services/middleware). Moving folders is a no-op with high regression risk. |
| `public/js/vendor/postmonger.js` | **Correction (SPEC-NHT-007):** this file was believed present ("verified in the current tree") but is MISSING from the repository — `public/js/vendor/` does not exist. `index.html` loads it as a classic script, so both `/js/vendor/postmonger.js` and `/regional/js/vendor/postmonger.js` return 404 and the Postmonger bridge fails inside Journey Builder. The fix (vendor the official v0.0.14 SDK at that path) is specified in [SPEC-NHT-007](./vendored-postmonger-correction-spec.md). |
| Journey lifecycle endpoints | Unchanged (guide mandates 200, never 501/404 — already satisfied). |
| Channel codes in the guide (`ZALO`, `BRC Zalo`) | The guide predates the taxonomy correction; canonical codes per ADR-001 stand. |

---

## 8. Verification

1. `npm test` — all suites green.
2. `GET /regional/` returns the UI (200); `GET /regional/css/main.css` and `GET /regional/js/app.js` resolve.
3. `GET /config.json` — `userInterfaces.configModal` equals
   `{ "url": "https://<host>/regional/", "height": 700, "width": 900, "fullscreen": true }`.
4. `GET /api/templates`, `/journey/*`, `/health`, `/ready`, `/config.json`, `/public/config.json` behave exactly
   as before.
5. In Marketing Cloud, the activity config modal opens from `https://<host>/regional/`.