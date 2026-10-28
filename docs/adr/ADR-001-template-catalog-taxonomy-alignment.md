# ADR-001: Align the MVP Template Catalog and Preview with the Corrected Channel Taxonomy

## Status

Accepted

## Context

The Notification Hub template register (`MCxNoti_Hub_Template`, 148 rows, 146 valid payloads) was analyzed in
[BRD-NHC-001](./requirements/notification-channels-brd.md) and [SRS-NHT-001](./requirements/notification-hub-template-api-srs.md).
The analysis identified a mismatch between the register and the middleware:

1. The register's dominant Zalo transactional channel is labelled **ZNS**, but the MVP catalog
   (`server/data/templates.json`) stores it as **`ZALO`** (2 templates).
2. The register uses **`ChatApp`** / **`chat app`** display names; the catalog stores `ChatApp` while the canonical
   code is **`CHATAPP`** (2 templates).
3. The register uses **`ZaloBrc`** / **`ZALO BRC`** / **`Broadcast OA`**; the catalog stores `BRC Zalo` while the
   canonical code is **`BRC_ZALO`** (2 templates).
4. The register contains a **Live Chat** channel that the middleware does not recognize yet.
5. Register payload evidence (146/146) shows the recipient address type is **`phone`** for every in-scope channel;
   the two ChatApp catalog entries incorrectly declare a `chatUserId` address.
6. The preview section (`public/js/ui/templatePreview.js`) already highlights `{variable}` placeholders as colored
   chips (green mapped / red missing / gray optional / dashed unknown), but the requirement is not stated explicitly
   in the SRS, and the client channel dropdown (`public/js/domain/channels.js`) still lists the old `ZALO` code, so
   selecting a channel after the catalog correction would show an empty template list.

## Decision

Adopt the corrected canonical channel taxonomy from BRD-NHC-001 / SRS FR-TPL-005 across the MVP catalog, the
server channel registry, the client channel list, and the documentation:

- **Canonical codes** (in display order): `ZNS`, `CHATAPP`, `SMS`, `LIVECHAT`, `BRC_ZALO`.
- **`ZALO` remains a resolvable alias of `ZNS`** (BR-CH-003) in both the server model and the client channel list,
  so stored activity configurations that reference `Zalo` keep working (NFR-TPL-006).
- **`server/data/templates.json`** is corrected to use the canonical codes and `phone` addresses for all entries.
- **`server/models/templateModel.js`** channel registry is extended to `ZNS` + `LIVECHAT` with the alias table.
- **`public/js/domain/channels.js`** dropdown is corrected to the five in-scope channels with human-readable labels
  (`Zalo ZNS`, `Chat App`, `SMS`, `Live Chat`, `Zalo BRC / Broadcast OA`) and alias resolution.
- **Preview highlighting** of `{variable}` placeholders is confirmed as the required behavior and made an explicit
  SRS requirement (FR-TPL-003.5) with acceptance criteria.
- `APP_PUSH` and `IN_APP` remain excluded (Insider-owned; requesting them returns HTTP 400).

## Consequences

### Positive

- The served catalog matches the business register and the Notification Hub's own channel model.
- `GET /api/templates?channel=ZNS` and `?channel=Zalo` return identical results (alias), preserving backward
  compatibility with stored activities and the existing frontend client.
- The channel dropdown and the preview show the corrected channels and highlighted variables, so journey designers
  see exactly which placeholders need mapping.
- The change is additive to the model (new codes + aliases); no template keys, display names, content, or mapping
  semantics change, so stored configurations survive the migration.

### Negative

- Tests that asserted the old four-code list (`SMS`, `CHATAPP`, `ZALO`, `BRC_ZALO`) must be updated to the new
  canonical list; fixtures that use `ZALO` as a stored-config value stay valid through the alias.
- `LIVECHAT` is added to the registry but the MVP catalog has no live-chat templates yet; the dropdown will show an
  empty list for it until register templates are imported (tracked separately).

### Risks

- Any code path that compares channel values by strict equality instead of resolving aliases could mis-match a
  stored `ZALO` config. Mitigation: both the server model and the client `toChannelCode` resolve aliases, and the
  activity loader already normalizes the saved channel before comparing.
- The full 146-template register import (including `LIVECHAT`) is out of scope for this ADR; it is documented in
  `docs/requirements/template-catalog-api-response.json` and should be a follow-up decision.