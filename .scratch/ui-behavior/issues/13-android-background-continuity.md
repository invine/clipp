# 13: Handle Android Background Continuity controls

Status: resolved
Blocked by: 02
Execution: authorized by D6 in ../decisions.md.

**What to build:** Developers can exercise Android Background Continuity enable/disable, confirmation and recovery controls with scripted outcomes while Android retains its established native capability limits.

**Dependencies:** [02: Adapt Android to the shared UI seam](02-android-runtime-adapter.md)

**Specification:** [Reducer-backed UI behavior and runtime adapters](../spec.md). Requirements R1, R2, R3, R4, R5, R6, R7, R8; user stories 36, 39–40. [Decisions D1–D5](../decisions.md) apply.

- [ ] Confirmation, enable/disable, refresh, notification-settings and diagnostics interactions use the shared behavior/effect seam.
- [ ] Cancelling confirmation performs no enable action; pending operations prevent duplicate requests and report established failures.
- [ ] The scripted host supplies confirmation and other effects without accessing global prompts or enabling native background work.
- [ ] Observed native state remains authoritative, and missing capability retains its existing unavailable presentation.
- [ ] Disposal, replacement and late completion cannot revive an obsolete pending operation or feedback.
- [ ] Mounted tests and interactive scenarios cover cancellation, delayed completion, rejection and recovery, alongside production adapter translation tests.
- [ ] Android Background Continuity remains opt-in and best-effort; no background clipboard capture or delivery guarantee is added.

## Verification and scope

Use the agreed seam: mounted production UI, real reducer behavior and effect runner, with scripted external effects and observations. Assert observable behavior rather than private state or helper-call structure. Retain current domain semantics and meaningful regression coverage. Each slice must remain verifiable with unmigrated behavior still operational until the compatibility-removal ticket.

Implementation, when requested, follows the repository workflow and required checks. Native/live evidence is separate. No implementation claim is assigned by publication.

## Comments

Published from the user-approved 16-ticket breakdown after the instruction “Publish tickets.” Earlier partial work is preserved, unintegrated and unaccepted; reconcile it against this ticket before considering any reuse.

Resolved by coordinator after integration, review and verification at `5f427df85a35e29aa56cdeea8d156499cea83ace`. Ticket integration commit: `30b49dd97dd5c0f2d1d6f175daf0c0ef61169ac2`. Evidence: `../../../.local/ui-behavior/run.json`.
