# 15: Remove migration compatibility and complete ownership

Status: ready-for-agent
Blocked by: 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 12, 13, 14
Execution: authorized by D6 in ../decisions.md.

**What to build:** Every production UI surface uses the shared seam, with one clear owner for each interaction and no remaining migration path that bypasses the tested behavior.

**Dependencies:** [02: Adapt Android to the shared UI seam](02-android-runtime-adapter.md); [03: Adapt extension popup and management page](03-extension-runtime-adapter.md); [04: Handle Trust Request decisions](04-trust-request-decisions.md); [05: Handle Pairing codes and scanning](05-pairing-code-and-scan.md); [06: Handle Share Now and Clip reuse](06-share-now-and-reuse.md); [07: Handle Clipboard History mutations](07-history-mutations.md); [08: Consolidate navigation and task ownership](08-navigation-and-task-ownership.md); [09: Handle device naming and revocation](09-device-naming-and-revocation.md); [10: Handle relay management journeys](10-relay-management.md); [11: Handle preferences and recovery](11-preferences-and-recovery.md); [12: Handle notification-driven journeys](12-notification-journeys.md); [13: Handle Android Background Continuity controls](13-android-background-continuity.md); [14: Handle identity-reset presentation and Identity Rotation](14-identity-reset-and-rotation.md)

**Specification:** [Reducer-backed UI behavior and runtime adapters](../spec.md). Requirements R1, R2, R3, R4, R5, R6, R8; user stories 1–4, 39–43. [Decisions D1–D5](../decisions.md) apply.

- [ ] Electron, Android, extension popup and management page use the shared UI-facing adapter interface for the migrated scope.
- [ ] Remove superseded production wiring and migration-only interfaces after confirming no required caller remains.
- [ ] Consolidate duplicated interaction ownership without deleting useful internal modules or moving durable domain authority into the UI.
- [ ] Rendering retains DOM/geometry concerns but no longer owns the migrated workflow decisions or implicit runtime effects.
- [ ] Keep production and scripted adapters interchangeable at the agreed seam, with explicit capabilities and lifecycle ownership.
- [ ] Retain useful regression coverage; replace lower-level tests only where equivalent externally observable coverage exists.
- [ ] Run affected mounted and adapter journeys after compatibility removal; verify pending work, disposal and replacement still use the production path.
- [ ] Preserve accepted ADRs and current product behavior; no unrelated cleanup or visual redesign is included.

## Verification and scope

Use the agreed seam: mounted production UI, real reducer behavior and effect runner, with scripted external effects and observations. Assert observable behavior rather than private state or helper-call structure. Retain current domain semantics and meaningful regression coverage. Each slice must remain verifiable with unmigrated behavior still operational until the compatibility-removal ticket.

Implementation, when requested, follows the repository workflow and required checks. Native/live evidence is separate. No implementation claim is assigned by publication.

## Comments

Published from the user-approved 16-ticket breakdown after the instruction “Publish tickets.” Earlier partial work is preserved, unintegrated and unaccepted; reconcile it against this ticket before considering any reuse.
