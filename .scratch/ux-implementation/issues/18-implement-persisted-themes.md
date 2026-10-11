# Implement persisted System, Light and Dark

Type: implementation
Status: open
Assignee: none
Priority band: 1
Blocked by: 01, 32
Dispatch: plan approved; awaiting an authorized execution run
Parent: [Clipp UX implementation](../spec.md)

## Outcome

System, Light and Dark work consistently, update live and persist per installation.

## Work and boundaries

Add validated theme preference through existing authority, every bridge and host background. System is unset/default and follows appearance; explicit modes remain explicit. Include task portals and initial root rendering without another browser-local preference.

Theme is installation-local, not device synchronization. Failed writes remain unsaved; System appearance changes do not rewrite the preference.

The [approved package contract](../../ux-implementation-plan/workspace-delivery-proposal.md#persisted-system-light-and-dark) is normative detail for this ticket. Preserve the [shared interfaces](../../ux-implementation-plan/shared-interface-proposal.md) and [specification invariants](../spec.md#preserved-contracts). Update every affected live runtime bridge with its consumer; do not leave a successful helper behind a broken caller.

## Dependencies and integration

- [Repair Chrome preference integrity](01-repair-chrome-preference-integrity.md) — consume its completed, scoped output.
- [Deliver local assets and Android shared controls](32-deliver-local-assets-and-android-shared-controls.md) — consume its completed compatible asset/control interface and Android control contribution.

The refined prerequisite supplies compatible source and its qualified Android scope. [Residual desktop controls](17-unify-local-assets-and-shared-controls.md) keep their missing G13/G14 qualification. This consumer still requires every affected desktop/native presentation gate in its own accepted scope; source compatibility is not desktop qualification.

Only the output scoped here must be complete to resolve this ticket. Later consumers requalify their changed presentation; broad finding collection is separate and cannot block this ticket on its own descendants. Follow [phase admission](../spec.md#delivery-order-and-completion) rather than treating file numbers as an execution sequence.

## Verification and acceptance

Test modes, live System change, invalid persisted values, overlapping views, failure/unconfirmed writes and reopen. Inspect real computed/visible field/text/action/focus contrast and offline launch, not class names alone.

Run the [common candidate gates](../spec.md#verification-and-evidence) plus affected suites/builds/native checks. Record exact revision/dirty state, environment, commands and actual outcomes. Preserve regressions through the owning interface; use rendered/native evidence for the behavior that requires it, not implementation-mirroring helper tests.

## Coverage and closure

Candidate theme/native appearance; relevant OS text/display and hardware gaps remain separately recorded.

The [coverage ledger](../validation-coverage.md) specifies Candidate, External and Retained dispositions and fresh native intervals. Required missing evidence leaves the affected portion unqualified; report it explicitly. No old observation or planning approval is a pass. Primary finding collector: E13, C05 Full finding closure requires all [traceability contributions](../traceability.md), not merely this ticket's completion. Separate additions keep their own names and are not counted as new runtime findings.

## Source anchors

- [styles.css](../../../packages/ui/src/styles.css)
- [ClipboardApp.tsx](../../../packages/ui/src/ClipboardApp.tsx)
- [main.ts](../../../apps/electron/src/main.ts)
- [main.tsx](../../../apps/android/src/main.tsx)
- [popup.tsx](../../../apps/extension/src/popup.tsx)
- [options.tsx](../../../apps/extension/src/options.tsx)

## Handoff

Coordinator records the fresh baseline/claim, accepted decision assessment, isolated worktree, integration revision, checks and Standards/Spec review under [project workflow](../../../docs/agents/workflow.md). Preserve unrelated work. No code, native operation, commit, push or deployment has occurred for this planning ticket.
