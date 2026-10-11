# Deliver local assets and Android shared controls

Type: implementation
Status: open
Assignee: none
Priority band: 1
Blocked by: none
Dispatch: scope refinement recorded; awaiting coordinator claim and qualified output
Parent: [Clipp UX implementation](../spec.md)

## Outcome

Bundled essential assets and a compatible shared semantic control/style interface are available through explicit host entries. Existing Android consumers have verified readable, content-sized, named controls and native target/bounds behavior.

## Work and boundaries

This issue is the independently verifiable delivery scope refined from [the original assets/control package](17-unify-local-assets-and-shared-controls.md) under the [approved delivery rule](../spec.md#delivery-order-and-completion). Preserve the [normative package contract](../../ux-implementation-plan/workspace-delivery-proposal.md#local-assets-shared-controls-and-host-stylesheet-integration), [shared interfaces](../../ux-implementation-plan/shared-interface-proposal.md) and [specification invariants](../spec.md#preserved-contracts). The refinement changes allocation and dependencies only; it changes no accepted behavior or required qualification.

Deliver local SVG/branding/system typography, semantic fields/actions/focus/hints, named Copy/Pin/Send controls and stable Pin semantics. Keep Copy/Pin visible in rows, Delete in details, and words for destinations, setup, recovery and consequential actions. Essential icons must work offline. Use explicit stylesheet entries for Electron, Android, popup and full-page Chrome; keep shared component styles separate from host root geometry. Integrate every affected live consumer/bridge together and preserve action, session and runtime authority contracts.

Android qualification includes content-sized Start/export and task actions, 48dp target intent measured in native units, long names/IDs/endpoints/errors, peer/Alias fields, and scanner-overlay controls. Native dialogs retain platform styling. Scanner-overlay rendering or measurement does not qualify provider construction, acquisition, decoding or lifecycle; those remain with [diagnosis](14-diagnose-android-scanner-provider.md) and [scanner safety](15-repair-android-scanner-lifecycle.md).

Source compatibility and explicit asset entries across hosts are part of this deliverable. Remaining desktop control qualification, corrected actual cold popup sizing/scrolling, G13 independent actual-toolbar enlargement and G14 desktop OS text-only scaling remain required in [residual ticket 17](17-unify-local-assets-and-shared-controls.md). This issue supplies no desktop enlargement or complete desktop control pass. Later consumers requalify every presentation they change.

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
