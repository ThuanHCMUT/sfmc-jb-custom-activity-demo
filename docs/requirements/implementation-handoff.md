# Implementation Handoff — Apply the Approved Docs to the Code

| Field | Value |
|---|---|
| Document ID | HANDOFF-001 |
| Version | 1.0 |
| Status | Executed (2026-10-26) |
| Date | 2026-10-26 |
| Author | Solution Architect |
| Source of truth | The specs listed below; this manifest is the execution order |

> **Execution record.** All four phases were executed by the build agent on 2026-10-26. Result: **34 test
> suites / 434 tests green**; `GET /config.json` and `GET /public/config.json` serve byte-identical definitions
> with `configModal.url` → `{PUBLIC_BASE_URL}/regional/`; the catalog serves canonical codes with `ZALO`→`ZNS`
> alias resolution; `/regional/` serves the Custom Activity UI. Docs updated to match: SRS-NHT-001 v1.6,
> DD-NHT-001 v1.2, RTM-NHT-001 v1.1.

> **Purpose.** This agent is scoped to `docs/` (documentation only) and cannot edit source files. This manifest
> consolidates every approved change from the specs into one dependency-ordered checklist the **build agent**
> executes mechanically. Each item cites the spec section with the exact before/after.
>
> **Review findings (docs consistency).**
> 1. `ADR-002` said the config modal points at the public root. Corrected to `/regional/` per SPEC-NHT-006.
> 2. `activity-config-correction-spec.md` (SPEC-NHT-003) §2.3 and §1 still show `configModal.url` at the root.
>    Superseded by SPEC-NHT-005 and SPEC-NHT-006. The build agent must use the `/regional/` version and ignore the root.
> 3. `config-exact-alignment-spec.md` (SPEC-NHT-005) and the SRS (FR-CFG-003, v1.5) now agree on `/regional/`.
> 4. Blocker: the build agent must add `SFMC_SECURITY_CONTEXT_KEY` (Phase 2.1) before `/config.json` is valid in
>    production, or startup will fail the new production check.

---

## Phase 1 — Template catalog taxonomy (ADR-001 / SPEC-NHT-001)

| # | File | Change | Reference |
|---|---|---|---|
| 1.1 | `server/models/templateModel.js` | `CHANNEL_CODES` → `ZNS, CHATAPP, SMS, LIVECHAT, BRC_ZALO`; alias map adds `zalo→ZNS`, `zalozns→ZNS`, `livechat→LIVECHAT`, `zalobrc→BRC_ZALO`, `broadcastoa→BRC_ZALO`; update header comment | `template-catalog-correction-spec.md` §3 |
| 1.2 | `server/data/templates.json` | Replace file with `docs/requirements/corrected-server-data-templates.json` (channels → `ZNS`/`CHATAPP`/`BRC_ZALO`; ChatApp addresses → `phone`; keys/displayNames/content/params unchanged) | `template-catalog-correction-spec.md` §2 |
| 1.3 | `public/js/domain/channels.js` | `CHANNELS` → 5 entries (`ZNS` "Zalo ZNS", `CHATAPP` "Chat App", `SMS`, `LIVECHAT` "Live Chat", `BRC_ZALO` "Zalo BRC / Broadcast OA") with `aliases`; `toChannelCode` and `isSupportedChannel` alias-aware | `template-catalog-correction-spec.md` §4 |
| 1.4 | Tests | `tests/templateModel.test.js`, `tests/templateChannelFilter.test.js`, `tests/templateRepository.test.js`, `tests/templateController.test.js`, `tests/ui/channel-selection.test.js`, `tests/ui/activity-loader.test.js`, `tests/ui/template-preview.test.js` — update per the assertion table | `template-catalog-correction-spec.md` §6 |

## Phase 2 — config.json exact alignment + dual path (ADR-002 / SPEC-NHT-003 / SPEC-NHT-005 / SPEC-NHT-004)

| # | File | Change | Reference |
|---|---|---|---|
| 2.1 | `server/config.js` | Add `SFMC_SECURITY_CONTEXT_KEY` → `securityContextKey`; production validation when `SFMC_REQUIRE_JWT=true`; add to frozen config object | `activity-config-correction-spec.md` §3 |
| 2.2 | `server/services/activity-config-builder.js` | Whole-file replacement: top-level `name`/`description`; `metaData.category: "Custom"`; `securityOptions.securityContext` on execute + save/publish/validate/stop (omit when JWT off); `inArguments` defaults for the 5 fixed keys; `outArguments` `{ success, status }`; sample timings (10000/1/1000/6); schema `dataType/isNullable/direction`; `copySettings`; **`configModal: { url: url('/regional/'), height: 700, width: 900, fullscreen: true }`**; no `useJwt`, no `verb` | `config-exact-alignment-spec.md` §2 + `regional-ui-restructure-spec.md` §4 |
| 2.3 | `server/routes/config.routes.js` | Thread `securityContextKey`; extract handler; register `GET /config.json` **and** `GET /public/config.json` | `activity-config-correction-spec.md` §4 + `config-public-path-correction-spec.md` §2 |
| 2.4 | Tests | `tests/deployment/activity-config-and-adapters.test.js` (securityOptions, schema shape, name/category/configModal/copySettings, sample timings), `tests/deployment/config.test.js` (`SFMC_SECURITY_CONTEXT_KEY`), `tests/deployment/lifecycle-routes.test.js` (`/public/config.json` companion) | `config-exact-alignment-spec.md` §5, `config-public-path-correction-spec.md` §3 |

## Phase 3 — Regional UI entry (SPEC-NHT-006)

| # | File | Change | Reference |
|---|---|---|---|
| 3.1 | `server/app.js` | Add `app.use('/regional', express.static(publicDir, { index: 'index.html', dotfiles: 'ignore' }));` after the root static mount | `regional-ui-restructure-spec.md` §3 |
| 3.2 | Tests | `tests/deployment/lifecycle-routes.test.js` — add `GET /regional/` serves the UI test; update configModal assertion in `activity-config-and-adapters.test.js` | `regional-ui-restructure-spec.md` §5 |

## Phase 4 — Environment and README

| # | File | Change |
|---|---|---|
| 4.1 | `.env.example` | Add `SFMC_SECURITY_CONTEXT_KEY=` (External Key of the Installed Package JWT Signing component; required in production when `SFMC_REQUIRE_JWT=true`) |
| 4.2 | `README.md` | Endpoint table: add `GET /public/config.json` and `GET /regional/`; production-mode table: add `SFMC_SECURITY_CONTEXT_KEY`; §4 checklist: step for the regional configModal URL |

---

## Phase 5 — Follow-up fix: vendor the missing Postmonger SDK (SPEC-NHT-007)

Discovered 2026-10-26 during the Salesforce smoke test: `public/js/vendor/postmonger.js` (loaded by
`index.html` L170) does not exist in the repository, so `/regional/js/vendor/postmonger.js` (and the root
equivalent) return 404 and the Postmonger bridge cannot initialize inside Journey Builder.

**Status: Executed (2026-10-26).** `public/js/vendor/postmonger.js` added (v0.0.14, 8,190 bytes, byte-identical
to the canonical source); `tests/ui/postmonger-sdk-presence.test.js` added. `npm test`: 35 suites / 436 tests
green; local `GET /js/vendor/postmonger.js` and `GET /regional/js/vendor/postmonger.js` → 200. Awaiting
redeploy + in-Journey-Builder re-verification by the requester.

| # | File | Change | Reference |
|---|---|---|---|
| 5.1 | `public/js/vendor/postmonger.js` | NEW — vendor the official Postmonger SDK v0.0.14 from `https://raw.githubusercontent.com/kevinparkerson/postmonger/master/postmonger.js` (byte-identical, 8,190 bytes; MIT/new BSD) | `vendored-postmonger-correction-spec.md` §4.1 |
| 5.2 | `tests/ui/postmonger-sdk-presence.test.js` | NEW — regression test: file exists at the expected path; loaded in a `vm` sandbox it exposes `window.Postmonger.Session` | `vendored-postmonger-correction-spec.md` §4.2 |

Verification: `npm test` green (34 + 1 suites); local `GET /js/vendor/postmonger.js` and
`GET /regional/js/vendor/postmonger.js` → 200; after redeploy, `https://customactivitydemo.onrender.com/regional/js/vendor/postmonger.js` → 200 and the activity connects to Journey Builder (no console 404).

---

## Verification (run after all phases)

```bash
npm test                                   # all suites green
# manual smoke (dev):
curl -s localhost:3000/config.json | jq .userInterfaces.configModal   # {url: ".../regional/", height:700, width:900, fullscreen:true}
curl -s localhost:3000/public/config.json | jq .name                  # "Notification Hub"
curl -s "localhost:3000/api/templates?channel=Zalo" | jq '.items[].channel'   # all "ZNS" (alias)
curl -s "localhost:3000/api/templates?channel=ZNS"  | jq '.items[].channel'   # same 2 items
curl -s -o /dev/null -w "%{http_code}" localhost:3000/regional/       # 200
```

Checklist from the specs: `GET /config.json` has no `useJwt`, no `verb`, no `access` schema keys; `category: "Custom"`; `securityOptions` on execute + all lifecycle endpoints when JWT on; both config paths byte-identical; `?channel=Zalo` ≡ `?channel=ZNS`; stored `ZALO` activities restore as `ZNS`; preview highlights `{variable}` chips (already implemented, FR-TPL-003.5).