# User Stories — Notification Hub Template Catalog & Channel Taxonomy

| Field | Value |
|---|---|
| Document ID | US-NHT-001 |
| Version | 1.0 |
| Status | Draft |
| Date | 2026-10-26 |
| Author | Business Analyst |
| Related docs | [SRS](./notification-hub-template-api-srs.md), [BRD](./notification-channels-brd.md) |

---

## US-01: Browse templates by corrected channel

**As a** journey designer
**I want** to see the template catalog filtered by the channels the Notification Hub actually supports (Zalo ZNS, Chat App, SMS, Live Chat, Zalo BRC / Broadcast OA)
**So that** I can pick the right template for the right delivery medium without guessing.

### Acceptance Criteria

- [ ] Given I open the Custom Activity UI, when the template list loads, then the channel dropdown shows exactly: Zalo ZNS, Chat App, SMS, Live Chat, Zalo BRC / Broadcast OA (in that order).
- [ ] Given I select "Zalo ZNS", when the list refreshes, then only templates with channel `ZNS` are shown.
- [ ] Given I select "Chat App", when the list refreshes, then only templates with channel `CHATAPP` are shown.
- [ ] Given the catalog contains a template registered as `ZNS/ SMS Failover`, when I filter by "Zalo ZNS", then that template appears with a visible "SMS failover" indicator.

### Business Rules

- BR-CH-001, BR-CH-002, BR-CH-005 (see BRD-NHC-001).

---

## US-02: Backward compatibility for stored "Zalo" activities

**As a** journey designer with existing journeys
**I want** activities that previously referenced the "Zalo" channel to keep working after the channel rename
**So that** no existing journey breaks.

### Acceptance Criteria

- [ ] Given a stored activity configuration references channel `Zalo`, when the UI loads it, then it resolves to `ZNS` and displays "Zalo ZNS".
- [ ] Given I call `GET /api/templates?channel=Zalo`, when the request completes, then I receive the same items as `?channel=ZNS` (HTTP 200).

### Business Rules

- BR-CH-003.

---

## US-03: Clear exclusion of Insider-owned channels

**As** a journey designer
**I want** App Push and In App to be visibly unavailable in this tool
**So that** I do not mistakenly expect the middleware to send push/in-app notifications (owned by Insider).

### Acceptance Criteria

- [ ] Given the channel dropdown, when I look for App Push or In App, then they are not offered as selectable options.
- [ ] Given I call `GET /api/templates?channel=APP_PUSH`, when the request completes, then I receive HTTP 400 with a message indicating the channel is not served by this API.

### Business Rules

- BR-CH-004.

---

## US-04: Reliable template preview with variables

**As a** journey designer
**I want** to preview the template content with highlighted `{variables}`
**So that** I can confirm the message looks right before mapping fields.

### Acceptance Criteria

- [ ] Given a template with `content` containing `{customerName}`, when I preview it, then the placeholder is highlighted and listed in the mapping screen as a required param.
- [ ] Given a template with an optional param, when I preview it, then the param is marked optional.

### Business Rules

- FR-TPL-003.

---

## US-05: Failover strategy visible, not a channel

**As a** journey designer
**I want** ZNS-with-SMS-failover templates to be grouped under ZNS with a failover note
**So that** I understand the delivery guarantee without being confused by a pseudo-channel.

### Acceptance Criteria

- [ ] Given a template with `failover: { channel: "SMS" }`, when I view its details, then I see "Fallback: SMS" as informational text.
- [ ] Given the full catalog, when I enumerate distinct channels, then no composite channel like `ZNS_SMS` exists.

### Business Rules

- BR-CH-005, FR-TPL-006.

---

## US-06: Add a new channel without UI changes

**As** an integration engineer
**I want** to add a new channel (e.g. Email) by extending only the channel registry
**So that** the UI, mapping, save and execute logic stay untouched.

### Acceptance Criteria

- [ ] Given a new channel code added to the registry, when the UI loads, then the dropdown renders it automatically with its display label.
- [ ] Given the new channel, when I filter templates by it, then the API returns the matching templates (HTTP 200).

### Business Rules

- BR-CH-006, NFR-TPL-005.

---

## Revision History

| Version | Date | Author | Change |
|---|---|---|---|
| 1.0 | 2026-10-26 | BA | Initial release. |