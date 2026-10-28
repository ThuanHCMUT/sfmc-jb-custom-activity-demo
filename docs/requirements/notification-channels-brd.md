# Business Requirements Document (BRD) — Notification Hub Channel Taxonomy (Corrected)

| Field | Value |
|---|---|
| Document ID | BRD-NHC-001 |
| Version | 1.0 |
| Status | Draft |
| Date | 2026-10-26 |
| Author | Business Analyst |
| Source data | `MCxNoti_Hub_Template(Trang_tính1).csv` — 148-row template register (146 valid payloads) |
| Related docs | [SRS — Template Catalog API](./notification-hub-template-api-srs.md), [Data Dictionary](./template-catalog-data-dictionary.md), [RTM](./requirements-traceability-matrix.md) |

---

## 1. Executive Summary

The Notification Hub template register (`MCxNoti_Hub_Template`) records **148 templates** across **36 distinct raw channel labels**. The current middleware recognizes only **four** channel codes (`SMS`, `CHATAPP`, `ZALO`, `BRC_ZALO`), which does not match the register:

1. The register's dominant Zalo transactional channel is labeled **ZNS**, but the system stores it as **`ZALO`**.
2. The register contains a **Live Chat** channel that the system does not recognize.
3. The register contains **App Push** and **In App** channels that are owned by the Insider team and must be excluded from the middleware scope.
4. The register mixes **failover strategies** (`ZNS/ SMS Failover`) into the channel column; these are delivery strategies, not channels.

This document defines the **corrected canonical channel list**, the alias mapping, and the evidence from the register. Implementation requirements are captured in FR-TPL-005 / FR-TPL-006 of the SRS.

---

## 2. Business Context

### 2.1 Product

Salesforce Marketing Cloud **Journey Builder Custom Activity** that lets journey designers pick a Notification Hub template, map Data Extension fields to its parameters, and send the notification through the Notification Hub middleware.

### 2.2 Business Goals

| Goal | Description |
|---|---|
| G1 | Journey designers can select any channel the Notification Hub actually supports. |
| G2 | The channel list matches the business template register (single source of truth). |
| G3 | Channels owned by other teams (Insider: App Push, In App) are visibly excluded from the middleware scope. |
| G4 | Adding a channel later requires no UI or mapping-logic changes. |

### 2.3 Stakeholders

| Stakeholder | Interest |
|---|---|
| Marketing / Journey designers | Correct channel options; readable labels; correct template filtering. |
| Notification Hub team | Canonical channel codes align with the Hub's own channel model. |
| Insider team | Owns App Push and In App; must not be duplicated in the middleware. |
| Middleware engineering | Stable, extensible channel registry; backward compatibility. |
| QA | Deterministic alias resolution; measurable acceptance criteria. |

---

## 3. Evidence from the Template Register

### 3.1 Raw Channel Labels Observed (36 distinct values, 148 rows)

| Raw label (as written in CSV) | Count | Inferred family |
|---|---|---|
| `ZNS` | 49 | ZNS |
| `Chat App` | 10 | ChatApp |
| `chat app` | 8 | ChatApp |
| `zns` | 7 | ZNS |
| `Sms` | 6 | SMS |
| `Chatapp` | 6 | ChatApp |
| `[CDP] Request đăng ký payload cho GĐLS1 - chat app trên Insider 10/2/2026` | 6 | ChatApp (note text in channel column) |
| `chatapp` | 4 | ChatApp |
| `[CDP] Request đăng ký payload cho campaign GĐLS1 trên Insider 13/2/2026` | 3 | ChatApp (note text in channel column) |
| `ZNS\nNhắc mũi SXH\n- 1/2/3 thành viên` | 3 | ZNS |
| `ZNS/ SMS Failover` | 2 | ZNS + SMS failover |
| `SMS` | 2 | SMS |
| `sms` | 2 | SMS |
| `Livechat` | 2 | LiveChat |
| `ZaloBrc` | 1 | BRC_ZALO |
| `ZALO BRC` | 1 | BRC_ZALO |
| `Broadcast OA` | 1 | BRC_ZALO |
| `ZNS/failover` | 1 | ZNS + SMS failover |
| `zns/sms` | 1 | ZNS + SMS failover |
| `ZNS fail over` | 1 | ZNS + SMS failover |
| `Chat app` | 1 | ChatApp |
| `Chat App - Content A - L2` | 1 | ChatApp |
| `Chat App - Content A - L6` | 1 | ChatApp |
| `Chat App - Content C - L9` | 1 | ChatApp |
| `Zalo` | 1 | ZNS (alias) |
| `Zns` | 1 | ZNS |
| `livechat` | 1 | LiveChat |
| `Livechat app A` | 1 | LiveChat |
| `Livechat app B` | 1 | LiveChat |
| `SMS failover` | 1 | SMS (failover target) |
| `App Push` | 1 | App Push (Insider) |
| `In App` | 1 | In App (Insider) |
| *(blank)* | 20 | Undetermined (payload shape used for inference) |

### 3.2 Inferred Family Totals

| Family | Count | Share |
|---|---|---|
| ZNS (incl. aliases and failover-primary) | 61 | 41.2% |
| ChatApp | 43 | 29.1% |
| SMS | 11 | 7.4% |
| ZNS + SMS failover | 5 | 3.4% |
| BRC_ZALO | 3 | 2.0% |
| LiveChat | 5 | 3.4% |
| App Push / In App (Insider) | 2 | 1.4% |
| Blank / undetermined | 20 | 13.5% |

> Note: 20 rows have a blank channel. Their payloads were classified by shape: simple text params → ZNS; rich-media params (`type`/`title`/`url`/`buttons`) → ChatApp. 4 of the blank rows carry rich-media payloads.

### 3.3 Payload Evidence (146 valid JSON payloads)

| Observation | Value |
|---|---|
| `source` | `sf-service-cloud` in **146/146** payloads |
| Address type | `phone` in **146/146** payloads |
| Distinct `templateKey` values | **114** (Zalo-style GUIDs, e.g. `6BD33665-97CD-46D1-0819-3A1DD82B8F08`) |
| Rich-media params (`type`/`title`/`content`/`url`/`buttons`) | Present on **ChatApp, LiveChat, BRC_ZALO, Broadcast OA** payloads |
| Simple text params | Present on **ZNS** and **SMS** payloads |
| Most frequent param keys | `customer_name` (89), `type`/`title`/`url`/`buttons` (53 each), `content` (50), `customer_title` (48), `member_name_1` (42) |

### 3.4 Data-Quality Observations

1. **Misspelled header**: the register column is named `Chanel` (should be `Channel`).
2. **Notes in the channel column**: 9 rows use the channel column for Insider request notes (e.g. `[CDP] Request đăng ký payload cho GĐLS1 - chat app trên Insider 10/2/2026`). These rows are ChatApp-family but the label is not a channel.
3. **Multi-line labels**: 3 rows embed campaign text in the label (`ZNS\nNhắc mũi SXH\n- 1 thành viên`).
4. **Composite labels**: 5 rows mix channel and failover (`ZNS/ SMS Failover`, `ZNS fail over`, `zns/sms`).
5. **Case inconsistency**: `ZNS` / `zns` / `Zns`; `Sms` / `sms` / `SMS`; `Chat App` / `chat app` / `Chatapp` / `chatapp`.
6. **Blank channels**: 20 rows have no channel value.

---

## 4. Corrected Canonical Channel List

### 4.1 Recommendation

The middleware MUST adopt the following canonical channel taxonomy. The five in-scope channels correspond to delivery media the Notification Hub actually supports; the two Insider-owned channels are documented but excluded.

| # | Code | Display name | In scope | Rationale / evidence |
|---|---|---|---|---|
| 1 | `ZNS` | Zalo ZNS | ✅ Must | Dominant channel in register (61 rows incl. aliases). Transactional template messages via Zalo. |
| 2 | `CHATAPP` | Chat App | ✅ Must | 43 rows. Rich-media messages on Zalo OA (image, title, content, URL, buttons). |
| 3 | `SMS` | SMS | ✅ Must | 11 rows. Text messages via carrier; also the failover target for ZNS. |
| 4 | `LIVECHAT` | Live Chat | ✅ Must | 5 rows (`Livechat`, `livechat`, `Livechat app A/B`). Real-time chat sessions. |
| 5 | `BRC_ZALO` | Zalo BRC / Broadcast OA | ✅ Must | 3 rows (`ZaloBrc`, `ZALO BRC`, `Broadcast OA`). Broadcast/CRM messages on Zalo OA. |
| 6 | `APP_PUSH` | App Push | ❌ Won't (Insider) | 1 row. Managed and integrated by Insider; out of middleware scope. |
| 7 | `IN_APP` | In App | ❌ Won't (Insider) | 1 row. Managed and integrated by Insider; out of middleware scope. |

### 4.2 Changes Relative to Current System

| Current code | Action | Rationale |
|---|---|---|
| `SMS` | Keep | Matches register. |
| `CHATAPP` | Keep | Matches register. |
| `ZALO` | **Replace with `ZNS`** (keep `ZALO` as alias) | Register labels the channel `ZNS`; `Zalo` appears once as an alias. Keeping `ZALO` as an alias preserves stored activities. |
| `BRC_ZALO` | Keep | Matches register (`ZaloBrc`, `ZALO BRC`). |
| *(missing)* | **Add `LIVECHAT`** | Register contains Live Chat templates; current system has no code for them. |
| *(missing)* | **Explicitly exclude `APP_PUSH`, `IN_APP`** | Insider-owned; requesting them must yield a clear "not served" response (HTTP 400). |

### 4.3 Alias Mapping (resolution table)

All aliases MUST resolve to the canonical code (case-insensitive; spaces/underscores/hyphens ignored).

| Canonical code | Accepted aliases (from register + current system) |
|---|---|
| `ZNS` | `ZNS`, `zns`, `Zns`, `Zalo`, `ZALO`, `Zalo ZNS`, `Zalo ZNS` variants |
| `CHATAPP` | `CHATAPP`, `ChatApp`, `Chat App`, `chat app`, `Chatapp`, `chatapp`, `Chat App - Content A - L2`, `Chat App - Content A - L6`, `Chat App - Content C - L9` |
| `SMS` | `SMS`, `Sms`, `sms`, `SMS failover` (when used as primary) |
| `LIVECHAT` | `LIVECHAT`, `Livechat`, `livechat`, `Livechat app A`, `Livechat app B` |
| `BRC_ZALO` | `BRC_ZALO`, `BRC Zalo`, `ZaloBrc`, `ZALO BRC`, `Broadcast OA` |
| `APP_PUSH` | `App Push` (resolved but **not served** → HTTP 400) |
| `IN_APP` | `In App` (resolved but **not served** → HTTP 400) |

### 4.4 Failover Strategy (not a channel)

| Composite label | Interpretation |
|---|---|
| `ZNS/ SMS Failover` | Primary: ZNS; fallback: SMS |
| `ZNS fail over` | Primary: ZNS; fallback: SMS |
| `zns/sms` | Primary: ZNS; fallback: SMS |
| `ZNS/failover` | Primary: ZNS; fallback: SMS |
| `SMS failover` | SMS used as the failover leg of a ZNS campaign |

Failover MUST be modeled as template/journey metadata (SRS FR-TPL-006), never as a channel code.

---

## 5. Business Rules

- **BR-CH-001**: The canonical channel list is the single source of truth for the middleware; UI, mapping, save and execute logic MUST derive channel behavior from it.
- **BR-CH-002**: Channel resolution MUST be case-insensitive and MUST ignore spaces, underscores and hyphens.
- **BR-CH-003**: `ZALO` MUST resolve to `ZNS` (backward compatibility with stored activity configurations).
- **BR-CH-004**: Insider-owned channels (`APP_PUSH`, `IN_APP`) MUST NOT be selectable or servable by the middleware; requests for them MUST return a clear error.
- **BR-CH-005**: Failover composites MUST resolve to the primary channel; the failover target MUST be carried as metadata.
- **BR-CH-006**: Adding a new channel MUST NOT require changes to UI screens, mapping logic, save logic or execute logic (README §1, goal 4).
- **BR-CH-007**: Template payloads MUST use `phone` as the recipient address type for all currently in-scope channels (evidence: 146/146 payloads).
- **BR-CH-008**: Customer personal data in payloads (phone, name, health-related params) MUST be handled per Decree 13/2023/ND-CP; logs MUST use redaction.

---

## 6. MoSCoW Priorities

| Requirement | Priority |
|---|---|
| Adopt canonical codes `ZNS`, `CHATAPP`, `SMS`, `LIVECHAT`, `BRC_ZALO` | Must Have |
| Keep `ZALO` as alias of `ZNS` | Must Have |
| Exclude `APP_PUSH`, `IN_APP` with clear error | Must Have |
| Model failover as metadata, not a channel | Should Have |
| Normalize the register CSV (rename `Chanel` → `Channel`, fill blanks) | Could Have |

---

## 7. Risks and Open Questions

| Risk / question | Impact | Mitigation |
|---|---|---|
| Renaming `ZALO` → `ZNS` could break stored journey configurations | High | Keep `ZALO` as alias (BR-CH-003); verify stored activities during migration. |
| 20 rows have blank channels | Medium | Infer from payload shape; confirm with business owner. |
| Insider-owned channels may later be requested through the middleware | Medium | Explicit exclusion with clear error; coordinate with Insider team. |
| Zalo platform template IDs (GUIDs) differ from middleware `templateKey` scheme | Medium | Document mapping in Data Dictionary; confirm with Notification Hub team. |
| Failover semantics (timing, retry) unspecified | Medium | Track as separate requirement; default to "immediate fallback on delivery failure". |

---

## 8. Revision History

| Version | Date | Author | Change |
|---|---|---|---|
| 1.0 | 2026-10-26 | BA | Initial release; corrected channel taxonomy from register analysis. |