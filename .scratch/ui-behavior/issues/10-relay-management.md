# 10: Handle relay management journeys

Status: resolved
Blocked by: 08
Execution: authorized by D6 in ../decisions.md.

**What to build:** Relay configuration and account actions are testable as complete UI journeys with preserved drafts, pending state and recovery, without opening real login pages or changing live connections.

**Dependencies:** [08: Consolidate navigation and task ownership](08-navigation-and-task-ownership.md)

**Specification:** [Reducer-backed UI behavior and runtime adapters](../spec.md). Requirements R1, R2, R3, R5, R6, R7, R8; user stories 6–9, 30, 38–39. [Decisions D1–D5](../decisions.md) apply.

- [ ] Relay edit, save, removal, login, account and retry interactions use shared behavior and runtime effects while retaining useful existing editor ownership.
- [ ] Pending work prevents duplicate actions and preserves raw drafts after rejection or unconfirmed results.
- [ ] Late results cannot overwrite newer edits or a replaced task; supported suspension and return preserve the correct editor target.
- [ ] Runtime relay observations control connection/status presentation; an action result alone does not invent a ready relay.
- [ ] Scripted scenarios cover empty initial configurations, explicit configured relays, edit failure, removal uncertainty and account/retry outcomes.
- [ ] Mounted tests cross the real UI/effect seam, with no browser login, credentials, transport setup or live configuration mutation.
- [ ] Startup-empty managed relay settings and the accepted single retained Relay Session with transport fallback remain unchanged.

## Verification and scope

Use the agreed seam: mounted production UI, real reducer behavior and effect runner, with scripted external effects and observations. Assert observable behavior rather than private state or helper-call structure. Retain current domain semantics and meaningful regression coverage. Each slice must remain verifiable with unmigrated behavior still operational until the compatibility-removal ticket.

Implementation, when requested, follows the repository workflow and required checks. Native/live evidence is separate. No implementation claim is assigned by publication.

## Comments

Published from the user-approved 16-ticket breakdown after the instruction “Publish tickets.” Earlier partial work is preserved, unintegrated and unaccepted; reconcile it against this ticket before considering any reuse.

Resolved by coordinator after integration, review and verification at `5f427df85a35e29aa56cdeea8d156499cea83ace`. Ticket integration commit: `b80b5648dc86ae783ae11cc93dc46bebaa08f1cc`. Evidence: `../../../.local/ui-behavior/run.json`.
