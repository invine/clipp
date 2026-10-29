# Integrate Android content bounds and IME

Type: implementation
**Status:** resolved
Assignee: ux-bounds-12
Priority band: 1
**Blocked by:** None.
Dispatch: authorized UX implementation run `ux-implementation-20261010`; claim and branch details in [run record](../run.md)
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

Coordinator records the fresh baseline/claim, accepted decision assessment, isolated worktree, integration revision, checks and Standards/Spec review under [project workflow](../../../docs/agents/workflow.md). Preserve unrelated work.

## Dispatch assessment — 2026-10-11

The first six scoped repairs are resolved. This independent native correctness output has no hard predecessor and occupies the second implementer slot beside ticket 07 review fixes. It preserves the accepted single host geometry owner, explicit physical/dp/CSS units, exactly-once inset reservation, live-document session and scanner-provider separation contracts; no product behavior decision changes. Relevant shared runtime/domain invariants and ADR-0012 remain unchanged.

Coordinator-owned claim: `ux-bounds-12`, client branch `codex/ux-12-android-bounds`, isolated worktree `/Users/invine/src/js/clipp/.local/ux-implementation/worktrees/ticket-12`, from this claim commit. Preparation: `/private/tmp/clipp-ux-implementation-20261010/ticket-12-prep.md`. Source baseline includes integrated ticket 07 `f6301481a6ac95413bac3b9204e565e4d4981442`; its unrelated relay-editor Spec fixes remain owned by ticket 07 and must be incorporated before final handoff. Ticket 12 cannot resolve ticket 07 or waive its native/toolbar gates.

The native slot is available after ticket 07's interval closed/restored. Coordinate exclusive owned read-only/no-snapshot guests, verified host clipboard-sharing isolation and exact restoration, guest-only markers and measured input with the coordinator. Modern owned API35 guest/provider and older API31/WebView91 limitations are recorded in ticket 06 receipts. Required API35/older, actual 200% IME/split-screen/cutout candidate gates stay required; all accepted external/retained limits remain. Scanner geometry uses controlled overlays without constructing the unsafe provider. Host clipboard/display intervals are closed; sign-in stays deferred.

## Answer — 2026-10-11

Resolved on client integration `35cb5cafef035a872aa0ef2b6bf8dfa44a05581c`, tree `47c2370e814d572ce51da401971d964a698a17e6`. The isolated source branch incorporated the inspected current integration before handoff. Source commits `1d0caf99ae59a7d7b5d57e093e18e94a4d97386b`, `1a696e2a0e611e0fd25eecb489a1ca51f0dbc976` and `4381cdf588d0fc4be225b085ef6612caaebc705a` provide one native physical geometry source, renderer reservation of the safe-area/WebView intersection, ordered/disposable binding and corrected existing shell/task/QR/scanner consumers. Physical pixels, CSS pixels and dp remain distinct; native padding does not double-reserve insets. Repeated unchanged measurements no longer undo a user's scroll, and actual usable content width drives drawer sizing.

Fresh integrated verification passed lint, all runtime types, 107 suites/794 tests and all three builds. Owning rendered geometry regressions passed. The final isolated acceptance APK SHA256 is `8a4fc512aa9602f7746d1970ba24e8fbd490c61e4fab2f9a49dbd438932a3c20`; packaged web assets match this verified candidate. Actual API35 and API31/WebView124 profiles passed default/intermediate/200% OS text, portrait/landscape relay and Pairing IME fields/final controls/live drafts, both navigation modes, nonzero cutout, real split-screen and exit, generated QR reachability and controlled scanner geometry/disposal without provider/media construction. App-relative zero IME overlap in the top split window is distinguished from a visible global keyboard. Native instrumentation's identical Java/test-byte contribution is recorded separately rather than claimed as a fresh final-APK instrumentation run.

Independent Standards and Spec code review passed against dispatch baseline `e6b5d41165a3aca7dea5b8022c31ddbecf2507ad`; final evidence-only Spec review confirms required scoped candidate gates. Exact source, builds, command/tool/environment details, source-to-integration mapping, raw cases, failures and closure proofs are preserved in the run evidence directory identified in [run record](../run.md): `ticket-12-source-handoff.json`, `ticket-12-35cb-build-source.json`, `ticket-12-integration-final-receipt.json`, `ticket-12-35cb-api35-summary.json`, `ticket-12-35cb-api31-summary.json`, `ticket-12-receipt-manifest.json`, and `ticket-12-17-{standards,spec}-review.md`.

Every owned guest stopped, its forward was removed, guest scalar/overlay state and the prior emulator-sharing preference were restored. API31's temporary proven WebView124 provider was removed and the original91/product path/global selection restored. Failed attempts remain recorded: transient rotation/input prerequisites, API31 tall-cutout SystemUI crash, unsupported driver forms, validated help-command exit conventions, one failed AVD CLI invocation with unavailable exact original wrapper bytes, and optional post-child logcat failures. Those are not passing cases; final scoped passes use the actual available double-cutout and correct flat API31 split controller.

Actual camera/provider/scanner Back, generic native task input, stable API36, physical foldables/cutout/OEM/hardware/assistive and external qualifications retain their accepted owners/limits. Ticket17's scanner target/style correction is a separate requirement; this geometry resolution does not qualify its 48dp controls. A01/A02 remain open in [finding status](../finding-status.md) until their remaining session/navigation contributions are collected.
