# Preserve session tasks and editor recovery

Type: implementation
Status: open
Assignee: none
Priority band: 1
Blocked by: 03, 04, 05
Dispatch: plan approved; awaiting an authorized execution run
Parent: [Clipp UX implementation](../spec.md)

## Outcome

Live tasks retain drafts and context across responsive presentation and dismissal; relay results remain honest.

## Work and boundaries

Extend the existing session owner above layout mounts for relay/name/alias/Pairing editors, query, focus/scroll and task stack. Back/Close retain, Cancel/Discard clears. Relay writes are entity/field-scoped; await Edit/Remove/Login/Retry and reconcile partial credential/configuration effects.

No restart/popup-destruction draft persistence. Explicit Save overwrites edited fields only. Browser opening is not authenticated success; removing relay is not sign-out or revocation. Empty defaults and single-session fallback remain.

The [approved package contract](../../ux-implementation-plan/correctness-delivery-proposal.md#session-tasks-and-remaining-editor-recovery) is normative detail for this ticket. Preserve the [shared interfaces](../../ux-implementation-plan/shared-interface-proposal.md) and [specification invariants](../spec.md#preserved-contracts). Update every affected live runtime bridge with its consumer; do not leave a successful helper behind a broken caller.

## Dependencies and integration

- [Confirm and recover Clear all local history](03-confirm-clear-all-history.md) — consume its completed, scoped output.
- [Retain Device Name and alias edits](04-retain-name-and-alias-edits.md) — consume its completed, scoped output.
- [Report immediate Pairing and approval results](05-report-immediate-pairing-results.md) — consume its completed, scoped output.

Only the output scoped here must be complete to resolve this ticket. Later consumers requalify their changed presentation; broad finding collection is separate and cannot block this ticket on its own descendants. Follow [phase admission](../spec.md#delivery-order-and-completion) rather than treating file numbers as an execution sequence.

## Verification and acceptance

Test remount/resize/dismiss/reopen, late Save with new typing, removed target and credential deletion followed by persistence failure. Cover shared Electron/Android Auto Sync rejection/unconfirmed feedback through the same action contract. Controlled auth cancellation/failure is required; real sign-in stays deferred.

Run the [common candidate gates](../spec.md#verification-and-evidence) plus affected suites/builds/native checks. Record exact revision/dirty state, environment, commands and actual outcomes. Preserve regressions through the owning interface; use rendered/native evidence for the behavior that requires it, not implementation-mirroring helper tests.

## Coverage and closure

Candidate draft/action/credential partial-effect checks; external real auth/credential-store lifecycle. Collect E11 only after edits, approval and relay portions pass.

The [coverage ledger](../validation-coverage.md) specifies Candidate, External and Retained dispositions and fresh native intervals. Required missing evidence leaves the affected portion unqualified; report it explicitly. No old observation or planning approval is a pass. Primary finding collector: E05, E11 Full finding closure requires all [traceability contributions](../traceability.md), not merely this ticket's completion. Separate additions keep their own names and are not counted as new runtime findings.

## Source anchors

- [ManagedRelaySettings.tsx](../../../packages/ui/src/ManagedRelaySettings.tsx)
- [managedRelayAction.ts](../../../packages/ui/src/managedRelayAction.ts)
- [managedRelayConfiguration.ts](../../../apps/extension/src/managedRelayConfiguration.ts)
- [managedRelayConfiguration.test.ts](../../../tests/extension/managedRelayConfiguration.test.ts)
- [ClipboardApp.tsx](../../../packages/ui/src/ClipboardApp.tsx)

## Handoff

Coordinator records the fresh baseline/claim, accepted decision assessment, isolated worktree, integration revision, checks and Standards/Spec review under [project workflow](../../../docs/agents/workflow.md). Preserve unrelated work. No code, native operation, commit, push or deployment has occurred for this planning ticket.
