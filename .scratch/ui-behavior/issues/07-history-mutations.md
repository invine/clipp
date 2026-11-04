# 07: Handle Clipboard History mutations

Status: ready-for-agent
Blocked by: 06
Execution: authorized by D6 in ../decisions.md.

**What to build:** A user can pin, delete and clear Clipboard History through shared behavior, with visible pending work and reconciliation when an outcome cannot be confirmed.

**Dependencies:** [06: Handle Share Now and Clip reuse](06-share-now-and-reuse.md)

**Specification:** [Reducer-backed UI behavior and runtime adapters](../spec.md). Requirements R1, R2, R5, R6, R7, R8; user stories 24–26, 32, 38–39. [Decisions D1–D5](../decisions.md) apply.

- [ ] Pin, delete and clear actions reuse the shared history-action ownership established by ticket 06 rather than implementing another pending/retry mechanism in rendering.
- [ ] Pin state and history contents follow authoritative observations; failures retain the established feedback and recovery route.
- [ ] Clear review preserves its current focus and pending-action guards; repeated confirmation cannot start a second clear.
- [ ] An unconfirmed clear keeps recovery visible and prevents another clear until History has been successfully refreshed.
- [ ] A failed refresh does not remove the uncertainty or falsely enable another destructive attempt.
- [ ] Search, filters, selected Clip context and existing history navigation remain consistent with publications after a mutation.
- [ ] Late results from a retired identity or UI owner cannot change current pending state, feedback or retry ownership.
- [ ] Mounted tests and named harness scenarios exercise pin/delete failures, clear pending/unconfirmed outcomes and refresh recovery without real persistence.

## Verification and scope

Use the agreed seam: mounted production UI, real reducer behavior and effect runner, with scripted external effects and observations. Assert observable behavior rather than private state or helper-call structure. Retain current domain semantics and meaningful regression coverage. Each slice must remain verifiable with unmigrated behavior still operational until the compatibility-removal ticket.

Implementation, when requested, follows the repository workflow and required checks. Native/live evidence is separate. No implementation claim is assigned by publication.

## Comments

Published from the user-approved 16-ticket breakdown after the instruction “Publish tickets.” Earlier partial work is preserved, unintegrated and unaccepted; reconcile it against this ticket before considering any reuse.
