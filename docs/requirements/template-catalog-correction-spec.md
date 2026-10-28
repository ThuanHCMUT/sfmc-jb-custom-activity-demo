# Correction Spec — Template Catalog Taxonomy Alignment & Preview Highlighting

| Field | Value |
|---|---|
| Document ID | SPEC-NHT-002 |
| Version | 1.0 |
| Status | Ready to implement |
| Date | 2026-10-26 |
| Author | Solution Architect |
| Related | [ADR-001](../adr/ADR-001-template-catalog-taxonomy-alignment.md), [SRS](./notification-hub-template-api-srs.md), [BRD](./notification-channels-brd.md), [Data Dictionary](./template-catalog-data-dictionary.md) |

> **Scope note.** This document specifies the exact changes to apply. As the solution-architect agent is scoped to
> `docs/`, the source/data/test files below are NOT edited here; the corrected data file is provided as a drop-in
> artifact ([`corrected-server-data-templates.json`](./corrected-server-data-templates.json)) and every code change is
> given as a precise before/after so the build agent can apply it mechanically.

---

## 1. Summary

Bring the MVP template catalog and the preview experience in line with the corrected channel taxonomy
(BRD-NHC-001 / SRS FR-TPL-005):

1. **`server/data/templates.json`** — use canonical channel codes (`ZNS`, `CHATAPP`, `BRC_ZALO`) and `phone`
   addresses everywhere.
2. **`server/models/templateModel.js`** — canonical registry `ZNS, CHATAPP, SMS, LIVECHAT, BRC_ZALO`; keep `ZALO`
   as an alias of `ZNS`.
3. **`public/js/domain/channels.js`** — corrected dropdown (5 channels, readable labels) with alias resolution.
4. **Preview highlighting** — already implemented in `public/js/ui/templatePreview.js` + CSS; no code change needed,
   only an explicit SRS requirement (FR-TPL-003.5) and verification.
5. **Tests** — update assertions that pinned the old four-code list; keep alias-based backward-compat coverage.

---

## 2. Data change — `server/data/templates.json`

Apply [`corrected-server-data-templates.json`](./corrected-server-data-templates.json) (identical structure, 8
items). Exact deltas:

| templateKey | Field | From | To |
|---|---|---|---|
| `chat.order.confirm` | `channel` | `ChatApp` | `CHATAPP` |
| `chat.order.confirm` | `addresses[0]` | `{ name: "chatUserId", required: true, type: "string" }` | `{ name: "phone", required: true, type: "phone" }` |
| `chat.order.cancel` | `channel` | `ChatApp` | `CHATAPP` |
| `chat.order.cancel` | `addresses[0]` | `{ name: "chatUserId", required: true, type: "string" }` | `{ name: "phone", required: true, type: "phone" }` |
| `fptlc.order-confirm.zns.6a12eabf` | `channel` | `Zalo` | `ZNS` |
| `vac.appointment.zns` | `channel` | `Zalo` | `ZNS` |
| `brc.account.created.zalo` | `channel` | `BRC Zalo` | `BRC_ZALO` |
| `brc.account.warning.zalo` | `channel` | `BRC Zalo` | `BRC_ZALO` |

Resulting channel distribution: `SMS: 2, CHATAPP: 2, ZNS: 2, BRC_ZALO: 2`.

**Unchanged** (backward compatibility, NFR-TPL-006): `templateKey`, `displayName`, `content`, `recipientFields`,
`params`, `version`.

---

## 3. Server model — `server/models/templateModel.js`

Replace the channel registry (lines 1–13 and the alias map) with:

```js
// Channels are stored internally as canonical codes
// (ZNS, CHATAPP, SMS, LIVECHAT, BRC_ZALO) per BRD-NHC-001 / SRS FR-TPL-005.
// "ZALO" is a legacy alias of ZNS (BR-CH-003): stored activities that reference
// the old code still resolve.

export const CHANNEL_CODES = Object.freeze({
  ZNS: 'ZNS',
  CHATAPP: 'CHATAPP',
  SMS: 'SMS',
  LIVECHAT: 'LIVECHAT',
  BRC_ZALO: 'BRC_ZALO',
});
```

Extend the alias map (normalization strips spaces/underscores/hyphens and lowercases):

```js
const CHANNEL_BY_NORMALIZED_NAME = Object.freeze({
  zns: CHANNEL_CODES.ZNS,
  zalo: CHANNEL_CODES.ZNS,        // legacy alias (BR-CH-003)
  zalozns: CHANNEL_CODES.ZNS,     // display name "Zalo ZNS"
  chatapp: CHANNEL_CODES.CHATAPP,
  sms: CHANNEL_CODES.SMS,
  livechat: CHANNEL_CODES.LIVECHAT,
  brczalo: CHANNEL_CODES.BRC_ZALO,
  zalobrc: CHANNEL_CODES.BRC_ZALO,
  broadcastoa: CHANNEL_CODES.BRC_ZALO,
});
```

Behavior after the change: `toChannelCode('Zalo') === 'ZNS'`, `toChannelCode('ZNS') === 'ZNS'`,
`toChannelCode('Livechat') === 'LIVECHAT'`, `SUPPORTED_CHANNELS === ['ZNS','CHATAPP','SMS','LIVECHAT','BRC_ZALO']`.

---

## 4. Client channel list — `public/js/domain/channels.js`

Replace the `CHANNELS` constant and make `isSupportedChannel` alias-aware:

```js
export const CHANNELS = Object.freeze([
  Object.freeze({ code: 'ZNS', label: 'Zalo ZNS', aliases: ['Zalo', 'ZALO', 'zns'] }),
  Object.freeze({ code: 'CHATAPP', label: 'Chat App', aliases: ['ChatApp', 'chat app', 'chatapp'] }),
  Object.freeze({ code: 'SMS', label: 'SMS' }),
  Object.freeze({ code: 'LIVECHAT', label: 'Live Chat', aliases: ['Livechat', 'live chat'] }),
  Object.freeze({ code: 'BRC_ZALO', label: 'Zalo BRC / Broadcast OA', aliases: ['BRC Zalo', 'ZaloBrc', 'Broadcast OA'] }),
]);

export function toChannelCode(value) {
  if (typeof value !== 'string') return null;
  const wanted = normalizeName(value);
  const match = CHANNELS.find(
    (channel) =>
      normalizeName(channel.code) === wanted ||
      normalizeName(channel.label) === wanted ||
      (channel.aliases ?? []).some((alias) => normalizeName(alias) === wanted)
  );
  return match ? match.code : null;
}

export function isSupportedChannel(code) {
  return toChannelCode(code) !== null; // alias-aware: 'ZALO' is still accepted
}
```

`channelLabel` stays unchanged. The dropdown (`public/js/ui/channelSelector.js`) renders `CHANNELS` automatically.

Why this is required: the activity loader normalizes a stored `ZALO` config through `toChannelCode` → `ZNS`, so
legacy journeys restore correctly; `setSelectedChannel` accepts the alias via `isSupportedChannel`.

---

## 5. Preview highlighting — already implemented, verify only

`public/js/ui/templatePreview.js` tokenizes content with `/\{([^{}\s]+)\}/g` and renders each `{variable}` as a
colored chip:

| Tone | Meaning | CSS |
|---|---|---|
| `--mapped` (green) | Auto or Manual mapping configured | `main.css` L724 |
| `--missing` (red) | required but unmapped | L730 |
| `--ambiguous` (amber) | conflicting mappings | L736 |
| `--optional` (gray) | optional and unmapped | L742 |
| `--unknown` (dashed) | literal braces, not a declared variable | L748 |

Covered by `tests/ui/template-preview.test.js` (10 cases). **No code change required.** After the catalog
correction, `{customerName}` etc. in the corrected `content` values are highlighted exactly as before.

---

## 6. Test updates

| File | Change |
|---|---|
| `tests/templateModel.test.js` | L19–20: "four channel codes" → five; `SUPPORTED_CHANNELS` → `['ZNS','CHATAPP','SMS','LIVECHAT','BRC_ZALO']`. L26: `toChannelCode('Zalo')` → `'ZNS'`; add `toChannelCode('ZNS') === 'ZNS'` and `toChannelCode('Livechat') === 'LIVECHAT'`. |
| `tests/templateChannelFilter.test.js` | L18: channel set → `['SMS','CHATAPP','ZNS','BRC_ZALO']`. L22–26: keep `?channel=Zalo`/`?channel=ZALO` (alias) and add `?channel=ZNS` returning the same two keys. |
| `tests/templateRepository.test.js` | L45: `arrayContaining(['SMS','CHATAPP','ZNS','BRC_ZALO'])`. |
| `tests/templateController.test.js` | L42: `item.channel === 'ZNS'` (alias `Zalo` resolves to `ZNS`). |
| `tests/ui/channel-selection.test.js` | Fixtures L15–16: `channel: 'ZNS'`. L30: codes → `['ZNS','CHATAPP','SMS','LIVECHAT','BRC_ZALO']`. L33–40: add `toChannelCode('Zalo') === 'ZNS'`, `toChannelCode('Livechat') === 'LIVECHAT'`, `isSupportedChannel('ZNS') === true`; keep `isSupportedChannel('ZALO') === true` (alias). L43: `channelLabel('BRC_ZALO')` → `'Zalo BRC / Broadcast OA'`. L59/61/80/94/98/111/129/133: use `'ZNS'`. L167–168 `savedZalo`: **keep `channel: 'ZALO'`** to prove legacy restore; assertions L185/199/212 → `'ZNS'`. |
| `tests/ui/activity-loader.test.js` | L10 fixture template `channel: 'ZNS'`; L19 configuration **keep `'ZALO'`** (legacy stored config); assertions L66/117/131 → `'ZNS'`. |
| `tests/ui/template-preview.test.js` | L12 fixture `channel: 'ZALO'` → `'ZNS'` (cosmetic; preview is channel-agnostic). |

Value-agnostic `ZALO` references in `tests/shared`, `tests/deployment`, `tests/schema`, and mapping tests may stay:
`ZALO` remains a valid alias, and those tests only round-trip the string.

---

## 7. Documentation updates (this package)

| File | Change |
|---|---|
| `docs/adr/ADR-001-template-catalog-taxonomy-alignment.md` | New ADR recording the decision. |
| `docs/requirements/notification-hub-template-api-srs.md` | FR-TPL-005 status → Implemented; add FR-TPL-003.5 (preview highlighting) with acceptance criteria. |
| `docs/requirements/template-catalog-data-dictionary.md` | Note canonical codes are in effect in the MVP catalog; document preview chip behavior. |

---

## 8. Verification

1. `npm test` — all suites green (updated assertions).
2. `GET /api/templates` returns 8 items with channels `SMS, CHATAPP, ZNS, BRC_ZALO`.
3. `GET /api/templates?channel=Zalo` and `?channel=ZNS` return the same 2 items.
4. `GET /api/templates?channel=ChatApp` returns the 2 ChatApp items.
5. Preview renders `{customerName}` etc. as colored chips (green when mapped, red when required-unmapped).
6. A stored activity with `channel: 'ZALO'` restores with channel `ZNS` and no `CHANNEL_MISMATCH` warning.