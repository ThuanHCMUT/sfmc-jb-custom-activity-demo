# Requirements Traceability Matrix (RTM) — Notification Hub Template Catalog

| Field | Value |
|---|---|
| Document ID | RTM-NHT-001 |
| Version | 1.1 |
| Status | Approved |
| Date | 2026-10-26 |
| Author | Business Analyst |
| Related docs | [SRS](./notification-hub-template-api-srs.md), [BRD](./notification-channels-brd.md), [Data Dictionary](./template-catalog-data-dictionary.md) |

---

## 1. Traceability Overview

This matrix links each requirement to its source (business register / existing system), the affected system component, and its verification approach.

Legend — Source: **REG** = business register CSV; **SYS** = existing middleware behavior; **BRD** = BRD-NHC-001 business rule. Component: **API** = `server/routes/templateRoutes.js` + `server/controllers/templateController.js`; **SRV** = `server/services/templateService.js`; **MOD** = `server/models/templateModel.js`; **REPO** = `server/repositories/templateRepository.js`; **DATA** = `server/data/templates.json`; **UI** = `public/js/domain/channels.js` + `public/js/services/templateApi.js`; **DOC** = documentation only.

---

## 2. Requirements Traceability Matrix

| Req ID | Requirement | Priority | Source | Component | Verification |
|---|---|---|---|---|---|
| FR-TPL-001 | Return the full template catalog | Must | SYS | API, SRV, REPO, DATA | API test: GET /api/templates → 200 `{items}` |
| FR-TPL-001.1 | HTTP 200 with `{ items: [...] }` | Must | SYS | API | Controller test |
| FR-TPL-001.2 | Item shape per data dictionary | Must | SYS | MOD, DATA | Repository/model test |
| FR-TPL-001.3 | `channel` returned as canonical code | Must | BRD (BR-CH-001) | MOD, DATA | Model test: `createTemplateModel(...).channel` |
| FR-TPL-002 | Filter templates by channel | Must | SYS | API, SRV | Service test |
| FR-TPL-002.1 | `?channel=` filters by resolved code | Must | SYS | SRV | Service test |
| FR-TPL-002.2 | Case/separator-insensitive resolution | Must | BRD (BR-CH-002) | MOD | Model test: `toChannelCode('ZNS')` ≡ `toChannelCode('zns')` |
| FR-TPL-002.3 | Unsupported channel → HTTP 400 | Must | SYS | API, SRV | Controller test |
| FR-TPL-002.4 | Empty channel → no filter | Must | SYS | SRV | Service test |
| FR-TPL-003 | Template details for preview | Should | SYS | DATA, UI | UI test: preview renders `{vars}` |
| FR-TPL-004 | Validate catalog integrity on load | Must | SYS | REPO, MOD | Repository/model test |
| FR-TPL-004.1 | Per-item validation rules | Must | SYS | MOD | `findTemplateProblems` unit test |
| FR-TPL-004.2 | Unresolvable channel rejected | Must | BRD | MOD | Model test |
| FR-TPL-004.3 | Load failure → HTTP 500 | Must | SYS | API, REPO | Controller test |
| **FR-TPL-005** | **Serve corrected channel taxonomy** | **Must** | **REG, BRD** | **MOD, UI, DATA** | **Channel tests + UI dropdown test** |
| FR-TPL-005.1 | Canonical codes: ZNS, CHATAPP, SMS, LIVECHAT, BRC_ZALO | Must | REG (§3.2) | MOD, UI | `SUPPORTED_CHANNELS` assertion |
| FR-TPL-005.2 | `ZALO` alias of `ZNS` | Must | REG (STT 122) | MOD | `toChannelCode('Zalo') === 'ZNS'` |
| FR-TPL-005.3 | All register aliases resolve | Must | REG (§3.1) | MOD | Alias table unit test |
| FR-TPL-005.4 | APP_PUSH / IN_APP not served → 400 | Must | BRD (BR-CH-004) | API, SRV | Controller test |
| FR-TPL-006 | Failover as metadata, not channel | Should | REG (5 rows) | MOD, DATA | Model test: composite label → primary code |
| FR-TPL-006.1 | Composite labels → primary channel | Should | REG | MOD | `toChannelCode('ZNS/ SMS Failover') === 'ZNS'` |
| FR-TPL-006.2 | Optional `failover` field | Should | BRD | DATA, MOD | Data dictionary conformance |
| FR-TPL-006.3 | UI shows failover as info text | Should | BRD | UI | UI test |
| FR-TPL-007 | Consistent error responses | Must | SYS | API | Controller test |
| NFR-TPL-001 | Performance: <200ms p95; 50 rps | Must | SYS | API, SRV | Load test |
| NFR-TPL-002 | Availability 99.5%; fail-closed | Should | SYS | API | Monitoring |
| NFR-TPL-003 | No PII in logs; redaction | Must | BRD (BR-CH-008) | SRV | Log inspection test |
| NFR-TPL-004 | Usable channel labels | Should | BRD | UI | UI test |
| NFR-TPL-005 | Extensible without UI changes | Must | BRD (BR-CH-006) | MOD, UI | Architecture review |
| NFR-TPL-006 | Backward-compatible contract | Must | SYS | API, UI | Regression test |

---

## 3. Coverage Summary

| Category | Count |
|---|---|
| Total requirements traced | 29 |
| Must Have | 21 |
| Should Have | 8 |
| Could Have | 0 |
| Won't Have (tracked) | 2 (APP_PUSH, IN_APP — excluded per BRD) |

---

## 4. Revision History

| Version | Date | Author | Change |
|---|---|---|---|
| 1.0 | 2026-10-26 | BA | Initial release aligned with SRS-NHT-001 v1.0. |
| 1.1 | 2026-10-26 | Solution Architect | FR-TPL-005 implementation verified (HANDOFF-001): canonical 5-code registry + `ZALO`→`ZNS` alias in server model, client dropdown and catalog data; aligned with SRS-NHT-001 v1.6. |