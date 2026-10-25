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

Integrated at client `e35794a2c884b75d6893c8e1aa9075dd19e03e16`; independent Standards and Spec reviews passed. Fresh integrated routine verification passed 79 suites/694 tests, all typechecks and three production builds; public CLI/navigation checks passed 29 tests. Durable receipt: client local artifact `merge-05.json` under this effort's run directory. The actual run now uses v2 with all six decisions and the relay pointer; historical v1 ledger is preserved.
