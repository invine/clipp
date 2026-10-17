# Repair Android continuity controls

Type: implementation
Status: resolved
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

## Answer — 2026-10-17

Resolved by the coordinator on clean integration `77b84d13a6c34cad938083e7352cc2a7e25f0c1d`, containing continuity production `4d382ee993ef866077f3811d732b23df732fe753`, shared compatibility `84086e35a7546e808b49398fd9157224d90d888b` and maintained native selector `88674ded87ecd1e6d3b1138f86bcb762c9c6a2d4`. One applied Pause/Resume action and separate Stop preserve Auto Sync. Native connection publications now share the control queue, preventing a late retired-service update from overwriting confirmed Stop with unknown state. The ordinary Clip supplier uses the existing secure UUID implementation on older WebViews.

Owning-interface RED/GREEN, author checks and actual unchanged hooks pass. Fresh integrated840 verification passes152 suites/1163tests, all typechecks/all three production builds, lint0errors/898warnings. Both production and selector Standards/Spec reviews have zero findings. Test-only77 adds independent34 qualification and changes no25 production/control path.

Actual API34 production MainActivity/client/native-service journeys pass Settings opt-in/cancel/Pause/Resume/Stop with Auto Sync both values, physical SystemUI Pause/Resume/Stop and disabled reopen, blocked notifications with genuine Settings return, and separately opted-in real service interruption followed by rendered Start. All four current-source journeys pass with actual native fontScale2.0; the default physical notification journey also passes on840. Earlier default Settings/denial/Start passes keep their exact4d binding. Nine prior actual native service/lifecycle tests map only byte-identical native seams; PendingIntent/receiver invocation is not physical tapping/reboot. Source tests retain rapid/stale/rejected/unknown-state and ingress-event behavior. Every owned guest is closed and host emulator clipboard-sharing preference exactly restored.

Immutable evidence is outside disposable worktrees under `/Users/invine/src/js/clipp/.local/ux-implementation/run-20261010/`: `native25-final-coverage-audit-20261017.md`, `native25-840-font2-batch-manifests.json`, its four artifact receipts, `native25-notification-fixed-manifest.json`, `native25-final-native-findings-20261017.json`, `native25-final-integrated-verification-20261017.json`, `native34-api31-state-copy-integrated-verification-20261017.json`, unique source/selector handoffs, merger receipts and both review axes. Original Stop/input/SystemUI failures remain retained. The generic runner scope sentence does not expand the actual named methods; compiled snapshots/APKs retain their exact custody and provenance limits.

Actual notification regrant/channel-only recovery remains16/G03 collection. OEM/DozeG21, real diagnostics recipientG29, other-app chooserG30 and physical/assistive limits retain their accepted unchanged-boundary dispositions. No export/chooser boundary changed.17/24 and A06 finding collection remain open.34 separately retains the newly observed focus-loss clipboard/baseline failure, API31 QR failure, remaining native input/layout and Electron routing gates; this resolution does not qualify those paths or the whole runtime.
