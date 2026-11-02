# Native host integration and interaction delivery

Prepared 2026-10-10 for [Plan native host integration and interaction repairs](issues/04-plan-native-host-integration.md#answer). **Approved delivery breakdown.** The user's acceptance is recorded in the linked decision. The [shared interfaces](shared-interface-proposal.md), [correctness delivery](correctness-delivery-proposal.md), [layout contract](../ux-study/layout-state-contract.md) and [control contract](../ux-study/control-flow-contract.md) are approved inputs. These packages inform final execution tickets; no application change or native check has run in this round.

## Recommended breakdown

Use seven reviewable packages: Android content bounds/IME; native task input/focus; scanner-provider diagnosis; scanner safety/lifecycle; notifications and permission recovery; Android continuity controls; and desktop tray/window behavior. Provider diagnosis has its own output before choosing a provider remedy. Each changed host adapter lands with a usable shared consumer; there is no stand-alone host framework or second task/navigation implementation.

The package order below describes ownership, not a strict execution chain. Safe controls, Back, scanner safety and permission recovery remain correctness work. The compact continuity presentation and pending indicator retain their workspace priority; tray cleanup and any demonstrated Dock repair remain band 3. First-milestone correctness work does not wait for unrelated native qualification.

## Android content bounds and IME

**Outcome:** system bars and the keyboard no longer cover the current task's fields or essential actions. Rotation and resize retain the live session's draft, validation, query and task context.

The Android host owns measured system/cutout/IME geometry and its updates; the shared shell/task owns scroll, reflow and focus reveal. Define one documented conversion to renderer coordinates and one owner for each inset so native resizing, CSS padding and keyboard adjustments do not apply the same space twice. Do not assume a zero CSS safe-area inset means no system bar, or equate dp, physical pixels and CSS pixels. Reuse the same effective content bounds for the scanner and diagnostics task.

Current [MainActivity](../../apps/android/android/app/src/main/java/com/clipp/app/MainActivity.java) only registers plugins and tracks the Activity-owned runtime; it has no app-owned inset/input integration. The [entry wrapper](../../apps/android/src/main.tsx) and [scanner](../../apps/android/src/qrCameraScanner.ts) render separately, so both must consume the host result. Preserve functioning rotation retention; do not make a size change create a new UI session. No survival across Activity/WebView destruction is promised for session drafts.

**Regression and native acceptance:** test the host geometry interface with nonzero bars/cutout/IME, transitions and disposal, then measure a real candidate on the affected Android environments. Cover portrait/landscape, gesture/three-button navigation, IME closed/open, a relay editor, Paste Pairing, QR and long diagnostics, including the short/enlarged cases below. Prove that the focused field, Back/Close and required action can actually be reached. Web viewport resizing alone is insufficient.

**Allocation:** closure owner for A01/A02; supplies the geometry portions of A09/A13/A18 and native evidence for workspace-owned A10/A14/A15. Shared issue composition still owns contained diagnostics; workspace owns row/grid/text sizing.

## Native task input and focus

**Outcome:** one native Back/Escape or activation event reaches the approved session/task owner exactly once, with meaningful focus entry and return.

- Android: dismiss visible IME first, then active scanner/overlay, then the current task level, then normal root-app behavior. Use native keyboard/Back signals rather than browser history. Prevent one event from both closing a task and leaving the app. Back/Close retains applicable drafts; explicit Cancel/Discard clears them. Closing a scanner cancels capture, not a submitted Trust Request.
- Electron: wire host activation/readiness to the existing shared session, and qualify Tab, Shift-Tab, Enter and Escape in the real window. Shared task presentation owns focus containment and return; the host must not implement a competing focus manager. Hiding a live renderer can retain its session.
- Chrome: qualify both the real toolbar popup and full-page management. Normal uninspected Escape/click-away may destroy the whole popup; no popup draft-survival promise is introduced. Full-page tasks use the shared dismissal/focus behavior, and the approved handoff supplies their destination.

Opening Pairing does not automatically summon the keyboard before a route is chosen. Test focus return when the invoker disappeared, keyboard scrolling to the last control, repeated Back, nested tasks, failed Save and responsive changes. Native clicks must not be replaced by a DOM callback when claiming host input acceptance. Named navigation, local icons and usable targets are prerequisites supplied by workspace foundations, not duplicate work here.

Preserve Android clipboard eligibility as resumed **and** focused, including focus loss to native dialogs. Reopening establishes the existing observation baseline; native input work must not force a new Local Clip or create background clipboard access.

**Sources and seams:** [Electron main](../../apps/electron/src/main.ts), [preload](../../apps/electron/src/preload.ts), [renderer](../../apps/electron/src/renderer.tsx), [Android entry](../../apps/android/src/main.tsx), [shared task contract](shared-interface-proposal.md#ui-session-and-host-task-contract), and the [native keyboard evidence](../ux-study/display-accessibility-observations.md#native-keyboard-findings). Introduce only the host adapter needed by the actual task consumer.

**Allocation:** closure owner for A03; collects native input evidence for E06/C06, whose shared focus and named navigation portions remain with correctness/workspace owners. Scanner cleanup is implemented in its package below.

## Android scanner-provider diagnosis

**Outcome:** a bounded diagnostic receipt identifies which scanner path is safe to implement/enable on the tested candidate, and the environments still unqualified. This package does not itself close A08.

The [recorded failure](../ux-study/android-observations.md#a08--scan-qr-crashes-the-tested-native-barcode-provider--high) is two process terminations on AOSP Android 15/WebView 124, with `GooglePlayServicesMissingManifestValueException` in Chromium's barcode provider. The scanner constructs exposed `BarcodeDetector`; JavaScript construction/detection catches cannot recover that native process crash. This is strong evidence for that environment, not a universal Android cause. The capability-override fallback trials are fixtures with native media, not acceptance of the unmodified scanner.

Record candidate revision/build, manifest/dependency inputs, Android/WebView/provider versions, device type and the exact failing stage. Reproduce in an isolated test installation; compare the implicated environment with the intended WebView distribution and a current physical-camera environment when available. Distinguish provider availability/construction, camera permission/acquisition and actual QR decoding. Validate any proposed availability probe itself rather than assuming it cannot enter the failing provider.

The result must recommend and justify the smallest safe remedy: an evidence-supported provider/manifest correction, avoiding the unsafe native path and using the existing jsQR decoder, or another narrowly justified change if neither qualifies. Do not preselect a broad dependency upgrade or add a universal Android workaround from the exception name alone. Missing physical/provider evidence is recorded explicitly; it does not become a pass or prevent unrelated lifecycle work. If the necessary comparison cannot be run, the provider choice remains pending that diagnostic output.

**Acceptance:** reproducible sanitized evidence, a clear candidate selection or precisely named blocker, and executable verification criteria for the repair package. No account or live clipboard is required for camera/provider diagnosis. Use only synthetic public Pairing Targets; device installation/camera access belongs to the later authorized test interval.

## Android scanner safety and lifecycle

**Outcome:** Scan returns a payload, cancellation or a typed permission/device/decode failure; it cannot leave orphan camera work or disguise failure as cancellation. Enable the selected decoder/provider only after the preceding diagnostic output supports it.

Keep one active scan operation behind the approved host interface. Abort on Back/Cancel, replacement, host backgrounding or task disposal; settle once, stop tracks and scheduled frame work, remove the overlay, and ignore late media/decode completion. A new scan must finish the old operation, not merely remove its DOM node. Prevent automatic and manual decode races; rejection must produce a usable error/retry path rather than an unhandled promise. Resuming the app should return to a usable task, not silently reopen capture.

The current [scanner](../../apps/android/src/qrCameraScanner.ts) handles ordinary Cancel and late camera acquisition but has no host abort interface. Its [entry wrapper](../../apps/android/src/main.tsx) converts thrown camera failures into an alert and `null`. Replace that ambiguity with the shared action contract. Camera denial must offer the applicable user-initiated recovery/instructions and Paste alternative; returning from permission settings rechecks state without assuming permission or automatically opening the camera. Reuse safe bounds from the geometry package and task-local issue presentation.

Preserve the existing successful Cancel cleanup and late-acquisition track stop. Missing background/task cleanup is a source gap to repair and test; the study did not demonstrate a background camera leak.

**Regression and native acceptance:** exercise the real scanner interface with deferred media/decode, Cancel before permission resolution, Back/background during acquisition and decoding, replacement, repeated Retry and disposal. Verify each acquired track is stopped and no late result submits Pairing. Then qualify an actual camera: valid/no QR, denial/recovery, repeated open/close, portrait/landscape, safe toolbar/QR framing and native Back. Successful software decode or mocked media cleanup alone is not physical-camera/provider acceptance. Pairing submission and remote outcomes remain with their correctness owner.

**Allocation:** closure owner for A08/A09, collecting provider and content-bound evidence. Supports A18's camera/Back qualification; QR display sizing remains workspace-owned. No finding closes merely because provider construction was hidden in a fixture.

## Notifications, permission recovery and Requests entry

**Outcome:** denial/failure has a reachable recovery route; selecting a genuine pending-request notification focuses the host and opens Requests after readiness and state reconciliation. Notification display, selection and Pairing success are separate outcomes.

Use two independently verifiable steps within this package:

1. **Permission and destination wiring.** Android reports current availability, offers a user-initiated settings route where supported with clear fallback instructions, and refreshes on return. Denial does not become a new prerequisite for Android Background Continuity. Adapt the existing notification callbacks into the approved host destination interface; queue entry through that owner until the consumer is ready, coalesce duplicate selections and reconcile an expired/missing request into the current Requests list. Preserve dirty drafts and pending operations in the live UI session. Chrome uses the existing approved canonical-page coordinator and idle/occupied-tab rule; it does not gain another queue/router or an invented popup sender.
2. **Actual delivery/selection qualification.** Diagnose the observed Electron failure and exercise real delivered notifications and selection on each affected host. Record request receipt, attempted display, OS delivery/error, selection, readiness and destination separately. Use a genuine signed request; a controlled callback proves routing only. Applicable denial/regrant needs an explicit coordinated native test interval.

Current [Electron notification/lifecycle code](../../apps/electron/src/main.ts) only opens/focuses the window. [Chrome selection](../../apps/extension/src/background.ts) and [Android selection](../../apps/android/src/client.ts) emit through an in-memory [notification selection module](../../packages/core/runtime/notifications.ts), while the [Pairing coordinator](../../packages/core/pairing/pending.ts) installs its consumer during startup. Treat startup loss as a source-supported race to test, not a new observed failure. Keep readiness retention in the host destination owner. Existing [notification tests](../../tests/core/runtime/notifications.test.ts) cover dismissal, not the complete journey.

Test visible/hidden Electron, renderer readiness, Android foreground/resume and applicable launch callbacks, Chrome worker wake with management absent, idle/occupied pages, duplicate selection and requests no longer pending. A selection must not cancel a save, resurrect a stale request or clear a retained draft. Distinguish cold renderer/worker readiness from OS relaunch after the entire application quit; do not claim the latter from an injected startup callback. Verify the actual supported launch mechanism or record that path separately.

Request arrival alone does not navigate away from current work. The user's notification selection triggers Requests entry. Electron/Android preserve the originating task, its draft and any pending operation through the shared session, with the normal return route; Chrome retains its separately approved occupied-tab rule.

The observed Electron `UNErrorDomain error 1` does not establish a packaging or authorization cause. A packaged build is a diagnostic variable, not a predetermined remedy. Chrome needs a route allowed by normal transport policy; do not weaken it to obtain notification evidence. Full app-to-app Pairing remains its own qualification.

On Android, inspect app-level permission and each relevant channel separately: continuity-channel availability does not prove that the Pairing notification channel can deliver. Test app/channel blocking and settings return. The continuity notification's existing Tap to reconnect entry retains that purpose; only pending-request selection routes to Requests.

**Allocation:** closure owner for A07. Supplies native entry/permission portions supporting C11 and E12, plus Android Requests integration. Android denial recovery and band-1 management routing need not wait for band-2 pending-count presentation. The notification pathway must not be the only way to find pending work; that visible control stays with workspace delivery. Successful notification display is not evidence of delivery of a Clip.

## Android continuity controls

**Outcome:** UI and native notification offer one state-dependent Pause Auto Sync or Resume Auto Sync action, while Stop background mode remains distinct and preserves Auto Sync.

Update the [shared continuity controls](../../packages/ui/src/ClipboardApp.tsx), [client](../../apps/android/src/client.ts), [continuity module](../../apps/android/src/backgroundContinuity.ts), [native adapter](../../apps/android/src/backgroundContinuityNative.ts) and [service notification](../../apps/android/android/app/src/main/java/com/clipp/app/BackgroundContinuityService.java) together where their action/state surfaces change. Use explicit desired state, not a stale blind toggle. Await/reconcile action results; late native actions and persistence failure must not leave the visible state lying. Preserve the existing Activity-owned runtime, best-effort continuity and foreground clipboard restrictions; do not introduce background capture or unconditional reboot recovery.

The service currently exposes Pause and Resume together and changes its local connection indication before the preference action completes. Carry authoritative Auto Sync explicitly across the native update seam when needed; a disconnected connection label alone cannot tell it which action to show. Replace the native test expectation that both actions are always present with state/failure-based assertions, retaining existing Stop and capture-eligibility checks.

Make Start/export/help actions content-sized and named in the band-1 usable-control work. Compact Settings presentation follows in band 2: concise state, benefit/battery limitations and opt-in, with detailed help/diagnostics on demand. Reuse the issue/diagnostics task; do not add another banner region. Native OS share/permission dialogs retain platform behavior. Preserve explicit SEND/PROCESS_TEXT ingress and diagnostics export while moving their controls.

**Regression and native acceptance:** extend [continuity tests](../../tests/android/backgroundContinuity.test.ts), [clip continuity tests](../../tests/android/clipContinuity.test.ts) and native [service lifecycle tests](../../apps/android/android/app/src/androidTest/java/com/clipp/app/BackgroundContinuityLifecycleTest.java) through the actual action/update seam. Check enabled/disabled/running/stopped and Auto Sync on/off, stale notification tap, rapid actions, failure, notification denial and return from settings. Observe the real notification actions and resulting persisted state. Stop must preserve Auto Sync both on and off. Verify content-sized targets with enlarged text. Export completion requires a real recipient result; merely opening the chooser is not delivery.

After Stop, reopen Clipp and verify background mode stays disabled while the previous Auto Sync value remains applied. This is preservation of the existing persistence contract, not a new restart policy.

**Allocation:** closure owner for A06; supplies native state/actions for workspace-owned A04/A05. Existing OEM/Doze, export-recipient and real other-app chooser gaps remain named qualifications, not promises from unit tests.

## Desktop tray and window behavior

**Outcome:** the tray has one useful Open Clipp entry, and the main window follows the accepted Dock/close-to-tray behavior without losing its live context.

Remove duplicate Configure Relays in [Electron main](../../apps/electron/src/main.ts); relay configuration remains inside Clipp. Revalidate Dock behavior using the actual tray route before making a conditional repair. Earlier callback evidence conflicts with the later user-observed return of the Dock icon; neither should be erased. If actual behavior already meets the contract, record a pass and make no speculative Dock fix.

**Acceptance:** passive observations around actual close-to-tray → Open Clipp, minimized restoration, foreground focus and preserved live task/query/draft. Dock is visible while the main window is open and hidden on close-to-tray. Do not activate the app with an inspection tool while claiming that the tray action caused the result. Test actual menu selection in addition to any constructed-menu callback. Preserve working minimize/restore and normal quit behavior. Desktop sizing/fullscreen checks use the profile below.

**Allocation:** E10; conditional E17 after revalidation. Both remain band 3. A small related change can accompany authorized host work as already allowed, without delaying correctness or silently declaring E17 reproduced.

## Dependency outputs and closure ownership

| Consumer | Required output |
| --- | --- |
| Shared task/scanner/diagnostics bounds | One Android content/IME geometry interface with units, ownership and lifecycle documented; consume it in each affected surface. |
| Layered Back and keyboard acceptance | Existing session/task owner, accessible shared task presentation and named navigation. Scanner abort is required for scanner Back, not for every unrelated editor check. |
| Provider remedy | Diagnostic receipt with supported candidate choice; media cleanup and input work can proceed independently. |
| Notification destination | Usable Requests consumer and reconciled state; main/preload or Android host entry; Chrome's approved management/handoff coordinator. Functional entry precedes retirement of old controls. |
| Compact workspace | Safe content bounds, task input behavior, permission/capability/results, continuity action state and actual host size/text evidence. Final aesthetic polish is not a prerequisite for these contracts. |
| Native notification acceptance | A candidate that can receive a valid request and a real OS delivery/selection path. A callback fixture alone cannot close this qualification. |

Final consolidation names one closure owner per finding. Native packages own A01/A02/A03/A07/A08/A09/A06 and E10/E17. Shared task/navigation owners collect native evidence for E06/C06; correctness issue composition collects the native portions of A13 and C04, with workspace supplying shared sizing; workspace collects the required native portions of A04/A05/A10/A11/A14/A15/A18 and E07/C03/C05 as applicable. C11 and E12 retain their management/pending-control owners while consuming notification entry evidence. This allocation does not count supporting evidence as full finding closure or move lower-priority visual work ahead of correctness.

No new glossary term, protocol change or ADR is required. Android Background Continuity, Auto Sync, Pairing and Admission retain their existing meanings. Dismissal, notification selection and camera cancellation do not cancel a signed Trust Request or establish remote acceptance.

## Native acceptance profiles and retained gaps

Use representative combinations plus the smallest/shortest/enlarged/task cases from the accepted [layout matrix](../ux-study/layout-state-contract.md#implementation-acceptance-matrix). Expand when a concrete failure warrants it; historical capture counts are not mandatory test counts.

| Profile | Required candidate evidence and limits |
| --- | --- |
| Android geometry/input | Affected API 35 environment and supported older comparison; portrait/landscape, gesture/three-button, actual insets/IME, rotation with draft, narrow/short and large window. Record Android/WebView versions, native window dp/density/font scale, insets, renderer size and screenshots separately. API 36 needs a stable environment; previous System UI ANRs are excluded evidence. |
| Android text/targets/tasks | Default, intermediate and 200% OS text; 320px reflow and short landscape/freeform; long labels/errors and simultaneous issues; editors/Paste/QR/Scan. Verify 48dp Android target intent using native measurements, not a claim that 48 CSS px automatically equals 48dp. Cutout/split-screen, complete 200% relay/Pairing IME and QR Back need explicit results; previous passes do not supply them. |
| Electron windows | Minimum/default and wider restored content, settled maximize, real fullscreen and exit/restore; keyboard task entry/return. Record outer/content/normal bounds, window flags, display work area/scale, renderer dimensions and zoom. Workspace owns reflow and card sizing. |
| Real Chrome popup | Default and short work area, normal/maximized/fullscreen parent, reopen and last-control reachability. The measured host was around 495×600 or 495×559; requested 480×800 is not the acceptance viewport. Detach tooling that changes dismissal. Independently qualify popup text enlargement rather than using full-page zoom as its substitute. |
| Chrome full-page | Narrow, restored/wide, maximize/fullscreen, 100/intermediate/200% supported zoom and 320px reflow. Query/task/draft stays intact; complete-display geometry is measured rather than inferred from a fullscreen flag. |
| Across changed surfaces | Named icons, visible/scoped focus, pointer target intent, full values inspectable, offline assets, all themes, honest failure recovery and a reachable final control. Shared styling/contrast tests and native rendering/input checks complement each other. |

Carry the [exact native gap ledger](../ux-study/remaining-native-coverage.md) and [Android coverage disposition](../ux-study/handoff.md#coverage-disposition-explicit-carryforward-accepted) into affected execution tickets. Each names its candidate acceptance evidence and outstanding external qualification separately. Feasible unrun cases are not automatically unavailable. If a required native check is blocked, report that portion unqualified; do not waive it or block unrelated frontend work by association.

- External display/native 1×/physical 1920-wide hardware is unavailable. Existing built-in scale-2 mode checks do not replace it. OS text-only scaling needs a new coordinated interval; prior display settings were restored and permission to change them has ended.
- VoiceOver is explicitly unverified. Android TalkBack/hardware keyboard/foldables, physical-camera/provider, OEM/Doze, stable API 36 and other listed native gaps retain their accepted dispositions. Native Tab/AX metadata is not a screen-reader pass.
- Real clipboard read/Copy/QR payload checks belong to their existing action owners and require a fresh isolated marker interval. Scanner diagnosis can use public test QR data without touching the system clipboard. Old clipboard gates remain off.
- Sign-in remains user-deferred. Do not launch account journeys or borrow prior test accounts/registration permission. Managed-relay auth/transport qualification retains its existing owner; notification routing needs no new account capability.
- Complete app-to-app Pairing remains with core Pairing and runtime bridges. Notification delivery, software QR decoding or an external protocol peer does not qualify that whole journey.

Use [routine verification](../../docs/agents/verification.md) for code gates, plus [Android native acceptance](../../docs/android-managed-relay-native-acceptance.md) for isolated package/device gates. Build/sync before native testing and inspect the test package IDs; never install storage-mutating fixtures on the operator app. Scope native logs/captures to synthetic data and record exact revision/dirty state. Native changes require appropriate native compilation/instrumentation in addition to the web build; `npm run verify` alone is not native acceptance. Run `npm run check` before future code commits. No tests or runtime actions are performed for this planning document.

## Decision status

The user accepted this seven-package breakdown; the canonical resolution is recorded in [Plan native host integration and interaction repairs](issues/04-plan-native-host-integration.md#answer). The approved UX, shared interfaces and coverage dispositions stay settled. Final consolidation will turn these scopes and dependencies into execution tickets; this decision does not authorize native activity or resolve the remaining planning tickets.
