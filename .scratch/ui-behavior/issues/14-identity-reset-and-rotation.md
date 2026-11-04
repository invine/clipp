# 14: Handle identity-reset presentation and Identity Rotation

Status: ready-for-agent
Blocked by: 02, 03, 08
Execution: authorized by D6 in ../decisions.md.

**What to build:** Existing identity-reset and Identity Rotation journeys can be inspected and tested through scripted observations while durable reset progress remains owned by the runtime.

**Dependencies:** [02: Adapt Android to the shared UI seam](02-android-runtime-adapter.md); [03: Adapt extension popup and management page](03-extension-runtime-adapter.md); [08: Consolidate navigation and task ownership](08-navigation-and-task-ownership.md)

**Specification:** [Reducer-backed UI behavior and runtime adapters](../spec.md). Requirements R1, R2, R3, R4, R5, R6, R7, R8; user stories 9, 37–40. [Decisions D1–D5](../decisions.md) apply.

- [ ] Existing reset review, submission, reconciliation, continuation and completion/reminder interactions use shared UI behavior and replaceable effects.
- [ ] Runtime-published reset phases and outcomes remain authoritative; closing or disposing the UI does not invent cancellation of an accepted durable reset.
- [ ] Currently unavailable reset capabilities remain unavailable in production; scenario access does not silently enable them.
- [ ] Identity Rotation retires obsolete identity-bound tasks, drafts, pending results and retries while preserving existing identity-independent state rules.
- [ ] An unconfirmed reset request reconciles current status before allowing behavior that would assume the reset did not start.
- [ ] Late operations from the former identity or runtime owner cannot overwrite the new identity’s UI or issue a retained retry against it.
- [ ] Mounted tests and harness scenarios cover review cancellation, delayed/unconfirmed outcomes, current reset phases, reminders and old results arriving after rotation.
- [ ] The tests perform no real reset, key generation/persistence or membership mutation; existing durable reset and domain coverage remains separate.

## Verification and scope

Use the agreed seam: mounted production UI, real reducer behavior and effect runner, with scripted external effects and observations. Assert observable behavior rather than private state or helper-call structure. Retain current domain semantics and meaningful regression coverage. Each slice must remain verifiable with unmigrated behavior still operational until the compatibility-removal ticket.

Implementation, when requested, follows the repository workflow and required checks. Native/live evidence is separate. No implementation claim is assigned by publication.

## Comments

Published from the user-approved 16-ticket breakdown after the instruction “Publish tickets.” Earlier partial work is preserved, unintegrated and unaccepted; reconcile it against this ticket before considering any reuse.
