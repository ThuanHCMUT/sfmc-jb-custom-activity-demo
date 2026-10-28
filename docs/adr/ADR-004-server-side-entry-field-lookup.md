# ADR-004: Read Entry Data Extension Fields Through a Server-Side API Keyed by eventDefinitionKey

## Status

Accepted (2026-10-26). Decisions D1–D4 were answered by the requester and the implementation:

- **D1 (columns before the step):** assumed yes; the lookup was implemented. If a journey's Data Extension has no
  columns at configure time, the endpoint returns an empty list and the typed-name fallback (ADR-003) stays in place.
- **D2 (public endpoint or validation-only):** both. Option A (`GET /api/entry-fields`, rate-limited per IP, key
  format validated, names and types only) and Option B (schema-aware warnings in `/journey/save` and
  `/journey/validate`).
- **D3 (credentials):** provided. The client ID and base URIs were shared by the requester; the client secret is
  read from the `SFMC_REST_CLIENT_SECRET` environment variable. None of the values are stored in the repository.
- **D4 (authoritative API):** not verified against the live API (no secret was available in the build sandbox).
  `SFMC_ENTRY_FIELDS_LOOKUP_MODE` selects the source: `event-definition`, `data-extension`, or `both` (default,
  event definition first, then Data Extension attributes). Confirm in the account which one answers before relying
  on a single mode.

Refines [ADR-003](./ADR-003-entry-de-field-source.md); the typed-name fallback stays in place either way.

## Context

ADR-003 established that the entry field list is not delivered in the Journey Builder interaction (live capture,
2026-10-26), so designers type field names. The requester proposes an alternative: after the activity receives the
`eventDefinitionKey`, the server calls a Marketing Cloud REST API and returns the entry fields to the UI:

```
GET /api/entry-fields?eventDefinitionKey=<key>   ->   [{ name, type, ... }]
```

Feasibility, from public documentation (the Salesforce developer pages returned HTTP 403 during review, so the
details below must be confirmed against the live API):

- Salesforce describes an event definition as containing "the name and data schema for an event"
  (`POST /interaction/v1/eventDefinitions`, Create Event Definition reference). This suggests a read of the same
  resource by key may return the schema. **Unverified:** the GET path and response shape.
- Listing Data Extension attributes through REST is a known, somewhat awkward task (community questions on
  Stack Exchange). A DE-level field endpoint is the alternative if the event definition does not carry the schema.
  **Unverified.**

So the approach is technically possible, but it adds server-side credentials and a new public surface.

## Constraints from this project

1. The Custom Activity UI runs in an iframe and has no Marketing Cloud token. It cannot call Marketing Cloud REST
   directly. Any lookup must go through this server.
2. The server currently has no Marketing Cloud REST credentials. Adding them means new secrets in the deployment
   secret store (never in the repository, never in chat).
3. `/api/*` is public by design (SRS NFR-TPL-003 keeps it simple). A field-list endpoint would reveal DE schema to
   anyone who knows an event key. Field names are metadata, not customer rows, but they still describe the data
   model.
4. The designer reported that the Data Extension has **no fields before the journey step runs**. If that is true
   at configure time, the API returns nothing for this journey and the typed-name fallback is still required.

## Options

| Option | Description | Pros | Cons |
|---|---|---|---|
| A | Public `GET /api/entry-fields?eventDefinitionKey=` called by the UI | Simple for the UI; matches the request | Public schema oracle; needs rate limiting and key-format checks |
| B | Server fetches fields inside `/journey/validate` and `/journey/save`, which already carry the Journey Builder JWT | No new public endpoint; validation is authoritative | The UI dropdown still has no data; only validation is improved |
| C | Option A, plus restrict the endpoint so it is usable only from the Journey Builder iframe (Referer/Origin checks) | Smaller exposure | Referer/Origin are spoofable; weak control |

## Recommendation

1. **First, verify whether the Data Extension has columns before the step.** If it has none, options A and B return
   nothing for this journey, and the change adds cost without benefit. Confirm this in Marketing Cloud (Contact
   Builder → the entry Data Extension → Fields) before any implementation.
2. **If columns exist:** implement **Option A with a server-side cache** (fields per event key, short TTL), return
   only field names and types, validate the key format `^[A-Za-z0-9_-]+$`, apply per-IP rate limiting, and keep the
   typed-name fallback. Also add **Option B** so validation checks the typed names against the real schema when it is
   available.
3. **If no columns exist at configure time:** do not build the lookup. Keep ADR-003 as the supported design and add the
   operational rule that the columns must exist before activation.

## Other ways to obtain the field list (no Marketing Cloud REST call required)

| # | Option | How | Needs credentials | Fits the journey-with-no-fields case | Notes |
|---|---|---|---|---|---|
| E1 | Keep typed names (ADR-003) | Designer types names; binding resolves at runtime | No | Yes | Works today. Typos are caught only at runtime. |
| E2 | Paste or import the list | Designer copies the column names from the DE (Contact Builder → Fields) and pastes them into a text box, comma or line separated. Validated with the same identifier rule. | No | Yes, once the DE columns exist | Low effort, no secrets. Adds a one-time copy step. |
| E3 | Read the event definition from the Journey Builder payload | Ask Journey Builder for the entry-source definition with `requestTriggerEventDefinition` (already implemented in SPEC-NHT-009) | No | Not in this journey: the response was never returned in the live capture | **Verified 2026-10-27**: a live session answered `requestedTriggerEventDefinition` with the DE field list in `dataExtensionFields`. Now the primary source (ADR-005 / SPEC-NHT-012). May still not answer for some journey shapes. |
| E4 | Marketing Cloud REST or SOAP lookup | Server calls the event definition or DE fields by key (ADR-004 main option) | Yes | Only if the columns exist | Needs Installed Package credentials and a security decision. |
| E5 | Admin-maintained catalog | An admin keeps a JSON file mapping `eventDefinitionKey` → field names, loaded by the server. Updated by hand or by a one-off script run by the admin. | No (manual) or yes (script) | Yes, if maintained | Simple and auditable, but can drift from the real DE. |
| E6 | Read the entry source config URL | The interaction metadata includes `entrySourceGroupConfigUrl` (a `jb:///` address) | No | Not reachable from the iframe | Internal Journey Builder address. Not a supported integration point. Do not use. |

**Recommendation.** Ship E2 now: it needs no credentials and lets designers finish the activity. Keep E1 as the
fallback for quick entries. Use E4 (ADR-004) later, only if the columns exist before the step and the team accepts the
credential and endpoint decisions. Keep E3 in the code (already built), and record any real payload that contains a
field list as evidence.

## Credentials checklist (for D3)

Provide these values to the deployment secret store. Never paste them into chat, a commit, or a file in the repository.

| # | Value | Where to get it in Marketing Cloud | Stored as (proposed) | Secret? |
|---|---|---|---|---|
| 1 | REST client ID | Setup → Apps → Installed Packages → your package → Add Component → API Integration (Server-to-Server) → Client ID | `SFMC_REST_CLIENT_ID` | Treat as secret |
| 2 | REST client secret | Same component, shown once at creation | `SFMC_REST_CLIENT_SECRET` | Yes |
| 3 | Authentication base URI | Same component (e.g. `https://<subdomain>.auth.marketingcloudapis.com/`) | `SFMC_AUTH_BASE_URL` | No |
| 4 | REST base URI | Same component (e.g. `https://<subdomain>.rest.marketingcloudapis.com/`) | `SFMC_REST_BASE_URL` | No |
| 5 | Account ID (MID), optional | Setup → Account Settings | `SFMC_ACCOUNT_ID` | No |

**Minimum scopes (read-only).** On the API Integration component, select only the read scopes needed for the lookup:
Data Extensions (read) and Journeys / Interactions (read), so the server can read the entry event definition and the
Data Extension field list. Do not grant write or send scopes. The exact scope labels must be checked in the account,
because this document could not confirm them from the Salesforce site.

**Credential exposure (2026-10-26).** The client secret was pasted into a chat session during review. It must be
treated as compromised: regenerate it in the API Integration component before any use, and store only the new value
in the secret store. The client ID and base URIs were also shared in that session. Do not hard-code any of these
values in source code, `.env.example`, or documentation. The lookup configuration must come from environment variables
only, with empty placeholders in `.env.example`.

**Keep these separate.** The existing `SFMC_JWT_SECRET` is the Installed Package JWT signing secret used to verify
Journey Builder calls. It is a different credential and must not be reused for REST.

**Prerequisites before providing anything.**

1. Answer D1 (does the entry Data Extension have columns before the step runs?). If no, the credentials give nothing
   for this journey, so do not create them yet.
2. Answer D2 (public endpoint or validation-only). This sets whether the server needs to expose field names to the UI.

**What the server does with them.** The server exchanges the client ID and secret for a short-lived access token at
the authentication base URI, calls the REST base URI with it, caches the field list per event key, and never returns
the token or the secret to the browser.

## Decisions required from the requester

| ID | Question | Decision (2026-10-26) |
|---|---|---|
| D1 | Does the entry Data Extension have columns before the step runs? | Assumed yes; implemented. Empty results fall back to typed names. |
| D2 | Accept a public schema-read endpoint (Option A) with rate limiting, or require server-side validation only (Option B)? | Both: Option A endpoint + Option B validation warnings. |
| D3 | Provide Marketing Cloud REST credentials (Installed Package client id/secret, REST base URL) through the secret store. | Provided: client ID and base URIs shared by requester; secret via `SFMC_REST_CLIENT_SECRET` env var. |
| D4 | Which Marketing Cloud API is authoritative for this account: event definition by key, or DE fields by customer key? | Open; `SFMC_ENTRY_FIELDS_LOOKUP_MODE` (default `both`) selects the source. Verify in the account. |

## Consequences

### Positive

- If D1 is yes, designers see real field names and type-checking improves.
- Option B improves validation without changing the UI.

### Negative

- New secrets, token handling, caching and rate limiting to operate.
- A new dependency on Marketing Cloud REST availability and quotas.

### Risks

- A misconfigured Installed Package scope returns 401/403 at runtime. Mitigation: the typed-name fallback always works.
- Exposing schema publicly (Option A). Mitigation: names and types only, key validation, rate limiting, and an explicit
  decision (D2).

## References

- [ADR-003](./ADR-003-entry-de-field-source.md) — typed-name fallback and live capture evidence.
- Salesforce Marketing Cloud REST reference: Journeys and Events — Create Event Definition
  (`/interaction/v1/eventDefinitions`).
