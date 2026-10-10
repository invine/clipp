# Repair notifications, permissions and Requests entry

Type: implementation
Status: open
Assignee: none
Priority band: 1
Blocked by: 07, 08, 11, 13
Dispatch: plan approved; awaiting an authorized execution run
Parent: [Clipp UX implementation](../spec.md)

## Outcome

Notification permission recovery is reachable and selecting a real request opens Requests after readiness.

## Work and boundaries

Implement app/channel availability and user-initiated settings return; route selection through the existing host destination owner. Retain readiness entry, coalesce duplicates and reconcile expired requests. Chrome consumes secure full-page handoff; Android reconnect notifications retain their distinct purpose.

Denial is not a new continuity prerequisite. Arrival alone does not navigate, selection is not Pairing success, and dirty task context is preserved.

The [approved package contract](../../ux-implementation-plan/native-host-delivery-proposal.md#notifications-permission-recovery-and-requests-entry) is normative detail for this ticket. Preserve the [shared interfaces](../../ux-implementation-plan/shared-interface-proposal.md) and [specification invariants](../spec.md#preserved-contracts). Update every affected live runtime bridge with its consumer; do not leave a successful helper behind a broken caller.

## Dependencies and integration

- [Preserve session tasks and editor recovery](07-preserve-session-tasks-and-editor-recovery.md) — consume its completed, scoped output.
- [Compose actionable recovery issues](08-compose-actionable-recovery-issues.md) — consume its completed, scoped output.
- [Deliver complete Chrome management and secure handoff](11-deliver-complete-chrome-management.md) — consume its completed, scoped output.
- [Integrate native task input and focus](13-integrate-native-task-input.md) — consume its completed, scoped output.

Only the output scoped here must be complete to resolve this ticket. Later consumers requalify their changed presentation; broad finding collection is separate and cannot block this ticket on its own descendants. Follow [phase admission](../spec.md#delivery-order-and-completion) rather than treating file numbers as an execution sequence.

## Verification and acceptance

Separately verify permission/destination wiring and real delivery/selection with a genuine request on each host. Diagnose Electron OS error without assuming cause. Cover cold/resumed/hidden hosts, worker wake, stale request, denial/regrant and repeated selection.

Run the [common candidate gates](../spec.md#verification-and-evidence) plus affected suites/builds/native checks. Record exact revision/dirty state, environment, commands and actual outcomes. Preserve regressions through the owning interface; use rendered/native evidence for the behavior that requires it, not implementation-mirroring helper tests.

## Coverage and closure

Candidate delivered notification/permission journeys and Android request routing. Requires new coordinated permission interval where global settings change; callbacks alone do not pass.

The [coverage ledger](../validation-coverage.md) specifies Candidate, External and Retained dispositions and fresh native intervals. Required missing evidence leaves the affected portion unqualified; report it explicitly. No old observation or planning approval is a pass. Primary finding collector: A07 Full finding closure requires all [traceability contributions](../traceability.md), not merely this ticket's completion. Separate additions keep their own names and are not counted as new runtime findings.

## Source anchors

- [notifications.ts](../../../packages/core/runtime/notifications.ts)
- [main.ts](../../../apps/electron/src/main.ts)
- [background.ts](../../../apps/extension/src/background.ts)
- [client.ts](../../../apps/android/src/client.ts)
- [notifications.test.ts](../../../tests/core/runtime/notifications.test.ts)

## Handoff

Coordinator records the fresh baseline/claim, accepted decision assessment, isolated worktree, integration revision, checks and Standards/Spec review under [project workflow](../../../docs/agents/workflow.md). Preserve unrelated work. No code, native operation, commit, push or deployment has occurred for this planning ticket.
