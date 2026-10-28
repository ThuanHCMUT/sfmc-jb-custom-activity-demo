# ADR-002: Align the Custom Activity `config.json` with the Official Salesforce Sample

## Status

Accepted

## Context

The custom activity endpoint was registered in Marketing Cloud but the activity did not appear in the Journey
Builder **Custom Activity** palette. Diagnosis compared the generated `GET /config.json`
(`server/services/activity-config-builder.js`) against the official sample (`sfmc-example-jb-custom-activity`,
provided by the requester) and found four deviations that prevent Journey Builder from registering/listing the
activity:

1. The top-level `name` field (required by the SFMC custom activity spec) was missing; only the localized
   `lang.en-US.name` was emitted.
2. `userInterfaces.configModal.url` was missing, so Journey Builder cannot open the configuration UI.
3. `metaData.category` was `"message"` instead of `"Custom"`, placing the activity under Messages instead of the
   Custom group where it is expected.
4. JWT protection was expressed with the legacy `useJwt: true` flag instead of the official
   `securityOptions: { securityType: "securityContext", securityContextKey: "<External Key>" }` shape.

## Decision

Align `config.json` with the official sample:

- Emit top-level `name` and `description` (in addition to the `lang` entries).
- Set `metaData.category` to `"Custom"`.
- Add `userInterfaces.configModal` with `url` pointing at the regional entry `{PUBLIC_BASE_URL}/regional/`, plus `height: 700`, `width: 900`, `fullscreen: true` (superseded the earlier public-root choice; see SPEC-NHT-006).
- Replace `useJwt` with `securityOptions.securityContext` on `arguments.execute` and on every lifecycle endpoint
  (`save`, `validate`, `publish`, `stop`) when JWT verification is enabled; omit `securityOptions` entirely in
  development when JWT is off.
- Introduce `SFMC_SECURITY_CONTEXT_KEY` (the External Key of the Installed Package's JWT Signing component),
  required in production when `SFMC_REQUIRE_JWT=true`, threaded from `server/config.js` through
  `server/routes/config.routes.js` into the builder.
- Add `copySettings: { allowCopy: true, ignoreArguments: ["eventDefinitionKey"] }` per the sample.

## Consequences

### Positive

- The activity definition matches the official sample, so Journey Builder can register the activity, list it
  under **Custom**, and open its configuration modal.
- JWT-protected lifecycle calls use the documented `securityContext` mechanism, which current SFMC instances
  honor.
- The change is additive to configuration: existing deployments only need to set the new
  `SFMC_SECURITY_CONTEXT_KEY` variable.

### Negative

- The legacy `useJwt` property is removed from the generated definition; any external consumer that relied on it
  must switch to `securityOptions`.
- One new required environment variable in production (`SFMC_SECURITY_CONTEXT_KEY`); startup refuses to boot
  without it when JWT is enabled, so operators must provision the External Key.

### Risks

- If the External Key supplied does not match the JWT Signing component in the Installed Package, lifecycle
  calls will be rejected with 401/403. Mitigation: verification step 5 in
  [SPEC-NHT-003](./activity-config-correction-spec.md) confirms the key against a real save/validate call.
- `configModal.url` pointing at `/regional/` assumes the UI is mounted there (SPEC-NHT-006 adds that mount); without
  it the modal cannot open. It also assumes the activity endpoint can resolve the definition at `/regional/config.json`
  when the endpoint is set to `/regional/` (SPEC-NHT-013 adds that alias).