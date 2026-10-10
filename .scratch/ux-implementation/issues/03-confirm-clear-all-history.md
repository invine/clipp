# Confirm and recover Clear all local history

Type: implementation
Status: open
Assignee: none
Priority band: 1
Blocked by: 02
Dispatch: plan approved; awaiting an authorized execution run
Parent: [Clipp UX implementation](../spec.md)

## Outcome

Clear all has an explicit local destructive review and truthful recovery on existing surfaces.

## Work and boundaries

Introduce the accessible shared task frame with this real consumer. Explain pinned and filtered-out history, local scope and no Undo. Cancel invokes nothing; Confirm awaits cleanup and preserves query. Keep existing working entry until Advanced/full-page cutover.

Durable history cleanup precedes pending-capture clearing. Single Delete remains immediate; no new Undo or remote deletion.

The [approved package contract](../../ux-implementation-plan/correctness-delivery-proposal.md#explicit-clear-all-local-history) is normative detail for this ticket. Preserve the [shared interfaces](../../ux-implementation-plan/shared-interface-proposal.md) and [specification invariants](../spec.md#preserved-contracts). Update every affected live runtime bridge with its consumer; do not leave a successful helper behind a broken caller.

## Dependencies and integration

- [Reconcile authoritative History and queries](02-reconcile-authoritative-history.md) — consume its completed, scoped output.

Only the output scoped here must be complete to resolve this ticket. Later consumers requalify their changed presentation; broad finding collection is separate and cannot block this ticket on its own descendants. Follow [phase admission](../spec.md#delivery-order-and-completion) rather than treating file numbers as an execution sequence.

## Verification and acceptance

Cancel and confirm with pinned/filtered entries; fail durable deletion and retry while capture recovery is pending. Verify suppression-capacity behavior and live second-view reconciliation. Check reachable review/actions at the candidate sizes claimed by this change.

Run the [common candidate gates](../spec.md#verification-and-evidence) plus affected suites/builds/native checks. Record exact revision/dirty state, environment, commands and actual outcomes. Preserve regressions through the owning interface; use rendered/native evidence for the behavior that requires it, not implementation-mirroring helper tests.

## Coverage and closure

Candidate destructive action/failure checks. Final placement is verified again by Settings and Chrome management; native permissions are separate.

The [coverage ledger](../validation-coverage.md) specifies Candidate, External and Retained dispositions and fresh native intervals. Required missing evidence leaves the affected portion unqualified; report it explicitly. No old observation or planning approval is a pass. Primary finding collector: E09 Full finding closure requires all [traceability contributions](../traceability.md), not merely this ticket's completion. Separate additions keep their own names and are not counted as new runtime findings.

## Source anchors

- [ClipboardApp.tsx](../../../packages/ui/src/ClipboardApp.tsx)
- [captureCoordinator.ts](../../../packages/core/clipboard/captureCoordinator.ts)
- [captureCoordinator.test.ts](../../../tests/core/clipboard/captureCoordinator.test.ts)
- [backendConformance.ts](../../../tests/core/history/backendConformance.ts)

## Handoff

Coordinator records the fresh baseline/claim, accepted decision assessment, isolated worktree, integration revision, checks and Standards/Spec review under [project workflow](../../../docs/agents/workflow.md). Preserve unrelated work. No code, native operation, commit, push or deployment has occurred for this planning ticket.
