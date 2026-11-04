# 12: Handle notification-driven journeys

Status: ready-for-agent
Blocked by: 02, 03, 08
Execution: authorized by D6 in ../decisions.md.

**What to build:** Notification availability and navigation use the shared seam on every runtime, allowing a notification to open Requests while preserving the user’s existing task and return context.

**Dependencies:** [02: Adapt Android to the shared UI seam](02-android-runtime-adapter.md); [03: Adapt extension popup and management page](03-extension-runtime-adapter.md); [08: Consolidate navigation and task ownership](08-navigation-and-task-ownership.md)

**Specification:** [Reducer-backed UI behavior and runtime adapters](../spec.md). Requirements R1, R2, R3, R4, R5, R6, R7, R8; user stories 34–35, 39–41. [Decisions D1–D5](../decisions.md) apply.

- [ ] Electron, Android and extension adapters supply their current notification capabilities and observations through the established interface.
- [ ] Availability refresh, permission and settings interactions have explicit pending/error ownership and cannot launch native effects in scripted tests.
- [ ] A notification navigation request respects authority/readiness, existing activity guards and the requested target.
- [ ] Opening Requests can suspend an existing supported task without losing its draft; returning restores the appropriate task and focus context.
- [ ] Duplicate, unavailable-target and stale-owner notification requests retain the existing outcomes rather than replacing current user work.
- [ ] Disposal/restart releases listeners and retires late permission/settings results and navigation callbacks.
- [ ] Mounted tests and harness scenarios cover availability failure/recovery and notification-driven suspension/return; production adapter tests verify host translation.

## Verification and scope

Use the agreed seam: mounted production UI, real reducer behavior and effect runner, with scripted external effects and observations. Assert observable behavior rather than private state or helper-call structure. Retain current domain semantics and meaningful regression coverage. Each slice must remain verifiable with unmigrated behavior still operational until the compatibility-removal ticket.

Implementation, when requested, follows the repository workflow and required checks. Native/live evidence is separate. No implementation claim is assigned by publication.

## Comments

Published from the user-approved 16-ticket breakdown after the instruction “Publish tickets.” Earlier partial work is preserved, unintegrated and unaccepted; reconcile it against this ticket before considering any reuse.
