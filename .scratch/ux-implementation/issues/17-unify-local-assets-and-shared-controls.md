# Qualify desktop shared controls and collect cross-surface styling

Type: implementation
Status: claimed
Assignee: ux-controls-17
Priority band: 1
Blocked by: 32
Dispatch: authorized UX implementation run `ux-implementation-20261010`; claim and branch details in [run record](../run.md)
Parent: [Clipp UX implementation](../spec.md)

## Outcome

Desktop controls complete their required host qualification, and the original shared-assets package collects its cross-surface finding contributions. The compatible local-asset interface and Android control output are delivered by [Deliver local assets and Android shared controls](32-deliver-local-assets-and-android-shared-controls.md).

## Scope allocation — 2026-10-11

The coordinator refines the original package under the [approved cross-runtime blocker rule](../spec.md#delivery-order-and-completion). [Ticket 32](32-deliver-local-assets-and-android-shared-controls.md) owns the compatible bundled asset/shared-control interface and the existing Android control qualification. This residual keeps all remaining desktop work and required gates. Its existing claim and owner are retained; neither issue is resolved by recording this split.

Ticket 17 retains cold offline Electron/options/actual-toolbar controls, named actions and visible focus, long fields and full values, 40px pointer intent, default/intermediate/200% text, short-popup scrolling and final-control reachability. The corrected intrinsic popup sizing needs actual cold-host acceptance. G13 requires independent enlargement in the actual toolbar popup; G14 requires desktop OS text-only scaling. Both remain required candidate qualification, with the same native/coordinated procedures. Source compatibility and a passing rendered fixture do not qualify these desktop claims.

The original package requirements below apply to the combined 32/17 allocation. Android controls and their native measurements must complete in 32; remaining desktop requirements must complete here. E01/C03/A04/A11/C15 retain this issue as their collector, with 32 supplying its bounded contribution. Later consumer evidence remains separate from this residual's own completion.

## Work and boundaries

Introduce semantic styles and shared named SVG controls with explicit host stylesheet/sizing entry. Separate shared components from global root geometry; remove remote essential icon/font dependence and popup 800px minimum assumption. Include content-sized Android text actions.

Copy/Pin remain in rows, Delete in details; consequential actions retain words. Do not make actions hover-only or shrink Android labels into icon boxes. Native dialogs retain platform styling.

The [approved package contract](../../ux-implementation-plan/workspace-delivery-proposal.md#local-assets-shared-controls-and-host-stylesheet-integration) is normative detail for this ticket. Preserve the [shared interfaces](../../ux-implementation-plan/shared-interface-proposal.md) and [specification invariants](../spec.md#preserved-contracts). Update every affected live runtime bridge with its consumer; do not leave a successful helper behind a broken caller.

## Dependencies and integration

- [Deliver local assets and Android shared controls](32-deliver-local-assets-and-android-shared-controls.md) — consume its completed compatible interface and Android control output.

The approved phase admission rule still applies. All required residual desktop qualification remains with this issue.

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

## Dispatch assessment — 2026-10-11

The first six scoped repairs are resolved. This independent band 1 control/access output has no hard predecessor. Ticket 07 source and review fixes are complete; its remaining acceptance is coordinated separately. The two source implementers are tickets 12 and 17. The work preserves the accepted actions, one live UI session, runtime authority, truthful partial/unconfirmed feedback, local SVG control treatment and ADR-0012. It changes no accepted product decision and does not perform later theme/navigation/compact-screen cutovers.

Coordinator-owned claim: `ux-controls-17`, client branch `codex/ux-17-local-controls`, isolated worktree `/Users/invine/src/js/clipp/.local/ux-implementation/worktrees/ticket-17`, based on this claim commit. Preparation: `/private/tmp/clipp-ux-implementation-20261010/ticket-17-prep.md`. Public test seams are the approved rendered named controls and existing action consumers, explicit host stylesheet entry, native host geometry/target measurement and cold offline surfaces. These are the accepted package/coverage seams; do not invent private helper assertions. Ticket 12's single measured geometry interface is currently unintegrated at `2acbb22db879c1224b26fac491ec63854089046c`; consume it after coordinator integration rather than creating a second geometry owner.

Native ownership remains serialized with ticket 12, then ticket 07 remaining acceptance. No host clipboard, global display or permission interval is open. Actual toolbar focus, independent toolbar enlargement and desktop OS text-only scaling need their recorded fresh coordinated procedures. Required candidate gates remain required; physical/assistive/external limitations and real sign-in deferral remain unchanged. All evidence must be preserved outside the disposable worktree.


## Current toolbar participation decision — 2026-10-11

The user requested skipping the current default/32px/restored corrected-toolbar check while away from the PC. The [accepted bounded omission](../decisions/20261011-current-toolbar-check-omission.md) permits continued implementation without another marker request. The latest submitted Ready failed the initial marker equality guard before any host launch. Record this current check as user-authorized omission/not run, not a measured pass. G14 and later consumers' own changed-presentation gates remain required; no product invariant or other qualification is waived.
