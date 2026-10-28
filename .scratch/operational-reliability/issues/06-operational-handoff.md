# 06: Recover operational facts and scoped authorization

**What to build:** Resume work with exact deployment identity, qualified evidence, observed service access and scoped authorization available through existing durable records and status output.

**Blocked by:** [05: Validate canonical effort ownership and decision coverage](05-canonical-ownership.md).

**Status:** resolved

- [x] Deployment context/namespace/release/public endpoint are separate from display name and dated qualification status.
- [x] Access records contain source, observed working route, resource scope and recheck instructions without secrets or automatic execution.
- [x] Authorization records capture source/date/action/resources/limits and revocation or supersession; presence and schema validity never confer permission.
- [x] Unknown/historical facts remain explicit, applicable permission is reused, and missing operational facts affect only dependent work.
- [x] Public CLI fixtures cover invalid references, history, supersession/revocation, read-only behavior and private canaries; this run records the user's clipboard overwrite authorization.

## Context

The [approved specification](../spec.md) and [decision coverage](../decisions.md) define the complete contract and confirmed public testing seams. Preserve existing product invariants; this ticket changes operational verification only. The coordinator owns claims, integration and resolution.

## Answer

Implemented and integrated on the client branch. Versioned operational records preserve deployment/access unknowns, dated sources, authorization limits, revocation/supersession history and scoped blockers. Status remains read-only and never infers permission. This run's clipboard-overwrite and disposable-Docker authorizations are recorded from the approved decision source; no deployment or access route was invented. Public fixtures and the client check passed. Evidence is in the local run ledger.
