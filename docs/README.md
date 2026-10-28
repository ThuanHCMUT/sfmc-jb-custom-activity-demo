# Architecture Documentation — Salesforce Custom Activity (Notification Hub)

Documentation index for the Journey Builder Custom Activity. The living
operational README lives at the repository root (`README.md`); this folder
holds decision records, system design documents and change specifications.

## Decision records (`adr/`)

| ADR | Title | Status |
|---|---|---|
| ADR-001 | Template catalog taxonomy alignment | Accepted |
| ADR-002 | Activity `config.json` alignment | Accepted |
| ADR-003 | Source of entry Data Extension fields for mapping (typed-name fallback) | Accepted; evidence qualified 2026-10-27 |
| ADR-004 | Server-side entry-field lookup keyed by `eventDefinitionKey` | Accepted; E3 verified 2026-10-27 |
| **ADR-005** | **[Obtain DE fields from the entry-source event definition (`dataExtensionFields`)](adr/ADR-005-de-fields-from-entry-source-event-definition.md)** | **Accepted (live-verified)** |

## System design (`system-design/`)

| Document | Purpose |
|---|---|
| [Entry-schema discovery](system-design/entry-schema-discovery.md) | End-to-end design of schema discovery: sources, priority ladder, sequence, payload shapes, failure modes (reflects ADR-005) |

## Change specifications (`requirements/`, SPEC-NHT series)

Latest: **[SPEC-NHT-013 — Serve the activity definition at `/regional/config.json`](requirements/regional-config-json-correction-spec.md)** and **[SPEC-NHT-012 — Obtain DE fields from the entry-source event definition](requirements/entry-source-dataextensionfields-correction-spec.md)**.
Earlier specs in the series cover the template catalog (001–002), config alignment (003–006), regional UI (007),
entry-DE fields (008), entry-field discovery (009), entry-source grace wait (010) and unquoted bindings (011).

## Convention

- All diagrams are Mermaid (rendered in the VibeFlow preview).
- Payload examples are illustrative data shapes, not implementation code.
- Status vocabulary: *repository-ready* (automated checks pass) vs
  *journey-verified* (evidence captured from a live Journey Builder session).
- The solution-architect agent is scoped to `docs/`; code changes are specified
  for the build agent, and README updates are listed as build-agent follow-ups.