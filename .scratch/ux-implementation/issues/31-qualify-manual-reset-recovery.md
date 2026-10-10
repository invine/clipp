# Qualify manual reset faults and restart recovery

Type: implementation
Status: open
Assignee: none
Priority band: 3
Blocked by: 30
Dispatch: plan approved; awaiting an authorized execution run
Parent: [Clipp UX implementation](../spec.md)

## Outcome

Each enabled runtime has demonstrated durable manual reset and recovery on disposable synthetic data.

## Work and boundaries

Run the approved phase-by-phase fault/restart matrix against integrated UI and actual stores/hosts. Collect cleanup/preservation, duplicate/automatic race, native queue, clipboard baseline and receipt evidence. Enable only a runtime whose mandatory path has passed; keep unqualified hosts unavailable with accurate status.

No operator profile or implicit account/clipboard permission. Old Identity Loss evidence, fake transactions or passing unit suites do not qualify manual reset. No cross-runtime complete claim while a host remains unqualified.

The [approved package contract](../../ux-implementation-plan/manual-identity-reset-proposal.md#failure-and-restart-acceptance-matrix) is normative detail for this ticket. Preserve the [shared interfaces](../../ux-implementation-plan/shared-interface-proposal.md) and [specification invariants](../spec.md#preserved-contracts). Update every affected live runtime bridge with its consumer; do not leave a successful helper behind a broken caller.

## Dependencies and integration

- [Integrate authenticated manual reset actions and UI](30-integrate-manual-reset-ui.md) — consume its completed, scoped output.

Only the output scoped here must be complete to resolve this ticket. Later consumers requalify their changed presentation; broad finding collection is separate and cannot block this ticket on its own descendants. Follow [phase admission](../spec.md#delivery-order-and-completion) rather than treating file numbers as an execution sequence.

## Verification and acceptance

Record exact candidate/build/environment and reopen after each durable boundary, finalization failure and restart failure. Verify new singleton/default name/empty reset-boundary History, preserved settings and former-ID reminder restart/dismiss/repeat policy. Fresh marker interval proves no clipboard erasure/recapture.

Run the [common candidate gates](../spec.md#verification-and-evidence) plus affected suites/builds/native checks. Record exact revision/dirty state, environment, commands and actual outcomes. Preserve regressions through the owning interface; use rendered/native evidence for the behavior that requires it, not implementation-mirroring helper tests.

## Coverage and closure

Candidate integrated reset; external Chrome baseline and any unavailable native prerequisite remain explicit blockers for that host, not waivers or blockers for unrelated completed UX work.

The [coverage ledger](../validation-coverage.md) specifies Candidate, External and Retained dispositions and fresh native intervals. Required missing evidence leaves the affected portion unqualified; report it explicitly. No old observation or planning approval is a pass. Primary finding collector: Supporting package or separate approved addition; see traceability. Full finding closure requires all [traceability contributions](../traceability.md), not merely this ticket's completion. Separate additions keep their own names and are not counted as new runtime findings.

## Source anchors

- [identityRotation.ts](../../../packages/core/trust/identityRotation.ts)
- [identityRotation.test.ts](../../../tests/core/trust/identityRotation.test.ts)
- [identityRotationSQLite.test.ts](../../../tests/core/trust/identityRotationSQLite.test.ts)
- [identityInitialization.test.ts](../../../tests/core/runtime/identityInitialization.test.ts)
- [clipContinuity.test.ts](../../../tests/android/clipContinuity.test.ts)

## Handoff

Coordinator records the fresh baseline/claim, accepted decision assessment, isolated worktree, integration revision, checks and Standards/Spec review under [project workflow](../../../docs/agents/workflow.md). Preserve unrelated work. No code, native operation, commit, push or deployment has occurred for this planning ticket.
