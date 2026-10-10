# Compose actionable recovery issues

Type: implementation
Status: open
Assignee: none
Priority band: 1
Blocked by: 05, 07
Dispatch: plan approved; awaiting an authorized execution run
Parent: [Clipp UX implementation](../spec.md)

## Outcome

Simultaneous problems remain readable and actionable without covering the app.

## Work and boundaries

Compose stable scoped issues, one compact summary and task-local failures; expandable diagnostics stay inside a bounded task. Wire actual wrapper/runtime faults, including first-launch identity unavailable, retry and ongoing capture recovery. Coalesce duplicates without dropping independent faults.

Dismissal does not resolve a fault or hide active recovery. Disconnected trusted devices and deliberately empty relays are not failures. Preserve copied-without-clip and pending-capture semantics.

The [approved package contract](../../ux-implementation-plan/correctness-delivery-proposal.md#actionable-issue-composition) is normative detail for this ticket. Preserve the [shared interfaces](../../ux-implementation-plan/shared-interface-proposal.md) and [specification invariants](../spec.md#preserved-contracts). Update every affected live runtime bridge with its consumer; do not leave a successful helper behind a broken caller.

## Dependencies and integration

- [Report immediate Pairing and approval results](05-report-immediate-pairing-results.md) — consume its completed, scoped output.
- [Preserve session tasks and editor recovery](07-preserve-session-tasks-and-editor-recovery.md) — consume its completed, scoped output.

Only the output scoped here must be complete to resolve this ticket. Later consumers requalify their changed presentation; broad finding collection is separate and cannot block this ticket on its own descendants. Follow [phase admission](../spec.md#delivery-order-and-completion) rather than treating file numbers as an execution sequence.

## Verification and acceptance

Test combined History/Pairing/initialization/relay problems, Retry/dismiss rules, long errors and enlarged text in the actual short popup and Android task. Verify cold initialization failure cannot enable falsely ready actions.

Run the [common candidate gates](../spec.md#verification-and-evidence) plus affected suites/builds/native checks. Record exact revision/dirty state, environment, commands and actual outcomes. Preserve regressions through the owning interface; use rendered/native evidence for the behavior that requires it, not implementation-mirroring helper tests.

## Coverage and closure

Candidate combined-failure geometry and initialization recovery. Android IME/safe bounds and final navigation sizing contribute to A13 closure.

The [coverage ledger](../validation-coverage.md) specifies Candidate, External and Retained dispositions and fresh native intervals. Required missing evidence leaves the affected portion unqualified; report it explicitly. No old observation or planning approval is a pass. Primary finding collector: E02, C04, A13, A17 Full finding closure requires all [traceability contributions](../traceability.md), not merely this ticket's completion. Separate additions keep their own names and are not counted as new runtime findings.

## Source anchors

- [ClipboardApp.tsx](../../../packages/ui/src/ClipboardApp.tsx)
- [main.tsx](../../../apps/android/src/main.tsx)
- [clipboardActionFeedback.ts](../../../packages/ui/src/clipboardActionFeedback.ts)
- [clipboardActionFeedback.test.ts](../../../tests/ui/clipboardActionFeedback.test.ts)

## Handoff

Coordinator records the fresh baseline/claim, accepted decision assessment, isolated worktree, integration revision, checks and Standards/Spec review under [project workflow](../../../docs/agents/workflow.md). Preserve unrelated work. No code, native operation, commit, push or deployment has occurred for this planning ticket.
