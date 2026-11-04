# 03: Adapt extension popup and management page

Status: ready-for-agent
Blocked by: 01
Execution: authorized by D6 in ../decisions.md.

**What to build:** The extension popup and management page use the shared UI seam while preserving their different capabilities, lifetimes and clipboard behavior.

**Dependencies:** [01: Establish the seam through Pairing submission](01-pairing-submission-seam.md)

**Specification:** [Reducer-backed UI behavior and runtime adapters](../spec.md). Requirements R3, R4, R6, R8; user stories 3, 14–15, 32, 39–41. [Decisions D1–D5](../decisions.md) apply.

- [ ] Both surfaces select production adapters rather than owning message translation, subscriptions, polling and refresh ordering inside their rendering.
- [ ] Background and offscreen retain their existing responsibilities; the refactor introduces no new network or credential owner.
- [ ] Clipboard capture remains popup-only and respects focus, permission and retry behavior; opening the management page does not start popup capture.
- [ ] Independent history and settings observations preserve their own authority and revisions, and delayed reads cannot replace newer accepted publications.
- [ ] Runtime restart and document disposal retire listeners, timers and obsolete callbacks; reopening creates only the intended subscriptions and capture activity.
- [ ] Connection state and optional operations retain their existing capability-sensitive presentation.
- [ ] Controlled bridge tests cover message outcomes, interleaved reads/publications, missing responses and cleanup for both surfaces.
- [ ] The existing Pairing UI journey remains functional through the extension adapter; extension typechecks and production compilation pass.

## Verification and scope

Use the agreed seam: mounted production UI, real reducer behavior and effect runner, with scripted external effects and observations. Assert observable behavior rather than private state or helper-call structure. Retain current domain semantics and meaningful regression coverage. Each slice must remain verifiable with unmigrated behavior still operational until the compatibility-removal ticket.

Implementation, when requested, follows the repository workflow and required checks. Native/live evidence is separate. No implementation claim is assigned by publication.

## Comments

Published from the user-approved 16-ticket breakdown after the instruction “Publish tickets.” Earlier partial work is preserved, unintegrated and unaccepted; reconcile it against this ticket before considering any reuse.
