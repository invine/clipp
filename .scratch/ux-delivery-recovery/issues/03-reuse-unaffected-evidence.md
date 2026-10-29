# 03: Reuse unaffected evidence safely

**What to build:** Let the coordinator retain valid behavioral evidence across unrelated changes while reliably withholding resolution when the tested behavior, inputs or acceptance contract changed.

**Blocked by:** [01 — Define finite acceptance and refine the UX dependency graph](01-refine-acceptance-and-dependencies.md), [02 — Prepare a reproducible acceptance candidate](02-prepare-reproducible-candidate.md).

**Status:** resolved

**Assignee:** `/root/evidence_applicability`

**Claim:** ux-delivery-recovery-20261028-03; coordinator `/root`.

**Parent:** [Approved specification](../spec.md).

- [x] Extend the existing ledger and read-only status CLI to evaluate evidence against the scenario allocation and candidate inputs supplied by tickets 01 and 02.
- [x] Preserve each original observation, result and revision. A separate carry-forward record identifies the new candidate, scenario, relevant inputs, assessed changes, rationale and reviewer; it does not masquerade as a fresh execution.
- [x] Status-only or documentation-only changes can retain evidence when execution inputs and requirements are unchanged. Documentation that alters acceptance meaning cannot qualify through a filename-only exemption.
- [x] Relevant source, workspace/dependency, lockfile, toolchain, build, runner, fault-injection, artifact or environment changes invalidate affected scenarios. Unknown impact requires review or an affected-scenario rerun; it never creates an automatic pass.
- [x] Update the unconditional current-tip freshness instructions and executable behavior together. Historical ledger versions remain readable with their original semantics until explicitly migrated.
- [x] Continue checking actual integration mappings, current Git facts and ownership. Missing roots, conflicting claims or an invalid graph remain integrity failures; known stale scenario evidence blocks that ticket and its consumers without suppressing unrelated consistent work.
- [x] Public CLI tests using temporary real repositories exercise unaffected carry-forward, changed acceptance prose, relevant runtime changes, unknown impact, old ledger formats, failed evidence and an independent eligible ticket.
- [x] Status remains read-only, bounded and free of private artifact content. It never executes recorded commands, mutates ticket status or infers authorization from a valid record. Focused checks and applicable project verification/review pass.

**Scope boundary:** This ticket changes evidence applicability, not historical results or product acceptance requirements. Consume prerequisite recovery tooling only through the established main-first integration policy.

## Answer

Integrated source0637bc51544d31e83960e1366f07b75a12837089 (feature45c7972 plus exact-path correction) from baseline6a517dc3a71fb15ece787ba2ab08da07ff79e2e1. V3 now evaluates explicit candidate/scenario bindings and reviewer-assessed actual Git object/path changes; original outcomes/revisions remain unchanged, relevant or unknown impact withholds the affected scope, integrity failures still withhold dispatch globally, and v1/v2 retain original semantics. Strict canonical Status/Assignee-only header equivalence is supported without accepting changed acceptance prose.

All58 public real-Git CLI cases pass. Feature hook passed81 suites/756 tests plus21 candidate fixtures; the correction hook completed successfully before source0637bc5 was created. Its raw redirect log was accidentally overwritten by a cancelled duplicate invocation; the limitation and original successful command completion are preserved in `ticket-03-path-fix-commit.json`, with no fabricated counts. Both review axes cleared the corrected source; Standards’ false-applicability whitespace-path reproduction now refuses the mismatched assessment.

Coordinator `/root` resolves03 on2026-10-28. Evidence and reports are preserved outside disposable worktrees under primary-root `.local/ux-delivery-recovery/evidence`. No native observation, permission or live UX migration follows from metadata validity or this closure. The separately identified candidate-preparer NUL-path regression is retained under05’s setup boundary.
