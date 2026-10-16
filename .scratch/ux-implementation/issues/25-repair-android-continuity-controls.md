# Repair Android continuity controls

Type: implementation
Status: claimed
Assignee: ux-continuity-25
Priority band: 2
Blocked by: 08, 32
Dispatch: authorized UX implementation run `ux-implementation-20261010`; claim in [run record](../run.md)
Parent: [Clipp UX implementation](../spec.md)

## Outcome

Android shows one correct Pause/Resume action and separate Stop while preserving user preferences.

## Work and boundaries

Use explicit applied Auto Sync state, repair rejected/unknown control feedback and native notification actions. Stop disables background mode while preserving Auto Sync; re-entry retains disabled mode. Provide concise state/help, opt-in/start and diagnostics/export consumers; M3 later reuses this contract.

Best-effort continuity limits remain; denial is not a mandatory gate. Do not conflate Reconnect with Requests or queued/accepted explicit SEND/PROCESS_TEXT with delivery. Early usable-state fixes may accompany first-band host work.

The [approved package contract](../../ux-implementation-plan/native-host-delivery-proposal.md#android-continuity-controls) is normative detail for this ticket. Preserve the [shared interfaces](../../ux-implementation-plan/shared-interface-proposal.md) and [specification invariants](../spec.md#preserved-contracts). Update every affected live runtime bridge with its consumer; do not leave a successful helper behind a broken caller.

## Dependencies and integration

- [Compose actionable recovery issues](08-compose-actionable-recovery-issues.md) — consume its completed, scoped output.
- [Deliver local assets and Android shared controls](32-deliver-local-assets-and-android-shared-controls.md) — consume its completed shared interface and qualified Android control output.

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

## Dispatch assessment — 2026-10-13

Coordinator applies the approved scope-preserving predecessor allocation already used by20/18/19/13:25 consumes resolved32's shared interface and qualified Android controls. Residual17 retains all desktop G13/G14 and collection;25 retains all its own candidate/native action, stale/rejected/unknown state, notification denial/reopen, queue/ingress and export-boundary requirements. No gate is waived or finding closed.

Predecessors08/32 are resolved. Correct applied Auto Sync, one Pause/Resume and separate Stop preserve user preferences, best-effort continuity, durable ingress/intentional-repeat semantics and ADR-0012. Source preparation is `ticket-25-current-prep.md` in the local handoff mapping. Coordinator claim `ux-continuity-25`, client isolated `codex/ux-25-continuity-controls`, begins from this claim commit. Owning-interface TDD, current-tip incorporation, both reviews, mandatory merger and applicable verification remain required. Native/SDK/OS/clipboard/account/push operations stay root-owned or deferred.

Priority band2 remains. Approved early usable native-state/feedback fixes proceed alongside ticket09's correctness qualification; unresolved urgent work is not displaced. User explicitly requested two-ticket progress. Root serializes native validation; at most two ticket implementers operate.

## Native regression contribution — 2026-10-16

The current isolated Android acceptance APK passed all nine existing `BackgroundContinuityLifecycleTest` methods before the reset matrix. Actual service, notification PendingIntent, direct boot-receiver and durable preference/diagnostic behavior were exercised; each method ran in a force-stopped separate process. Raw candidate-bound evidence is in ignored run `ticket29-native-runtime-7cea228b54`, manifest and audit. Direct receiver invocation is not a device reboot, and actual PendingIntent execution is not a physical notification tap. This contributes regression evidence only: the complete current UI/client controls, reopen, ingress and export-boundary matrix and this ticket's own required gates remain open. No ticket/finding closes by implication.
