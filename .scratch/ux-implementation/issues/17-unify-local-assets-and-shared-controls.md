# Unify local assets and shared controls

Type: implementation
Status: open
Assignee: none
Priority band: 1
Blocked by: none
Dispatch: plan approved; awaiting an authorized execution run
Parent: [Clipp UX implementation](../spec.md)

## Outcome

Every host has coherent readable controls and local offline icons.

## Work and boundaries

Introduce semantic styles and shared named SVG controls with explicit host stylesheet/sizing entry. Separate shared components from global root geometry; remove remote essential icon/font dependence and popup 800px minimum assumption. Include content-sized Android text actions.

Copy/Pin remain in rows, Delete in details; consequential actions retain words. Do not make actions hover-only or shrink Android labels into icon boxes. Native dialogs retain platform styling.

The [approved package contract](../../ux-implementation-plan/workspace-delivery-proposal.md#local-assets-shared-controls-and-host-stylesheet-integration) is normative detail for this ticket. Preserve the [shared interfaces](../../ux-implementation-plan/shared-interface-proposal.md) and [specification invariants](../spec.md#preserved-contracts). Update every affected live runtime bridge with its consumer; do not leave a successful helper behind a broken caller.

## Dependencies and integration

No technical predecessor. The approved phase admission rule still applies.

Only the output scoped here must be complete to resolve this ticket. Later consumers requalify their changed presentation; broad finding collection is separate and cannot block this ticket on its own descendants. Follow [phase admission](../spec.md#delivery-order-and-completion) rather than treating file numbers as an execution sequence.

## Verification and acceptance

Cold offline-render each surface; verify fields/focus/long unbroken names, short popup scroll and reachable last control. Measure 40px pointer and 48dp Android target intent in correct units. Collect final C15 cross-surface evidence later without making it a predecessor of its own consumers.

Run the [common candidate gates](../spec.md#verification-and-evidence) plus affected suites/builds/native checks. Record exact revision/dirty state, environment, commands and actual outcomes. Preserve regressions through the owning interface; use rendered/native evidence for the behavior that requires it, not implementation-mirroring helper tests.

## Coverage and closure

Candidate styles/offline/targets and native rendering. Hardware/assistive variants follow the coverage ledger.

The [coverage ledger](../validation-coverage.md) specifies Candidate, External and Retained dispositions and fresh native intervals. Required missing evidence leaves the affected portion unqualified; report it explicitly. No old observation or planning approval is a pass. Primary finding collector: E01, C03, A04, A11, C15 Full finding closure requires all [traceability contributions](../traceability.md), not merely this ticket's completion. Separate additions keep their own names and are not counted as new runtime findings.

## Source anchors

- [index.ts](../../../packages/ui/src/index.ts)
- [styles.css](../../../packages/ui/src/styles.css)
- [options.tsx](../../../apps/extension/src/options.tsx)
- [popup.html](../../../apps/extension/src/popup.html)
- [main.tsx](../../../apps/android/src/main.tsx)
- [renderer.tsx](../../../apps/electron/src/renderer.tsx)

## Handoff

Coordinator records the fresh baseline/claim, accepted decision assessment, isolated worktree, integration revision, checks and Standards/Spec review under [project workflow](../../../docs/agents/workflow.md). Preserve unrelated work. No code, native operation, commit, push or deployment has occurred for this planning ticket.
