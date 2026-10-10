# Integrate Android content bounds and IME

Type: implementation
Status: open
Assignee: none
Priority band: 1
Blocked by: none
Dispatch: plan approved; awaiting an authorized execution run
Parent: [Clipp UX implementation](../spec.md)

## Outcome

Android content and required actions remain inside system and IME bounds.

## Work and boundaries

Implement one host geometry interface with explicit units/inset ownership and lifecycle; consume it in the existing task/shell and scanner, then later navigation reuses it. Do not double-apply native resize/CSS inset/keyboard adjustment. Preserve the live session through rotation.

Zero CSS safe inset does not prove absent system bars; dp, physical pixels and CSS px are distinct. No promise of draft survival after destroyed Activity/WebView.

The [approved package contract](../../ux-implementation-plan/native-host-delivery-proposal.md#android-content-bounds-and-ime) is normative detail for this ticket. Preserve the [shared interfaces](../../ux-implementation-plan/shared-interface-proposal.md) and [specification invariants](../spec.md#preserved-contracts). Update every affected live runtime bridge with its consumer; do not leave a successful helper behind a broken caller.

## Dependencies and integration

No technical predecessor. The approved phase admission rule still applies.

Only the output scoped here must be complete to resolve this ticket. Later consumers requalify their changed presentation; broad finding collection is separate and cannot block this ticket on its own descendants. Follow [phase admission](../spec.md#delivery-order-and-completion) rather than treating file numbers as an execution sequence.

## Verification and acceptance

Test nonzero inset/cutout/IME updates/disposal; measure API35 and older supported candidate in portrait/landscape, gesture/three-button, editors/Paste/displayed QR. Exercise the scanner geometry consumer with controlled overlay/bounds inputs without entering an unsafe provider. Actual camera/provider/scanner-Back integration is qualified by the later scanner repair after diagnosis; it cannot be a prerequisite of this geometry output. Require 200% relay/Pairing IME and available split-screen/cutout checks with actual field/last-action reachability.

Run the [common candidate gates](../spec.md#verification-and-evidence) plus affected suites/builds/native checks. Record exact revision/dirty state, environment, commands and actual outcomes. Preserve regressions through the owning interface; use rendered/native evidence for the behavior that requires it, not implementation-mirroring helper tests.

## Coverage and closure

Candidate Android geometry/IME. Stable API36, physical foldables/cutout hardware remain explicitly qualified by environment; no old ANR or freeform-as-split-screen substitution.

The [coverage ledger](../validation-coverage.md) specifies Candidate, External and Retained dispositions and fresh native intervals. Required missing evidence leaves the affected portion unqualified; report it explicitly. No old observation or planning approval is a pass. Primary finding collector: A01, A02 Full finding closure requires all [traceability contributions](../traceability.md), not merely this ticket's completion. Separate additions keep their own names and are not counted as new runtime findings.

## Source anchors

- [MainActivity.java](../../../apps/android/android/app/src/main/java/com/clipp/app/MainActivity.java)
- [main.tsx](../../../apps/android/src/main.tsx)
- [qrCameraScanner.ts](../../../apps/android/src/qrCameraScanner.ts)

## Handoff

Coordinator records the fresh baseline/claim, accepted decision assessment, isolated worktree, integration revision, checks and Standards/Spec review under [project workflow](../../../docs/agents/workflow.md). Preserve unrelated work. No code, native operation, commit, push or deployment has occurred for this planning ticket.
