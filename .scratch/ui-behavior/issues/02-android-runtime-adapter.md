# 02: Adapt Android to the shared UI seam

Status: resolved
Blocked by: 01
Execution: authorized by D6 in ../decisions.md.

**What to build:** Android renders and acts through the same shared UI interface as the scripted harness while retaining its native lifecycle, capabilities and connection presentation.

**Dependencies:** [01: Establish the seam through Pairing submission](01-pairing-submission-seam.md)

**Specification:** [Reducer-backed UI behavior and runtime adapters](../spec.md). Requirements R3, R4, R6, R8; user stories 3, 14–15, 39–40. [Decisions D1–D5](../decisions.md) apply.

- [ ] Android selects a production adapter; its view no longer owns bridge reads, subscription sequencing or runtime refresh orchestration.
- [ ] The adapter supplies current observations and existing action outcomes without changing native startup, shutdown, scanning, input or geometry behavior.
- [ ] Startup, stop and restart have explicit ownership; delayed startup, reads and callbacks from a retired owner cannot update a replacement owner.
- [ ] Unknown, disconnected, Direct Connection and Relayed Connection observations remain distinguishable in the mounted UI.
- [ ] Settings, history, notifications and runtime state retain their independent authoritative consumers and recovery semantics.
- [ ] Unavailable capabilities retain their established hidden or disabled presentation and are never represented by successful no-ops.
- [ ] Adapter tests use controlled native/runtime dependencies to verify projection, ordering and cleanup; the common mounted Pairing journey still runs with the scripted adapter.
- [ ] Android typechecks and web compilation pass; native/live acceptance is reported separately rather than inferred from these tests.

## Verification and scope

Use the agreed seam: mounted production UI, real reducer behavior and effect runner, with scripted external effects and observations. Assert observable behavior rather than private state or helper-call structure. Retain current domain semantics and meaningful regression coverage. Each slice must remain verifiable with unmigrated behavior still operational until the compatibility-removal ticket.

Implementation, when requested, follows the repository workflow and required checks. Native/live evidence is separate. No implementation claim is assigned by publication.

## Comments

Published from the user-approved 16-ticket breakdown after the instruction “Publish tickets.” Earlier partial work is preserved, unintegrated and unaccepted; reconcile it against this ticket before considering any reuse.

Resolved by coordinator after integration, review and verification at `5f427df85a35e29aa56cdeea8d156499cea83ace`. Ticket integration commit: `60744196454803da5bdf07ae201be53d7394ad43`. Evidence: `../../../.local/ui-behavior/run.json`.
