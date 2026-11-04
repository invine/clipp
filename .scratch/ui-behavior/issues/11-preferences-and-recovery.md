# 11: Handle preferences and recovery

Status: ready-for-agent
Blocked by: 01
Execution: authorized by D6 in ../decisions.md.

**What to build:** Auto Sync, appearance, Clip preferences and recovery actions retain authoritative values and expose uncertainty clearly while running through shared behavior and scripted effects.

**Dependencies:** [01: Establish the seam through Pairing submission](01-pairing-submission-seam.md)

**Specification:** [Reducer-backed UI behavior and runtime adapters](../spec.md). Requirements R1, R2, R3, R5, R6, R7, R8; user stories 31–33, 38–39. [Decisions D1–D5](../decisions.md) apply.

- [ ] Shared behavior owns preference interaction and recovery decisions instead of scattering pending/save/retry state through rendering.
- [ ] Existing settings and history consumers remain authoritative and independent; the scripted adapter does not reimplement their revision or recovery rules.
- [ ] Pending, applied, rejected, partial and unconfirmed saves preserve their current distinct meanings and prevent inappropriate duplicate writes.
- [ ] Unconfirmed writes do not optimistically replace the confirmed setting; refresh reconciles the current value before another blocked write can proceed.
- [ ] A failed recovery attempt keeps its issue visible; an older read or save response cannot replace a newer accepted observation.
- [ ] Auto Sync retains its existing domain semantics, and Clip retention/lifetime preferences preserve their current validation and outcomes.
- [ ] Mounted tests and harness scenarios exercise Auto Sync uncertainty, appearance changes, Clip preference failures and successful/failed refresh through real controls.
- [ ] Late work after disposal, identity change where relevant, or adapter replacement cannot overwrite current feedback or retain stale retry actions.

## Verification and scope

Use the agreed seam: mounted production UI, real reducer behavior and effect runner, with scripted external effects and observations. Assert observable behavior rather than private state or helper-call structure. Retain current domain semantics and meaningful regression coverage. Each slice must remain verifiable with unmigrated behavior still operational until the compatibility-removal ticket.

Implementation, when requested, follows the repository workflow and required checks. Native/live evidence is separate. No implementation claim is assigned by publication.

## Comments

Published from the user-approved 16-ticket breakdown after the instruction “Publish tickets.” Earlier partial work is preserved, unintegrated and unaccepted; reconcile it against this ticket before considering any reuse.
