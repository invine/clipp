# Integrate native task input and focus

Type: implementation
Status: open
Assignee: none
Priority band: 1
Blocked by: 07, 12, 32, 19
Dispatch: plan approved; awaiting an authorized execution run
Parent: [Clipp UX implementation](../spec.md)

## Outcome

Native Back, activation and keyboard focus reach the shared task owner exactly once.

## Work and boundaries

Wire Android IME-first Back, then scanner/overlay, task and root; Electron activation/readiness and real keyboard; Chrome normal popup dismissal and shared full-page task focus. Qualify adapter output on existing shared tasks now; each later migrated consumer requalifies its own host entry.

One event cannot dismiss twice. Back/Close retains applicable drafts; scanner cancellation does not cancel submitted Pairing. Keep resumed-and-focused Android clipboard eligibility.

The [approved package contract](../../ux-implementation-plan/native-host-delivery-proposal.md#native-task-input-and-focus) is normative detail for this ticket. Preserve the [shared interfaces](../../ux-implementation-plan/shared-interface-proposal.md) and [specification invariants](../spec.md#preserved-contracts). Update every affected live runtime bridge with its consumer; do not leave a successful helper behind a broken caller.

## Dependencies and integration

- [Preserve session tasks and editor recovery](07-preserve-session-tasks-and-editor-recovery.md) — consume its completed, scoped output.
- [Integrate Android content bounds and IME](12-integrate-android-content-bounds.md) — consume its completed, scoped output.
- [Deliver local assets and Android shared controls](32-deliver-local-assets-and-android-shared-controls.md) — consume its completed compatible asset/control interface and Android control contribution.
- [Deliver accessible navigation and task reflow](19-deliver-accessible-navigation-and-reflow.md) — consume its completed, scoped output.

The refined prerequisite supplies compatible source and its qualified Android scope. [Residual desktop controls](17-unify-local-assets-and-shared-controls.md) keep their missing G13/G14 qualification. This consumer still requires every affected desktop/native presentation gate in its own accepted scope; source compatibility is not desktop qualification.

Only the output scoped here must be complete to resolve this ticket. Later consumers requalify their changed presentation; broad finding collection is separate and cannot block this ticket on its own descendants. Follow [phase admission](../spec.md#delivery-order-and-completion) rather than treating file numbers as an execution sequence.

## Verification and acceptance

Test repeated/nested Back, disappearing invoker, failed Save and native Tab/Shift-Tab/Enter/Escape. Qualify displayed QR Back now; scanner Back needs the scanner package contribution. Actual toolbar popup input must be uninspected when testing dismissal.

Run the [common candidate gates](../spec.md#verification-and-evidence) plus affected suites/builds/native checks. Record exact revision/dirty state, environment, commands and actual outcomes. Preserve regressions through the owning interface; use rendered/native evidence for the behavior that requires it, not implementation-mirroring helper tests.

## Coverage and closure

Candidate native input/QR Back; VoiceOver, TalkBack and hardware-keyboard/foldable gaps remain explicit. Scanner and later full-page evidence is collected without blocking this adapter output on those consumers.

The [coverage ledger](../validation-coverage.md) specifies Candidate, External and Retained dispositions and fresh native intervals. Required missing evidence leaves the affected portion unqualified; report it explicitly. No old observation or planning approval is a pass. Primary finding collector: A03 Full finding closure requires all [traceability contributions](../traceability.md), not merely this ticket's completion. Separate additions keep their own names and are not counted as new runtime findings.

## Source anchors

- [main.ts](../../../apps/electron/src/main.ts)
- [preload.ts](../../../apps/electron/src/preload.ts)
- [renderer.tsx](../../../apps/electron/src/renderer.tsx)
- [main.tsx](../../../apps/android/src/main.tsx)
- [ClipboardApp.tsx](../../../packages/ui/src/ClipboardApp.tsx)

## Handoff

Coordinator records the fresh baseline/claim, accepted decision assessment, isolated worktree, integration revision, checks and Standards/Spec review under [project workflow](../../../docs/agents/workflow.md). Preserve unrelated work. No code, native operation, commit, push or deployment has occurred for this planning ticket.
