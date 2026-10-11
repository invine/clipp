# Deliver local assets and Android shared controls

Type: implementation
Status: resolved
Assignee: ux-foundation-32
Priority band: 1
Blocked by: none
Dispatch: authorized UX implementation run `ux-implementation-20261010`; claim in [run record](../run.md)
Parent: [Clipp UX implementation](../spec.md)

## Outcome

Bundled essential assets and a compatible shared semantic control/style interface are available through explicit host entries. Existing Android consumers have verified readable, content-sized, named controls and native target/bounds behavior.

## Work and boundaries

This issue is the independently verifiable delivery scope refined from [the original assets/control package](17-unify-local-assets-and-shared-controls.md) under the [approved delivery rule](../spec.md#delivery-order-and-completion). Preserve the [normative package contract](../../ux-implementation-plan/workspace-delivery-proposal.md#local-assets-shared-controls-and-host-stylesheet-integration), [shared interfaces](../../ux-implementation-plan/shared-interface-proposal.md) and [specification invariants](../spec.md#preserved-contracts). The refinement changes allocation and dependencies only; it changes no accepted behavior or required qualification.

Deliver local SVG/branding/system typography, semantic fields/actions/focus/hints, named Copy/Pin/Send controls and stable Pin semantics. Keep Copy/Pin visible in rows, Delete in details, and words for destinations, setup, recovery and consequential actions. Essential icons must work offline. Use explicit stylesheet entries for Electron, Android, popup and full-page Chrome; keep shared component styles separate from host root geometry. Integrate every affected live consumer/bridge together and preserve action, session and runtime authority contracts.

Android qualification includes content-sized Start/export and task actions, 48dp target intent measured in native units, long names/IDs/endpoints/errors, peer/Alias fields, and scanner-overlay controls. Native dialogs retain platform styling. Scanner-overlay rendering or measurement does not qualify provider construction, acquisition, decoding or lifecycle; those remain with [diagnosis](14-diagnose-android-scanner-provider.md) and [scanner safety](15-repair-android-scanner-lifecycle.md).

Source compatibility and explicit asset entries across hosts are part of this deliverable. Remaining desktop control qualification, corrected actual cold popup sizing/scrolling, G13 independent actual-toolbar enlargement and G14 desktop OS text-only scaling remain required in [residual ticket 17](17-unify-local-assets-and-shared-controls.md). This issue supplies no desktop enlargement or complete desktop control pass. Later consumers requalify every presentation they change.

Full-value control checks here inspect current editable field values, Device Name/Peer ID, relay endpoints and errors. Long Clip rows must retain readable control layout and association with the actual Clip. Full Clip inspection before Copy and replacement preview integrity remain [ticket 21](21-deliver-compact-history-and-details.md); the current truncated preview is not a full-content pass. This allocation introduces no details route and preserves that later requirement.

## Dependencies and integration

No technical predecessor. The approved phase admission rule and at most two implementers still apply. Coordinator claim, isolated worktree and inspected integration baseline are required before new implementation. Existing integrated source can contribute when its exact source and evidence satisfy this scope; a new source change is not required solely to create a new ticket.

Consumers [themes](18-implement-persisted-themes.md), [navigation/reflow](19-deliver-accessible-navigation-and-reflow.md) and [native task input](13-integrate-native-task-input.md) may consume this deliverable only after it is genuinely resolved. Their other predecessors and all their own required gates remain unchanged.

## Verification and acceptance

Run the [common candidate gates](../spec.md#verification-and-evidence), affected suites/builds/native checks and independent Standards/Spec review on the integrated candidate. Record exact source/dirty state, production assets/APK, tools, native environment, commands and outcomes. Preserve owning-interface regressions and failed/unrun cases. Historical observations require an exact candidate/affected-scope mapping; lineage alone is not a pass.

Cold offline-render the affected asset entries and actual Android consumer. Verify named controls, visible focus, readable fields, full long values, content-sized words, no horizontal page overflow, associated reachable final controls and native 48dp targets. Use the accepted narrow/ordinary/short/landscape and default/intermediate/200% text/spacing profiles with applicable real IME and safe bounds. Measure scanner-overlay Scan/Cancel controls without claiming camera/provider operation. A controlled target fixture does not replace required actual Android rendering/measurement.

Only the complete output scoped here can resolve this issue. Missing required Android evidence keeps it unqualified. Routine tests, source review and a partial session-case run do not complete native control acceptance.

## Coverage and closure

This issue contributes local assets/current Android controls to G38 and Android named controls/native targets/full-value reachability to G39 in the [coverage ledger](../validation-coverage.md). Keep applicable native bounds/text cases and G17/G22–G24 hardware/platform/assistive dispositions. G29 actual export completion remains retained unless its path changes or completion is claimed; control sizing alone is not export delivery. Real sign-in, external owners, unavailable physical/assistive coverage and fresh clipboard/global-setting procedures remain unchanged.

[Ticket 17](17-unify-local-assets-and-shared-controls.md) retains the E01/C03/A04/A11/C15 primary collector assignments. This issue provides a scoped supporting contribution in [traceability](../traceability.md); its resolution does not close any finding. Required evidence cannot become Retained merely to finish.

## Source anchors

- [index.ts](../../../packages/ui/src/index.ts)
- [styles.css](../../../packages/ui/src/styles.css)
- [ClipboardApp.tsx](../../../packages/ui/src/ClipboardApp.tsx)
- [options.tsx](../../../apps/extension/src/options.tsx)
- [popup.html](../../../apps/extension/src/popup.html)
- [main.tsx](../../../apps/android/src/main.tsx)
- [qrCameraScanner.ts](../../../apps/android/src/qrCameraScanner.ts)
- [renderer.tsx](../../../apps/electron/src/renderer.tsx)

## Handoff

Coordinator records the decision assessment, claim, isolated worktree, integrated revision, checks, exact native/source mapping and Standards/Spec review under [project workflow](../../../docs/agents/workflow.md). Preserve evidence outside disposable worktrees and unrelated existing changes. This scope record creates no qualified result, claim, native authorization or finding closure.


## Dispatch assessment — 2026-10-11

The scope-preserving allocation and both documentation review axes passed at `da0e947f7ea8c898582284506d4cad9a2baebdfb`. Existing source from the original ticket 17 claim is integrated and reviewed; no extra source change is required solely for this deliverable. This claim completes the actual bounded Android control evidence identified in `ticket-32-da0e-required-evidence-review.md` in the ignored run directory. Current c015 OS2 session/Alias/scanner measurements are scoped contributions, not a cold/offline/full control-matrix pass.

Coordinator claim `ux-foundation-32`: client branch `codex/ux-32-local-assets-android`, isolated worktree `/Users/invine/src/js/clipp/.local/ux-implementation/worktrees/ticket-32`, based on this claim commit. Preserve accepted shared interfaces, ADR-0012, all live bridge compatibility and the original gates/deferrals. Prepare a bounded current-APK native control interval for cold assets, representative default/intermediate/200% text, narrow/short/landscape, text spacing, long words/values, Start/export label presentation, targets and applicable focus. Do not activate export, camera/provider, real account or claim native Back/assistive operation. No host/native operation is authorized until fresh coordinator assignment; source fixes discovered through qualification return to the coordinator before implementation.


## Answer

Resolved 2026-10-11 by the coordinator at clean integration `06c5704c1635ab91df486be6a722d4b5ef503c91`, containing reviewed source `ba7956cc1b8e8dc112de00a5f17a3d77bcdf19b1`. Existing original17 source delivers bundled essential SVG/system typography, explicit compatible host style entries, named semantic controls and content-sized Android actions. No new product source change was needed for this refined deliverable. Source check/integrated verify passed107 suites/796 tests/all three builds; source and allocation Standards/Spec reviews and final bounded required-evidence review passed.

The exact Android APK SHA-256 `39c9868d6a5d0039983e97a04e8bbd77de45f9c2e3ce379c24647b49f391a68f` passed all three current native profiles in `ticket-32-native-controls-20261011-b977da93`: ordinary OS1, narrow320 OS1.5 and short landscape OS2. Actual relay fonts12/18/24, Start/export14/21/28 and Alias/scanner16/24/32 demonstrate delivered text response. Twenty-four named targets per profile met48dp intent with native rounding (minimum47.994dp). Full field/name/PeerID/endpoint/error inspection, long Clip row/control association, scrolling, content-sized Start/export labels, supported spacing and trusted native Tab with visible focus are recorded. Source-derived direct-body scanner controls stayed provider/media0 and disposed; Scan enabling was a labelled focus-only construction, never scanner activation.

Cold qualification blocked external renderer resources and disabled/cleared cache before the actual reload; the synthetic blocked challenge, local nine-asset ZIP/loaded-source hashes, decoded logo, SVGs and system fonts are recorded. This is an essential-resource/rendering boundary, not global network isolation. Public background/device projections are labelled and restored; Start/export were never activated. Immutable Alias receipts incorrectly say local validation/no callback: the explicit final correction identifies actual target-unavailable feedback on a public projected device, with no length-validation, normalization, Membership or Alias-persistence pass.

Scoped c015 real IME/rotation and unchanged source12 geometry evidence supply their exact contributions. All public descriptors/listeners, scanner surfaces, CDP interceptions, forwards, native font/rotation/size/density, guest PID/serial and bounded power helper closed/restored before restoring the prior absent host-sharing setting. No host clipboard or real sign-in occurred. The failed first selector attempt and falsified focus-ancestor hypothesis remain preserved.

Evidence is retained outside disposable worktrees at `/Users/invine/src/js/clipp/.local/ux-implementation/run-20261010/`: `ticket-32-final-evidence-index.md`, `ticket-32-b977-native-control-summary.json`, `ticket-32-06c5-final-evidence-review.md`, frozen source/package/verification/review mappings, exact beforelaunch helper/ACTIVE manifest and closure receipts.

Residual17 desktop qualification/G14, the bounded user omission of its current toolbar check, later consumer requalification, themes, full Clip inspection/preview21, provider/camera15, native Back13, export delivery, real accounts and physical/hardware/assistive gaps remain separate. E01/C03/A04/A11/C15 remain open until all traceability contributions arrive.
