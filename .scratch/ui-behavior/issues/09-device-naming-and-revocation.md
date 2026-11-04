# 09: Handle device naming and revocation

Status: resolved
Blocked by: 08
Execution: authorized by D6 in ../decisions.md.

**What to build:** Users can edit Device Names and Local Device Aliases, copy device details and confirm Device Revocation through shared behavior that can be exercised without touching real devices.

**Dependencies:** [08: Consolidate navigation and task ownership](08-navigation-and-task-ownership.md)

**Specification:** [Reducer-backed UI behavior and runtime adapters](../spec.md). Requirements R1, R2, R3, R5, R6, R7, R8; user stories 27–29, 38–39. [Decisions D1–D5](../decisions.md) apply.

- [ ] Naming, copy and revocation workflow decisions leave rendering and use the shared session/effect seam.
- [ ] Device Name and Local Device Alias retain their distinct domain meaning, target identity and existing save/remove semantics.
- [ ] Supported task suspension preserves drafts; authoritative updates, removed targets and newer edits cannot be overwritten by older completions.
- [ ] Copying device details uses an injected host effect and reports success or failure without requiring a global clipboard dependency.
- [ ] Device Revocation uses an injected confirmation effect; cancellation requests no revocation and repeated confirmation cannot duplicate an in-flight operation.
- [ ] Revocation failures and late results retain correct target and Device Identity ownership; the UI does not manufacture a successful membership change.
- [ ] Mounted tests and harness scenarios cover naming failure, removed targets, suspended drafts, copy failure, confirmation cancellation and revocation uncertainty.

## Verification and scope

Use the agreed seam: mounted production UI, real reducer behavior and effect runner, with scripted external effects and observations. Assert observable behavior rather than private state or helper-call structure. Retain current domain semantics and meaningful regression coverage. Each slice must remain verifiable with unmigrated behavior still operational until the compatibility-removal ticket.

Implementation, when requested, follows the repository workflow and required checks. Native/live evidence is separate. No implementation claim is assigned by publication.

## Comments

Published from the user-approved 16-ticket breakdown after the instruction “Publish tickets.” Earlier partial work is preserved, unintegrated and unaccepted; reconcile it against this ticket before considering any reuse.

Resolved by coordinator after integration, review and verification at `5f427df85a35e29aa56cdeea8d156499cea83ace`. Ticket integration commit: `81ae9543ef04b923236a43b07610a8aed6fbe0b2`. Evidence: `../../../.local/ui-behavior/run.json`.
