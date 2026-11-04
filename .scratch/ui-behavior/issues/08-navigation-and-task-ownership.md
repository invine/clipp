# 08: Consolidate navigation and task ownership

Status: resolved
Blocked by: 01
Execution: authorized by D6 in ../decisions.md.

**What to build:** Navigation and tasks use a coherent reducer-backed session so users retain supported drafts, search/filter context and return focus while moving through the application.

**Dependencies:** [01: Establish the seam through Pairing submission](01-pairing-submission-seam.md)

**Specification:** [Reducer-backed UI behavior and runtime adapters](../spec.md). Requirements R1, R2, R5, R6, R7, R8; user stories 4, 9, 13, 26–27, 35, 38–39. [Decisions D1–D5](../decisions.md) apply.

- [ ] Deepen the existing document-lived session rather than creating a competing navigation or draft owner.
- [ ] Shared reducer transitions own destination changes, task opening/closing, suspension/return and focus intent; actual DOM focus and geometry remain presentation effects.
- [ ] History search/filter context and supported scroll/anchor restoration retain existing behavior across navigation and layout changes.
- [ ] Closing, cancelling and suspending tasks remain distinct: supported suspended work can complete, while retired work cannot overwrite a newer task.
- [ ] Repeated lifecycle setup/cleanup or adapter replacement cannot duplicate listeners, revive obsolete task context or unexpectedly erase current drafts.
- [ ] Required activity guards account for pending interactions when deciding whether another navigation request can replace a task.
- [ ] Mounted wide/narrow tests demonstrate task return, preserved input, focus intent and pending-operation navigation through actual controls.
- [ ] The interactive harness exposes representative navigation and task-lifetime scenarios without bypassing production session behavior.

## Verification and scope

Use the agreed seam: mounted production UI, real reducer behavior and effect runner, with scripted external effects and observations. Assert observable behavior rather than private state or helper-call structure. Retain current domain semantics and meaningful regression coverage. Each slice must remain verifiable with unmigrated behavior still operational until the compatibility-removal ticket.

Implementation, when requested, follows the repository workflow and required checks. Native/live evidence is separate. No implementation claim is assigned by publication.

## Comments

Published from the user-approved 16-ticket breakdown after the instruction “Publish tickets.” Earlier partial work is preserved, unintegrated and unaccepted; reconcile it against this ticket before considering any reuse.

Resolved by coordinator after integration, review and verification at `5f427df85a35e29aa56cdeea8d156499cea83ace`. Ticket integration commit: `f437a162fe6fe974668547ed705d2383dd0be505`. Evidence: `../../../.local/ui-behavior/run.json`.
