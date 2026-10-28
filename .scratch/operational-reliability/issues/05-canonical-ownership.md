# 05: Validate canonical effort ownership and decision coverage

**What to build:** Make an effort's canonical owner, feature directory, participating roles, decision coverage and preserved evidence discoverable and mechanically checkable through the existing tracker/recovery tooling.

**Blocked by:** None (can start immediately).

**Status:** resolved

- [x] Existing tracker procedures establish ownership before plans/tickets, companion pointers and compact decision-to-spec coverage.
- [x] Versioned ledger/status support validates ownership/reference consistency and preserved artifact availability while reading historical v1 inputs.
- [x] Public Git/CLI fixtures prove missing or conflicting references and private artifacts are handled read-only without disclosure.
- [x] This effort uses the convention; historical auth/logging artifacts and active work remain intact; AGENTS entry points stay small.
- [x] The versioned record/reference contract is documented for operational handoff records in ticket 06.

## Context

The [approved specification](../spec.md) and [decision coverage](../decisions.md) define the complete contract and confirmed public testing seams. Preserve existing product invariants; this ticket changes operational verification only. The coordinator owns claims, integration and resolution.

## Answer

Implemented and integrated on the client branch. The v2 ledger validates canonical ownership, role pointers, decision coverage and preserved evidence while retaining v1 compatibility. Public fixtures cover inconsistent references and private artifacts without mutation or disclosure. Final cross-effort verification and review are recorded in the local run ledger.
