# 16: Complete scenario coverage and verify the application

Status: resolved
Blocked by: 15
Execution: authorized by D6 in ../decisions.md.

**What to build:** Developers have a documented, reusable scenario catalog and automated evidence that the complete application UI can be exercised through scripted effects across supported surfaces.

**Dependencies:** [15: Remove migration compatibility and complete ownership](15-remove-migration-compatibility.md)

**Specification:** [Reducer-backed UI behavior and runtime adapters](../spec.md). Requirements R1–R8; user stories 1–44. [Decisions D1–D5](../decisions.md) apply.

- [ ] A coverage map accounts for every specification story and required journey, using scenarios and tests delivered by preceding tickets rather than deferring their validation to this ticket.
- [ ] The interactive catalog includes connection states, Pairing, Clip actions, history, naming/revocation, relays, preferences/recovery, notifications, background controls and identity changes.
- [ ] Scenario controls can reset observations and settle pending effects; automated tests use the same scripted adapter and production behavior.
- [ ] Representative wide/narrow journeys preserve usable navigation, task presentation and focus; tests interact through rendered controls.
- [ ] Cross-workflow tests settle late work after navigation, Identity Rotation, unmount/remount and adapter replacement, proving that obsolete work cannot affect the current owner.
- [ ] Verify scripted journeys need no live credentials/devices/network/native startup or system clipboard writes, and fail on unexpected real effects.
- [ ] Document local launch, scenario selection, automated journey and harness-build commands; ensure test controls and fixtures are excluded from production delivery.
- [ ] Run routine lint, all typechecks, tests and all three runtime production builds, plus harness build and mounted journeys on the final integrated result.
- [ ] Complete Standards and Spec reviews with findings resolved; record native/live acceptance as separate and do not claim real connectivity or Clip delivery from stubbed tests.

## Verification and scope

Use the agreed seam: mounted production UI, real reducer behavior and effect runner, with scripted external effects and observations. Assert observable behavior rather than private state or helper-call structure. Retain current domain semantics and meaningful regression coverage. Each slice must remain verifiable with unmigrated behavior still operational until the compatibility-removal ticket.

Implementation, when requested, follows the repository workflow and required checks. Native/live evidence is separate. No implementation claim is assigned by publication.

## Comments

Published from the user-approved 16-ticket breakdown after the instruction “Publish tickets.” Earlier partial work is preserved, unintegrated and unaccepted; reconcile it against this ticket before considering any reuse.

Resolved by coordinator after integration, review and verification at `5f427df85a35e29aa56cdeea8d156499cea83ace`. Ticket integration commit: `f2c667c5a89292236fceffcd336c35959df0a91e`. Evidence: `../../../.local/ui-behavior/run.json`.
