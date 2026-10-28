# Data Dictionary — Notification Hub Template Catalog

| Field | Value |
|---|---|
| Document ID | DD-NHT-001 |
| Version | 1.2 |
| Status | Approved |
| Date | 2026-10-26 |
| Author | Business Analyst |
| Related docs | [SRS](./notification-hub-template-api-srs.md), [BRD](./notification-channels-brd.md), [RTM](./requirements-traceability-matrix.md) |

---

## 1. Entity: Template (catalog item)

Served by `GET /api/templates`. One item = one registered message blueprint on one channel.

| Attribute | Type | Required | Description | Example |
|---|---|---|---|---|
| `templateKey` | string | Yes | Unique identifier of the template. MVP uses human-readable keys; the business register uses Zalo-style GUIDs. | `vac.service-change-notice.sms.988dfeff` / `6BD33665-97CD-46D1-0819-3A1DD82B8F08` |
| `displayName` | string | Yes | Human-readable name shown in the UI. | `Vaccine Service Change SMS` |
| `channel` | string (code) | Yes | Canonical channel code (see §2). | `SMS`, `ZNS` |
| `version` | integer ≥ 1 | No (default 1) | Template version. | `1` |
| `content` | string | No | Message text with `{placeholder}` tokens. | `Thông báo: lịch tiêm {diseaseName} ...` |
| `addresses` | array of Address | Yes | Recipient address descriptors. | `[{ "name": "phone", "required": true, "type": "phone" }]` |
| `recipientFields` | array of Field | No | Extra recipient attributes. | `[{ "name": "customerId", "required": true, "type": "string" }]` |
| `params` | array of Field | Yes | Placeholders to map from Data Extension. | `[{ "name": "customerName", "required": true, "type": "string" }]` |
| `failover` | object | No (proposed) | Failover strategy metadata. | `{ "channel": "SMS" }` |

### 1.1 Address descriptor

| Attribute | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | Logical address name. |
| `required` | boolean | Yes | Whether the address must be supplied. |
| `type` | string | Yes | Address type (register evidence: `phone` for all in-scope channels). |

### 1.2 Field descriptor (recipientFields / params)

| Attribute | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | Field/param name; for params it matches the `{name}` placeholder. |
| `required` | boolean | Yes | Whether the value must be supplied at execution. |
| `type` | string | Yes | Value type: `string`, `number`, `phone`, etc. |

---

## 2. Enum: Channel

Canonical codes (corrected per BRD-NHC-001). Resolution is case-insensitive and ignores spaces, underscores and hyphens.
**Status: in effect** — the MVP catalog (`server/data/templates.json`) and the server/client channel registries use these
codes (see [ADR-001](../adr/ADR-001-template-catalog-taxonomy-alignment.md)); `ZALO` resolves to `ZNS` for backward
compatibility with stored activities.

| Code | Display name | In scope | Address type | Payload params shape (from register) |
|---|---|---|---|---|
| `ZNS` | Zalo ZNS | Yes | `phone` | Simple text params (`customer_name`, `drug_end_date`, …) |
| `CHATAPP` | Chat App | Yes | `phone` | Rich media: `type`, `title`, `content`, `url`, `buttons[]` |
| `SMS` | SMS | Yes | `phone` | Simple text params |
| `LIVECHAT` | Live Chat | Yes | `phone` | Rich media: `type`, `title`, `content`, `url`, `buttons[]` |
| `BRC_ZALO` | Zalo BRC / Broadcast OA | Yes | `phone` | Rich media: `type`, `title`, `content`, `url`, `buttons[]` |
| `APP_PUSH` | App Push | No (Insider) | — | — |
| `IN_APP` | In App | No (Insider) | — | — |

### 2.1 Channel aliases

| Canonical code | Accepted aliases |
|---|---|
| `ZNS` | `ZNS`, `zns`, `Zns`, `Zalo`, `ZALO` |
| `CHATAPP` | `CHATAPP`, `ChatApp`, `Chat App`, `chat app`, `Chatapp`, `chatapp`, `Chat App - Content A - L2/L6`, `Chat App - Content C - L9` |
| `SMS` | `SMS`, `Sms`, `sms` |
| `LIVECHAT` | `LIVECHAT`, `Livechat`, `livechat`, `Livechat app A`, `Livechat app B` |
| `BRC_ZALO` | `BRC_ZALO`, `BRC Zalo`, `ZaloBrc`, `ZALO BRC`, `Broadcast OA` |
| `APP_PUSH` | `App Push` (not served) |
| `IN_APP` | `In App` (not served) |

---

## 3. Entity: Notification Payload (execute request)

Built by the middleware for `/journey/execute` (documented here for completeness; register evidence: 146/146 payloads).

| Attribute | Type | Required | Description | Register evidence |
|---|---|---|---|---|
| `source` | string | Yes | Source system label. | `sf-service-cloud` (146/146) |
| `idempotencyKey` | string | Yes | Deduplication key. | `test-6bd33665-r0004` |
| `templateKey` | string | Yes | Registered template identifier. | GUIDs (114 distinct) |
| `correlationId` | string | Yes | Correlation/tracing id. | `test-zns-6a12eabf-20261022` |
| `recipients` | array | Yes | One recipient per execute call. | length 1 |
| `recipients[].addresses` | array | Yes | Recipient addresses. | `[{ "type": "phone", "value": "0961234567" }]` |
| `recipients[].customerId` | string | No | Recipient identifier. | `3f2a1c9e-7b4d-4e58-9a61-0d2c5b8e1f12` |
| `recipients[].params` | object | Yes | Channel-specific message params. | see §4 |

---

## 4. Params by Channel Family (observed in register)

### 4.1 Simple text (ZNS, SMS)

| Param key | Occurrences | Description |
|---|---|---|
| `customer_name` | 89 | Recipient display name |
| `customer_title` | 48 | Recipient honorific/title |
| `customer_display_id` | 41 | Masked customer id shown to recipient |
| `member_name_1..3` | 42/28/14 | Family member names (multi-member campaigns) |
| `member_title_1..3` | 30/20/10 | Family member titles |
| `total_spending` | 7 | Spending tier value |
| `drug_end_date` | 3 | Medication end date |
| `coupon_code` / `voucher_code` | 3 | Promo codes |
| `additional_amount` | 2 | Top-up amount |

### 4.2 Rich media (ChatApp, LiveChat, BRC_ZALO, Broadcast OA)

| Param key | Occurrences | Description |
|---|---|---|
| `type` | 53 | Media type (register evidence: `image`) |
| `title` | 53 | Message headline |
| `content` | 50 | Message body |
| `url` | 53 | Media/image URL (CDN) |
| `buttons` | 53 | Array of `{ title, url }` or `{ title, phoneNumber }` |

---

## 5. Regulatory Data Classification

| Data element | Classification (Decree 13/2023/ND-CP) | Handling |
|---|---|---|
| Phone number | Personal data | Consent; minimize; never log raw values |
| Customer name | Personal data | Consent; minimize |
| Vaccination / medication data | Sensitive personal data (health) | Stricter consent; access control; encryption at rest |
| Token / auth material | Credential | Never log; redact |

---

## 6. Preview Variable Highlighting

The preview section (`public/js/ui/templatePreview.js`) renders `content` and highlights every `{variable}`
placeholder as a chip (requirement FR-TPL-003.5). Chip tone reflects mapping state:

| Tone | Meaning |
|---|---|
| Green (`--mapped`) | Auto or Manual mapping configured |
| Red (`--missing`) | Required but unmapped |
| Amber (`--ambiguous`) | Conflicting mappings |
| Gray (`--optional`) | Optional and unmapped |
| Dashed (`--unknown`) | Literal braces; not a declared variable |

Styling: `public/css/main.css` `.template-preview__var*` rules (L713–752). Covered by
`tests/ui/template-preview.test.js`.

---

## 7. Revision History

| Version | Date | Author | Change |
|---|---|---|---|
| 1.0 | 2026-10-26 | BA | Initial release; channel enum corrected per BRD-NHC-001. |
| 1.1 | 2026-10-26 | Solution Architect | Channel enum marked in effect (ADR-001); added §6 preview variable highlighting. |
| 1.2 | 2026-10-26 | Solution Architect | Implementation verified: `server/data/templates.json` uses canonical codes with `phone` addresses; server + client registries resolve `ZALO`→`ZNS` (HANDOFF-001, 34 suites / 434 tests green). |