# 06: Handle Share Now and Clip reuse

Status: resolved
Blocked by: 01
Execution: authorized by D6 in ../decisions.md.

**What to build:** A user can Share Now or reuse a Clip with consistent pending, retry and uncertainty feedback, while tests execute the real interaction behavior without sending a Clip or writing the system clipboard.

**Dependencies:** [01: Establish the seam through Pairing submission](01-pairing-submission-seam.md)

**Specification:** [Reducer-backed UI behavior and runtime adapters](../spec.md). Requirements R1, R2, R5, R6, R7, R8; user stories 6–9, 22–23, 38–39. [Decisions D1–D5](../decisions.md) apply.

- [ ] Shared behavior owns the full Share Now and reuse interaction lifecycle, including effect invocation, pending state and feedback.
- [ ] A pending action cannot be duplicated by repeated clicks; requested effects retain the intended Clip identity or current-clipboard intent.
- [ ] Retryable Share Now failures offer the established retry behavior; a missing Share Now capability does not render an executable no-op.
- [ ] Reuse distinguishes complete, copied-without-Clip and unconfirmed outcomes using existing domain result meanings.
- [ ] An unconfirmed potentially completed action requires acknowledgement before a new attempt rather than offering an unsafe automatic retry.
- [ ] Action completion does not fabricate Clipboard History or alter Clip event identity; runtime publications remain authoritative.
- [ ] Identity Rotation, disposal and adapter replacement retire feedback and retained retries from obsolete owners.
- [ ] Mounted tests and harness scenarios cover delayed outcomes, retryable failure, partial completion, uncertainty acknowledgement and stale results without real clipboard or network effects.

## Verification and scope

Use the agreed seam: mounted production UI, real reducer behavior and effect runner, with scripted external effects and observations. Assert observable behavior rather than private state or helper-call structure. Retain current domain semantics and meaningful regression coverage. Each slice must remain verifiable with unmigrated behavior still operational until the compatibility-removal ticket.

Implementation, when requested, follows the repository workflow and required checks. Native/live evidence is separate. No implementation claim is assigned by publication.

## Comments

Published from the user-approved 16-ticket breakdown after the instruction “Publish tickets.” Earlier partial work is preserved, unintegrated and unaccepted; reconcile it against this ticket before considering any reuse.

Resolved by coordinator after integration, review and verification at `5f427df85a35e29aa56cdeea8d156499cea83ace`. Ticket integration commit: `ea5df4160306e029389a218aa80b738c1897891d`. Evidence: `../../../.local/ui-behavior/run.json`.
