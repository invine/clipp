# 03: Reuse unaffected evidence safely

**What to build:** Let the coordinator retain valid behavioral evidence across unrelated changes while reliably withholding resolution when the tested behavior, inputs or acceptance contract changed.

**Blocked by:** [01 — Define finite acceptance and refine the UX dependency graph](01-refine-acceptance-and-dependencies.md), [02 — Prepare a reproducible acceptance candidate](02-prepare-reproducible-candidate.md).

**Status:** claimed

**Assignee:** `/root/evidence_applicability`

**Claim:** ux-delivery-recovery-20261028-03; coordinator `/root`.

**Parent:** [Approved specification](../spec.md).

- [ ] Extend the existing ledger and read-only status CLI to evaluate evidence against the scenario allocation and candidate inputs supplied by tickets 01 and 02.
- [ ] Preserve each original observation, result and revision. A separate carry-forward record identifies the new candidate, scenario, relevant inputs, assessed changes, rationale and reviewer; it does not masquerade as a fresh execution.
- [ ] Status-only or documentation-only changes can retain evidence when execution inputs and requirements are unchanged. Documentation that alters acceptance meaning cannot qualify through a filename-only exemption.
- [ ] Relevant source, workspace/dependency, lockfile, toolchain, build, runner, fault-injection, artifact or environment changes invalidate affected scenarios. Unknown impact requires review or an affected-scenario rerun; it never creates an automatic pass.
- [ ] Update the unconditional current-tip freshness instructions and executable behavior together. Historical ledger versions remain readable with their original semantics until explicitly migrated.
- [ ] Continue checking actual integration mappings, current Git facts and ownership. Missing roots, conflicting claims or an invalid graph remain integrity failures; known stale scenario evidence blocks that ticket and its consumers without suppressing unrelated consistent work.
- [ ] Public CLI tests using temporary real repositories exercise unaffected carry-forward, changed acceptance prose, relevant runtime changes, unknown impact, old ledger formats, failed evidence and an independent eligible ticket.
- [ ] Status remains read-only, bounded and free of private artifact content. It never executes recorded commands, mutates ticket status or infers authorization from a valid record. Focused checks and applicable project verification/review pass.

**Scope boundary:** This ticket changes evidence applicability, not historical results or product acceptance requirements. Consume prerequisite recovery tooling only through the established main-first integration policy.
