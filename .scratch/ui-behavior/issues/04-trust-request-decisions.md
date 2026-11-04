# 04: Handle Trust Request decisions

Status: resolved
Blocked by: 01
Execution: authorized by D6 in ../decisions.md.

**What to build:** A user can accept or reject a Trust Request through shared reducer behavior, with reliable pending and outcome feedback that can be tested without another device.

**Dependencies:** [01: Establish the seam through Pairing submission](01-pairing-submission-seam.md)

**Specification:** [Reducer-backed UI behavior and runtime adapters](../spec.md). Requirements R1, R2, R5, R6, R8; user stories 6–9, 19, 38–39. [Decisions D1–D5](../decisions.md) apply.

- [ ] Approval interaction state and effect ownership move out of rendering into shared behavior, using the existing runtime decision semantics.
- [ ] Accept and Reject preserve the selected request identity/version and do not start duplicate decisions while that request is pending.
- [ ] Unavailable or loading request state prevents decisions rather than pretending the request list is current.
- [ ] Accepted, rejected and unconfirmed decisions produce the established feedback; an action response does not invent Membership Reconciliation or unrelated Admissions.
- [ ] An Identity Rotation, replaced request context or retired UI owner prevents obsolete feedback from replacing current state.
- [ ] The scripted adapter and interactive harness support pending, failure and unconfirmed decisions using the real UI.
- [ ] Mounted tests click both decision controls and verify pending exclusion, feedback, authoritative request-list changes and late-result handling.

## Verification and scope

Use the agreed seam: mounted production UI, real reducer behavior and effect runner, with scripted external effects and observations. Assert observable behavior rather than private state or helper-call structure. Retain current domain semantics and meaningful regression coverage. Each slice must remain verifiable with unmigrated behavior still operational until the compatibility-removal ticket.

Implementation, when requested, follows the repository workflow and required checks. Native/live evidence is separate. No implementation claim is assigned by publication.

## Comments

Published from the user-approved 16-ticket breakdown after the instruction “Publish tickets.” Earlier partial work is preserved, unintegrated and unaccepted; reconcile it against this ticket before considering any reuse.

Resolved by coordinator after integration, review and verification at `5f427df85a35e29aa56cdeea8d156499cea83ace`. Ticket integration commit: `18c84e459d82f4b22b8fe03d4b8365a93382cf64`. Evidence: `../../../.local/ui-behavior/run.json`.
