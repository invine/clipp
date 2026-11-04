# 05: Handle Pairing codes and scanning

Status: resolved
Blocked by: 01, 02
Execution: authorized by D6 in ../decisions.md.

**What to build:** Pairing code generation, copying and scanning run through replaceable effects, so developers can reproduce successful entry, permission recovery and cancellation without a real camera or clipboard.

**Dependencies:** [01: Establish the seam through Pairing submission](01-pairing-submission-seam.md); [02: Adapt Android to the shared UI seam](02-android-runtime-adapter.md)

**Specification:** [Reducer-backed UI behavior and runtime adapters](../spec.md). Requirements R1, R2, R3, R5, R6, R7, R8; user stories 20–21, 38–40. [Decisions D1–D5](../decisions.md) apply.

- [ ] Pairing code generation and copy feedback use shared task ownership and injected effects; an obsolete result cannot replace a newer task or Device Identity.
- [ ] Scanning preserves Android host integration and exposes scripted scan results through the same UI-facing interface.
- [ ] Permission denial, unknown permission, permission return, camera failure and user cancellation have distinct existing presentations.
- [ ] Returning from permission settings checks availability without automatically starting another capture or submission.
- [ ] Leaving the scanning task, closing the UI or changing identity retires capture; a late scan cannot submit Pairing text into the wrong context.
- [ ] Successfully scanned text enters the production Pairing submission behavior, including its duplicate and stale-result protection.
- [ ] Absent scanner capability retains the Paste path and does not create a fake successful scan.
- [ ] Mounted tests and named harness scenarios cover code generation/copy failures, permission recovery, cancellation and late completion; existing real scanner coverage is retained.

## Verification and scope

Use the agreed seam: mounted production UI, real reducer behavior and effect runner, with scripted external effects and observations. Assert observable behavior rather than private state or helper-call structure. Retain current domain semantics and meaningful regression coverage. Each slice must remain verifiable with unmigrated behavior still operational until the compatibility-removal ticket.

Implementation, when requested, follows the repository workflow and required checks. Native/live evidence is separate. No implementation claim is assigned by publication.

## Comments

Published from the user-approved 16-ticket breakdown after the instruction “Publish tickets.” Earlier partial work is preserved, unintegrated and unaccepted; reconcile it against this ticket before considering any reuse.

Resolved by coordinator after integration, review and verification at `5f427df85a35e29aa56cdeea8d156499cea83ace`. Ticket integration commit: `10bbbcfd7f8bd0cea9b5859ded8b76b0d443270e`. Evidence: `../../../.local/ui-behavior/run.json`.
