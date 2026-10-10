# Project authoritative Pairing outcomes

Type: implementation
Status: open
Assignee: none
Priority band: 1
Blocked by: 02, 05, 07
Dispatch: plan approved; awaiting an authorized execution run
Parent: [Clipp UX implementation](../spec.md)

## Outcome

Pairing tasks explain actual response, waiting and membership-recovery outcomes.

## Work and boundaries

Add bounded per-target current-identity/session projection to the existing coordinator, ordered through each runtime. Show validated accepted/rejected response, local waiting end without response and persistent Admission recovery; clear terminal information only when appropriate.

Membership remains authoritative; disappearing waiting is not acceptance. Signed request dismissal is not cancellation, and later valid acceptance may follow rejection. No durable outgoing authorization/replay model.

The [approved package contract](../../ux-implementation-plan/correctness-delivery-proposal.md#authoritative-pairing-outcomes) is normative detail for this ticket. Preserve the [shared interfaces](../../ux-implementation-plan/shared-interface-proposal.md) and [specification invariants](../spec.md#preserved-contracts). Update every affected live runtime bridge with its consumer; do not leave a successful helper behind a broken caller.

## Dependencies and integration

- [Reconcile authoritative History and queries](02-reconcile-authoritative-history.md) — consume its completed, scoped output.
- [Report immediate Pairing and approval results](05-report-immediate-pairing-results.md) — consume its completed, scoped output.
- [Preserve session tasks and editor recovery](07-preserve-session-tasks-and-editor-recovery.md) — consume its completed, scoped output.

Only the output scoped here must be complete to resolve this ticket. Later consumers requalify their changed presentation; broad finding collection is separate and cannot block this ticket on its own descendants. Follow [phase admission](../spec.md#delivery-order-and-completion) rather than treating file numbers as an execution sequence.

## Verification and acceptance

Test expired/invalid responses, rejection then acceptance, waiting expiry, failed Admission/recovery, dismissal and identity changes. Qualify complete native app-to-app Pairing with a permitted route per affected runtime; collect Chrome full-page integration separately, without delaying this core output on the later layout.

Run the [common candidate gates](../spec.md#verification-and-evidence) plus affected suites/builds/native checks. Record exact revision/dirty state, environment, commands and actual outcomes. Preserve regressions through the owning interface; use rendered/native evidence for the behavior that requires it, not implementation-mirroring helper tests.

## Coverage and closure

Candidate complete app-to-app Pairing; managed-route/auth and broad transfer matrix remain external. Protocol-peer tests alone cannot close native qualification.

The [coverage ledger](../validation-coverage.md) specifies Candidate, External and Retained dispositions and fresh native intervals. Required missing evidence leaves the affected portion unqualified; report it explicitly. No old observation or planning approval is a pass. Primary finding collector: C07 Full finding closure requires all [traceability contributions](../traceability.md), not merely this ticket's completion. Separate additions keep their own names and are not counted as new runtime findings.

## Source anchors

- [runtimeCoordinator.ts](../../../packages/core/pairing/runtimeCoordinator.ts)
- [session.test.ts](../../../tests/core/pairing/session.test.ts)
- [runtimeCoordinator.test.ts](../../../tests/core/pairing/runtimeCoordinator.test.ts)

## Handoff

Coordinator records the fresh baseline/claim, accepted decision assessment, isolated worktree, integration revision, checks and Standards/Spec review under [project workflow](../../../docs/agents/workflow.md). Preserve unrelated work. No code, native operation, commit, push or deployment has occurred for this planning ticket.
