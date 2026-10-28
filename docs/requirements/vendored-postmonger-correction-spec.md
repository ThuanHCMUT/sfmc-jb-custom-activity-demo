# Correction Spec — Vendor the Missing Postmonger SDK (`public/js/vendor/postmonger.js`)

| Field | Value |
|---|---|
| Document ID | SPEC-NHT-007 |
| Version | 1.0 |
| Status | Executed (2026-10-26) |
| Date | 2026-10-26 |
| Author | Solution Architect |
| Related | [SPEC-NHT-006](./regional-ui-restructure-spec.md), [SRS §6](./notification-hub-template-api-srs.md), README §1/§9 (Postmonger integration) |

> **Execution record.** Applied by the build agent on 2026-10-26: `public/js/vendor/postmonger.js` added
> (8,190 bytes, byte-identical to the canonical v0.0.14 file); `tests/ui/postmonger-sdk-presence.test.js`
> added. `npm test`: **35 suites / 436 tests green**. Local smoke: `GET /js/vendor/postmonger.js` and
> `GET /regional/js/vendor/postmonger.js` both return 200. Remaining user action: redeploy to Render and
> re-verify inside Journey Builder (no console 404; `ready` emitted; schema discovery and save work).

> **Scope note.** This document specifies the exact change to apply. As the solution-architect agent is scoped to
> `docs/`, the source file below is NOT edited here; the complete remediation is given so the build agent can
> apply it mechanically.

---

## 1. Incident

**Symptom.** Opening the Custom Activity inside Salesforce Marketing Cloud Journey Builder logs:

```
GET https://customactivitydemo.onrender.com/regional/js/vendor/postmonger.js net::ERR_ABORTED 404 (Not Found)
```

The config modal itself loads (`GET /regional/` returns the UI), but the Postmonger bridge never initializes.

**Reported by.** Requester, 2026-10-26, against the Render deployment `customactivitydemo.onrender.com`.

---

## 2. Root cause

`public/index.html` line 170 loads the Postmonger SDK as a classic script:

```html
<script src="js/vendor/postmonger.js"></script>
```

The file **does not exist anywhere in the repository** — there is no `public/js/vendor/` directory:

```
$ ls public/js/
activity-loader.js  app.js  binding-builder.js  domain/  flat-inarguments-builder.js
postmonger-client.js  schema/  services/  shared/  standalone-adapter.js  state/  ui/
```

Consequences, in order:

1. `GET /js/vendor/postmonger.js` (root UI) and `GET /regional/js/vendor/postmonger.js` (config modal) both
   return **404** — the script tag fails to load, so `window.Postmonger` is never defined.
2. `public/js/postmonger-client.js` (lines 47–51) requires the global:

   ```js
   constructor({ Postmonger = globalThis.Postmonger } = {}) {
     if (!Postmonger || typeof Postmonger.Session !== 'function') {
       throw new Error('Postmonger SDK is not available.');
     }
   ```

   With the global missing, `new PostmongerClient()` throws and the app falls into the failure path in
   `public/js/app.js` (`createBridge`), so the activity cannot emit `ready`, cannot request the entry schema,
   and cannot persist via `updateActivity`. The UI renders but is **non-functional inside Journey Builder**.

3. **Why this went unnoticed until now.** The defect predates the `/regional/` work (the root UI has the same
   404). It surfaced only when the activity was actually opened inside Salesforce, because:
   - The unit tests inject a fake Postmonger (`tests/ui/postmonger-client.test.js`, `tests/ui/postmonger-interaction.test.js`)
     and never assert the real vendored file exists.
   - `SPEC-NHT-006 §7` and `README.md` (L89, L304, L310, L522) claimed the file was "already present …
     verified in the current tree". That claim was **incorrect** — the file was never committed.

---

## 3. Decision

Vendor the official Postmonger SDK at the path the app already expects, restoring the documented design
("Postmonger is the only vendored library", README §1):

- **File**: `public/js/vendor/postmonger.js`
- **Source**: `https://raw.githubusercontent.com/kevinparkerson/postmonger/master/postmonger.js`
  (canonical repo; the same file every SFMC custom-activity sample vendors).
- **Version**: `0.0.14` — verified in the file header (`Postmonger.js version 0.0.14`), matching the version
  already documented in README §9.4 ("the vendored SDK (`public/js/vendor/postmonger.js`, v0.0.14)").
- **License**: MIT or new BSD (file header lines 5–6) — vendoring is the standard, documented practice for this
  SDK; no attribution change needed beyond the file's own header comment.
- **Behavior**: when loaded as a classic script (no AMD, no CommonJS), the file sets `root.Postmonger =
  factory(root)` → `window.Postmonger`, exposing `Postmonger.Session` (line 212) — exactly the API
  `postmonger-client.js` consumes (`new Postmonger.Session()`, `on`/`trigger`).

No application code changes are required: `index.html`, `postmonger-client.js` and the `/regional` static mount
(from SPEC-NHT-006) are already correct; only the missing asset must be added.

---

## 4. Change — add the vendored SDK + regression test

### 4.1 `public/js/vendor/postmonger.js` (new file)

Download `postmonger.js` v0.0.14 from the canonical repo and place it at `public/js/vendor/postmonger.js`
(8,190 bytes). Do NOT minify or reformat; keep the file byte-identical to the source so the version header and
license comment stay intact.

### 4.2 Regression test — `tests/ui/postmonger-sdk-presence.test.js` (new file)

The existing Postmonger tests inject a fake SDK, so they cannot catch a missing vendored file. Add a presence
test that proves the real file ships and exposes the required API:

```js
/**
 * Guards the vendored Postmonger SDK (SPEC-NHT-007).
 * The classic <script src="js/vendor/postmonger.js"> must exist and expose
 * window.Postmonger.Session, otherwise the Custom Activity cannot talk to
 * Journey Builder (postmonger-client.js throws "Postmonger SDK is not available.").
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const vendorPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public/js/vendor/postmonger.js');

describe('vendored Postmonger SDK', () => {
  it('exists at public/js/vendor/postmonger.js', () => {
    expect(existsSync(vendorPath)).toBe(true);
  });

  it('exposes Postmonger.Session when loaded as a classic script', () => {
    const source = readFileSync(vendorPath, 'utf8');
    const sandbox = { window: {}, console };
    sandbox.window.window = sandbox.window;
    vm.runInNewContext(source, sandbox);

    expect(typeof sandbox.window.Postmonger).toBe('object');
    expect(typeof sandbox.window.Postmonger.Session).toBe('function');
  });
});
```

Notes:

- The `vm` sandbox simulates a browser without AMD/CommonJS so the file takes the `root.Postmonger = ...`
  branch (line 19 of the SDK).
- The test must run in the default (node) Jest environment — do NOT add `@jest-environment jsdom` (jsdom would
  provide `window` but the sandbox approach is deterministic and dependency-free).

### 4.3 Verification

1. `npm test` — all suites green, including the new presence test.
2. Local smoke:
   ```bash
   npm start &   # or the project's dev server
   curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/js/vendor/postmonger.js          # 200
   curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/regional/js/vendor/postmonger.js # 200
   curl -s http://localhost:3000/js/vendor/postmonger.js | head -1                                # "/*\n * Postmonger.js   version 0.0.14"
   ```
3. Redeploy to Render (user action): after the change is committed, Render redeploys
   `customactivitydemo.onrender.com`; re-open the activity in Journey Builder and confirm:
   - No 404 for `/regional/js/vendor/postmonger.js` (nor `/js/vendor/postmonger.js`).
   - The UI emits `ready`, requests the entry schema, and saves via `updateActivity` (live gates A/D).

---

## 5. Documentation updates (this package)

| File | Change |
|---|---|
| `docs/requirements/regional-ui-restructure-spec.md` | §7 table row "`public/js/vendor/postmonger.js` — Already present … verified in the current tree" → corrected: the file was MISSING and is added by this spec (SPEC-NHT-007). |
| `docs/requirements/implementation-handoff.md` | Add Phase 5 (follow-up fix) entry referencing this spec. |
| `README.md` (build-agent follow-up; outside `docs/`) | No change required — the existing statements ("Postmonger is the only vendored library", v0.0.14) become TRUE once the file is added. Optionally add a note that the file must not be removed. |

---

## 6. Why not the alternatives

| Alternative | Disposition |
|---|---|
| Remove the `<script src="js/vendor/postmonger.js">` tag | Rejected — Postmonger is REQUIRED for any Journey Builder custom activity; without it the app cannot communicate with Journey Builder at all. |
| Rewrite the bridge to drop the SDK | Rejected — would re-implement the Postmonger event protocol (cross-origin `postMessage` handshake, `ready`/`requestInteraction`/`updateActivity`), high effort and high regression risk; the SDK is the standard. |
| Use the npm package `postmonger` (v0.0.16) | Not needed — the canonical repo's `master/postmonger.js` is v0.0.14, matching the documented version; vendoring the file keeps the classic-script load path and avoids a build step. |
| Serve the SDK from a CDN | Rejected — the app is a vendored-library design (README §1); a CDN dependency would break offline/private deployments and diverge from the documented architecture. |

---

## 7. Verification checklist (final)

1. `public/js/vendor/postmonger.js` exists in git and is byte-identical to the canonical v0.0.14 file.
2. `npm test` green (34 + 1 new suites).
3. Local `GET /js/vendor/postmonger.js` and `GET /regional/js/vendor/postmonger.js` → 200.
4. Deployed `https://customactivitydemo.onrender.com/regional/js/vendor/postmonger.js` → 200 after redeploy.
5. Inside Journey Builder: no console 404; activity emits `ready`, discovers schema, saves (live gates A/D).