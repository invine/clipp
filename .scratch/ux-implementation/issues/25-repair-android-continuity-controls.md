# Repair Android continuity controls

Type: implementation
Status: open
Assignee: none
Priority band: 2
Blocked by: 08, 17
Dispatch: plan approved; awaiting an authorized execution run
Parent: [Clipp UX implementation](../spec.md)

## Outcome

Android shows one correct Pause/Resume action and separate Stop while preserving user preferences.

## Work and boundaries

Use explicit applied Auto Sync state, repair rejected/unknown control feedback and native notification actions. Stop disables background mode while preserving Auto Sync; re-entry retains disabled mode. Provide concise state/help, opt-in/start and diagnostics/export consumers; M3 later reuses this contract.

Best-effort continuity limits remain; denial is not a mandatory gate. Do not conflate Reconnect with Requests or queued/accepted explicit SEND/PROCESS_TEXT with delivery. Early usable-state fixes may accompany first-band host work.

The [approved package contract](../../ux-implementation-plan/native-host-delivery-proposal.md#android-continuity-controls) is normative detail for this ticket. Preserve the [shared interfaces](../../ux-implementation-plan/shared-interface-proposal.md) and [specification invariants](../spec.md#preserved-contracts). Update every affected live runtime bridge with its consumer; do not leave a successful helper behind a broken caller.

## Dependencies and integration

- [Compose actionable recovery issues](08-compose-actionable-recovery-issues.md) — consume its completed, scoped output.
- [Unify local assets and shared controls](17-unify-local-assets-and-shared-controls.md) — consume its completed, scoped output.

Only the output scoped here must be complete to resolve this ticket. Later consumers requalify their changed presentation; broad finding collection is separate and cannot block this ticket on its own descendants. Follow [phase admission](../spec.md#delivery-order-and-completion) rather than treating file numbers as an execution sequence.

## Verification and acceptance

Test running/stopped/disabled combinations, rapid/rejected actions, stale taps, notification denial and reopen. Qualify actual Pause/Resume/Stop actions. Preserve ingress queue/intentional repeat behavior and export cancellation/failure; real recipient and other-app chooser remain distinct evidence.

Run the [common candidate gates](../spec.md#verification-and-evidence) plus affected suites/builds/native checks. Record exact revision/dirty state, environment, commands and actual outcomes. Preserve regressions through the owning interface; use rendered/native evidence for the behavior that requires it, not implementation-mirroring helper tests.

## Coverage and closure

Candidate continuity actions. OEM/Doze, recipient export and chooser journeys retain qualifications unless this work changes or relies on the specific export/chooser/native-lifecycle implementation boundary or claims its qualification, in which case affected-path evidence is required. Ordinary presentation changes do not reopen accepted hardware or participation deferrals.

The [coverage ledger](../validation-coverage.md) specifies Candidate, External and Retained dispositions and fresh native intervals. Required missing evidence leaves the affected portion unqualified; report it explicitly. No old observation or planning approval is a pass. Primary finding collector: A06 Full finding closure requires all [traceability contributions](../traceability.md), not merely this ticket's completion. Separate additions keep their own names and are not counted as new runtime findings.

## Source anchors

- [backgroundContinuity.ts](../../../apps/android/src/backgroundContinuity.ts)
- [BackgroundContinuityService.java](../../../apps/android/android/app/src/main/java/com/clipp/app/BackgroundContinuityService.java)
- [ExplicitTextIngressActivity.java](../../../apps/android/android/app/src/main/java/com/clipp/app/ExplicitTextIngressActivity.java)
- [backgroundContinuity.test.ts](../../../tests/android/backgroundContinuity.test.ts)
- [clipContinuity.test.ts](../../../tests/android/clipContinuity.test.ts)
- [BackgroundContinuityLifecycleTest.java](../../../apps/android/android/app/src/androidTest/java/com/clipp/app/BackgroundContinuityLifecycleTest.java)

## Handoff

Coordinator records the fresh baseline/claim, accepted decision assessment, isolated worktree, integration revision, checks and Standards/Spec review under [project workflow](../../../docs/agents/workflow.md). Preserve unrelated work. No code, native operation, commit, push or deployment has occurred for this planning ticket.
