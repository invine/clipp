# 01: Establish the seam through Pairing submission

Status: resolved
Blocked by: None
Execution: authorized by D6 in ../decisions.md.

**What to build:** A developer can paste and submit Pairing text in the real UI using either Electron effects or scripted effects, and inspect the same pending, failure and retry journey in a local browser without connecting to another device.

**Dependencies:** None (no dependency blockers; implementation still requires a new user instruction).

**Specification:** [Reducer-backed UI behavior and runtime adapters](../spec.md). Requirements R1, R2, R3, R5, R6, R7, R8; user stories 1–12, 16–18, 38–39, 42–44. [Decisions D1–D5](../decisions.md) apply.

- [ ] Introduce the shared UI-facing observation/subscription/action interface alongside existing wiring, keeping unmigrated workflows and runtimes operational.
- [ ] The migrated Pairing journey runs production reducer transitions and the effect runner in Electron, mounted tests and the browser harness; reducers perform no external effects.
- [ ] Electron supplies the production observation and Pairing action adapter, with owned startup/subscription cleanup and current runtime authority preserved.
- [ ] The scripted adapter supports initial observations, publications, deferred results and observable requested effects; unexpected production effects fail rather than silently run.
- [ ] A real submit click records one trimmed Pairing request; while pending, further submissions do not start another request.
- [ ] Failure or an unconfirmed result retains editable input; a later successful result cannot erase newer typing or imply completed Admission.
- [ ] Identity change, disposal and adapter replacement retire obsolete Pairing results; lifecycle replay does not duplicate subscriptions or requests.
- [ ] A minimal browser entry mounts the production UI with scripted pending/failure/success scenarios, can reset the scenario and settle an outstanding result, and has a documented local launch command.
- [ ] Mounted tests exercise the whole journey without real network, system clipboard, native runtime or persistence activity; the harness is excluded from production delivery.
- [ ] Existing UI and runtime checks remain green. This is an initial vertical slice, not completion of the overall migration.

## Verification and scope

Use the agreed seam: mounted production UI, real reducer behavior and effect runner, with scripted external effects and observations. Assert observable behavior rather than private state or helper-call structure. Retain current domain semantics and meaningful regression coverage. Each slice must remain verifiable with unmigrated behavior still operational until the compatibility-removal ticket.

Implementation, when requested, follows the repository workflow and required checks. Native/live evidence is separate. No implementation claim is assigned by publication.

## Comments

Published from the user-approved 16-ticket breakdown after the instruction “Publish tickets.” Earlier partial work is preserved, unintegrated and unaccepted; reconcile it against this ticket before considering any reuse.

Resolved by coordinator after integration, review and verification at `5f427df85a35e29aa56cdeea8d156499cea83ace`. Ticket integration commit: `e299f225e795e82ffa66e691b209b90350fc9c38`. Evidence: `../../../.local/ui-behavior/run.json`.
