# Qualify desktop shared controls and collect cross-surface styling

Type: implementation
Status: claimed
Assignee: ux-issues-08
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

## Earlier toolbar participation decision — 2026-10-11

The user requested skipping the current default/32px/restored corrected-toolbar check while away from the PC. The [accepted bounded omission](../decisions/20261011-current-toolbar-check-omission.md) permits continued implementation without another marker request. That submitted Ready failed the initial marker equality guard before any host launch. That earlier check is recorded as user-authorized omission/not run, not a measured pass. G14 and later consumers' own changed-presentation gates remain required; no product invariant or other qualification is waived.

## Fresh actual popup and bounded review repair — 2026-10-11

The user subsequently renewed the exact popup marker authorization. The genuine interval `ticket-17-refreshed-popup-20261011-5b9a27c0` consumed clean integration `21b4c4f1` / frozen `52624599` production assets. Actual default/32px/restored popup phases measured 480×600 CSSpx at DPR 2; matched text increased 18→36px and 12→32px, then returned to baseline. Real synthetic marker capture, isolated font restoration, profile/helper removal and unchanged final marker are supported. The interval is CLOSED and normal copying was released. Earlier omission/failed attempts remain historical evidence.

Independent screenshot/evidence review found a P2 missed by the driver: at 32px the nested History viewport collapses to roughly 16 CSSpx, clipping the marker preview and part of Copy. Nonzero button bounds/focus do not establish full visibility or action association. Preserve the measured sizing/enlargement/restoration/capture/closure contributions; required G13 control reachability remains unqualified. G14 remains independently unqualified, and no finding is closed by this partial observation.

Coordinator delegates this bounded source repair to existing implementer `ux-issues-08` in the existing `codex/ux-17-local-controls` worktree; ticket 08 source stays intact. Incorporate current reviewed integration before handoff. Use owning rendered regression, production layout repair and ancestor clipping/hit/control-association checks, then both source review axes, mandatory integration and fresh actual affected-consumer qualification. At most two implementers remain active. Source/rendered checks do not replace the actual host gate.

Evidence remains outside disposable worktrees in the ignored run directory: `ticket-17-refreshed-popup-20261011-5b9a27c0/summary.json` and its hashed native phase JSON/PNG/source/CLOSED files, `ticket-17-5b9a-final-popup-evidence-review.md`, and `ticket-17-5b9a-clipping-repair-dispatch.json`. No host clipboard writes, macOS setting changes or real sign-in occurred in this interval.

## Renewed bounded popup contribution — 2026-10-12

Actual frozen `8673a9bd91f9469d73c4c34474d0a0c21bfe807f` interval `ticket-08-toolbar-faults-20261012-6a047bc9` passes default/24px/32px/restored known Clip/Copy association and combined recovery controls. Independent review inspected enlarged History/Close screenshots, all settled full bounding/ancestor/preview measurements and nine painted hit probes, plus negative corner-overlay rejection and restored ownership. The entire known fixture preview and its Copy remain visible together after scrolling. Root font/profile/browser/power/assignment closure is confirmed. Evidence: `ticket-08-17-v10-native-evidence-review.md/.json` and versioned v10 artifacts in the ignored run directory.

This closes the bounded enlarged History clipping contribution for that exact old candidate and protected process-local clipboard boundary. It does not qualify every residual desktop control, current theme consumers, OS text-only G14, real focus capture, native clipboard permissions or later full Clip details. Earlier real-marker and partial/failed observations remain preserved. Ticket 17 and G14 remain incomplete.

## G14 completion by user acceptance — 2026-10-21

The user directs “Mark these gates completed” for desktop OS text-only scaling G14 on17–19. [Accepted decision](../decisions/20261021-g14-17-19-user-acceptance.md) completes this ticket’s G14 gate administratively; no new native run or enlargement measurement is asserted. Earlier failed/unavailable/unchanged-text observations remain intact. Every other candidate gate and finding contribution remains required; this decision alone does not resolve the ticket.
