# Android UX observations

Recorded 2026-10-08 for [Observe Android layouts and native interactions](issues/05-observe-android-ux.md). This is a UX observation report. Proposed changes await the control and layout decisions; no production fixes are included.

The Android wrapper needs native inset and Back handling around the shared UI. Phone layouts spend substantial space on chrome and background-mode guidance while hiding search and making several touch controls too small. A failed Pairing attempt also exposes technical diagnostics in the main layout. Native observations and simulated public-state cases are distinguished below.

The report records **18 findings**, supported by **111 retained images from 114 capture attempts**. Thirty images are explicitly excluded from usability claims because they show stale frames, invalid trials or ANR overlays. The remaining 81 images include qualified native observations and clearly labelled fixtures; they are not 81 scenario passes.

## Evidence and isolation

- [Gallery](android-evidence/index.html), [evidence ledger](android-evidence/evidence.jsonl), [raw geometry](android-evidence/observations.jsonl), [interaction trace](android-evidence/trace.jsonl), [reproduction notes](android-evidence/README.md), [source/build receipt](android-evidence/source-build-receipt.json).
- Client baseline `a2e1a64cad05eadb7c567b48e3ec45ce7cd51e33`. The web build, Capacitor sync and `:app:assembleAcceptance` passed. The installed package is **com.clipp.app.acceptance**, version 1.0.2, min SDK 23, target SDK 36. Isolated callbacks use `clipp-relay-acceptance`; this is not production sign-in qualification.
- Fresh, headless AOSP arm64 AVDs, emulated cameras, no host clipboard UI and no operator data. All captured Clips, names, device identities and notifications belong to this study. Managed relays stayed empty in the real client. Synthetic relay configurations were rendered only through an in-memory public-state seam.
- Main native run: Android 15/API 35, WebView **124.0.6367.219**, emulator **37.1.11**. Baseline **1080×2160** virtual physical pixels at **480 dpi**, giving **360×720 CSS px**, DPR 3. The WebView uses the full window; CSS safe-area insets were all zero. Three-button status/navigation areas occupy 24/48dp in portrait.
- Comparison: Android 12/API 31, WebView **91.0.4472.114**, same display/density, WebView **360×648**. The OS reserves 72dp for bars. The externally hosted icon font did not load in this image, so literal icon names appeared. This is a recorded environment-dependent failure, not proof that all Android 12 installations behave that way.
- Android 16/API 36, WebView **133.0.6943.137**, was attempted twice. Both the concurrent run and a separate fresh-AVD retry displayed a **System UI ANR**. Those images are excluded from app usability conclusions; API 36 remains unqualified. The comparison emulator was closed normally after the retry. This environmental failure is not assigned to Clipp.
- All screenshots are native emulator screencaps, including fixture cases. `wm size` / `wm density` change the owned virtual device's actual window; they do not establish coverage of a physical tablet/foldable. OS font scale is recorded separately from CSS font size and device density.
- The scanner fallback cases temporarily remove `window.BarcodeDetector` in the inspected document to exercise the existing jsQR path after the tested provider crashes. Camera media and permission handling remain native, but these cases are **rendered-fixture**, not a pass of the original scanner.

Some initial captures caught a stale frame, launcher or ANR dialog. Their scenario labels alone are not evidence. The ledger annotations identify exclusions and replacements. Back was repeated after a fresh process: the app leaves for the launcher and resets its drawer when reopened. An earlier assertion that the drawer always survives Back was incorrect. Crash/ANR outcomes are separated from layout defects; minidump data is not retained.

## Native size and interaction coverage

The primary matrix used Android 15 at default text size unless stated otherwise. Logical dimensions below are the measured WebView viewport, not a device marketing size. Full-window content can still overlap native bars.

| Native surface | Virtual display / DPR | Observed coverage and limits |
| --- | --- | --- |
| 320×640 | 960×1920 / 3 | History, navigation and drawer end; horizontal history overflow |
| 360×640 and 360×720 | 1080×1920 or 1080×2160 / 3 | Short/default phone, clean Back, permissions, continuity, real intent ingress and malformed Pairing |
| 393×800 and 412×915 | 1179×2400 or 1236×2745 / 3 | History, navigation and drawer end; ordinary phone sizing |
| 720×360 landscape | 2160×1080 / 3 | Relay editor with keyboard, retained drafts, generated QR; camera fallback in a labelled capability fixture |
| 600×800 | 1200×1600 / 2 | Navigation and settings; the initial history frame was still loading and is excluded from density counts |
| 840×1100 | 1680×2200 / 2 | Expanded portrait, history and navigation |
| 1200×800 | 1800×1200 / 1.5 | Settled native tablet surface displays all nine short Clips in a three-column grid; sidebar scrolls separately |
| 220×360 and 340×350 freeform | 1080×2160 host display / 3 | Actual Android freeform task, then resized task bounds; only 6px and 58px of history client height respectively |
| 360×720 at 130% and 200% text | 1080×2160 / 3 | Actual OS text scaling, drawer growth and card overlap; verified 200% rename IME, but subsequent large-text relay/Pairing trials were invalid |
| Gesture navigation / emulated cutout | 1080×2160 and rotated / 3 | Gesture handle overlap recorded; tall-cutout overlay enabled and rotated, without independently qualifying physical cutout geometry |

Three-button navigation exposed 24/48dp top/bottom bars; gesture navigation exposed a 24dp bottom handle region. [Gesture drawer](android-evidence/native-gesture-bottom.png) still overlaps the bottom action. Native freeform task mode was verified, but split-screen itself was not exercised. A return from freeform produced a transient clipped native frame despite fullscreen DOM geometry; the purported portrait QR screenshot from that transition is excluded.

Native successful behaviors matter too: unsaved relay strings survived the observed rotation; fallback-camera Cancel removed the overlay and ended its track; notification Pause/Resume/Stop changed the distinct sharing/continuity states as expected; force-stop/reopen retained the synthetic history; native export invoked Android's recipient chooser. The AOSP image had no installed JSON recipient, so export was not delivered to another app. These do not qualify real relay delivery or account recovery.

## Findings

Priorities are provisional: **High** blocks a task, obscures essential controls or loses work; **Medium** adds confusion, navigation or space cost. Expected behavior is a proposed acceptance criterion.

### A01 — System bars cover app controls on Android 15 · High

**Native-isolated, 360×720, DPR 3, three-button navigation.** Open the drawer, scroll to the end, or rotate a focused relay editor. Content begins at y=0 under the 24dp status bar, and its last controls extend into the 48dp navigation area. Both `innerHeight` and `visualViewport.height` remain 720. CSS safe-area env values are zero. The Android 12 comparison reserves the bars and has a 648px WebView.

**Expected / next action:** establish a native inset contract for the wrapper and shared shell; keep tappable controls inside safe content bounds in portrait, landscape and gesture navigation. Apply it to dialogs and the scanner too. High confidence in the measured Android 15 overlap; do not infer every supported device behaves identically.

Evidence: [drawer bottom](android-evidence/native-continuity-clean-bottom.png), [gesture navigation](android-evidence/native-gesture-bottom.png), [relay landscape](android-evidence/native-relay-keyboard-landscape.png), [API 31 comparison](android-evidence/api31-bottom.png). Source: [MainActivity](../../apps/android/android/app/src/main/java/com/clipp/app/MainActivity.java), [shared styles](../../packages/ui/src/styles.css), [scanner](../../apps/android/src/qrCameraScanner.ts).

### A02 — The soft keyboard covers the relay task in landscape · High

**Native-isolated, 360×720 portrait → 720×360 landscape, OS font 1.0.** Enter an unsaved relay name and endpoint, then rotate with the keyboard open. The two draft strings survive rotation. In landscape the keyboard covers the endpoint and the Save/Cancel region; the WebView and visual viewport still report the full 360px height. Dismissing the keyboard is an extra required step in the observed state. This does not prove that every possible manual scroll position is inaccessible.

**Expected / next action:** size or scroll the form against actual IME insets; provide a reachable submit/cancel route while editing, without discarding drafts. High confidence in native overlap. Preserve the working rotation retention.

Evidence: [portrait endpoint](android-evidence/native-relay-endpoint-keyboard.png), [landscape keyboard](android-evidence/native-relay-keyboard-landscape.png), [keyboard dismissed](android-evidence/native-relay-landscape-no-keyboard.png), draft values in the trace. Source: [relay editor](../../packages/ui/src/ManagedRelaySettings.tsx), [styles](../../packages/ui/src/styles.css).

### A03 — Back exits the app instead of closing its drawer · High

**Native-isolated, clean process, 360×720.** Open navigation and press the system Back key. Android reports the launcher as the resumed Activity. Reopen Clipp: a new document time origin is recorded, with the drawer closed. The UI has no wrapper-level drawer/modal Back integration. The earlier QR/Back screenshots were affected by an ANR and do not independently qualify the QR case.

**Expected / next action:** agree a layered Back policy: dismiss keyboard, then the top scanner/modal/editor/drawer, then leave the root app; make unsaved-input loss deliberate. This requires a product decision about draft retention, not a silent semantic change. High confidence for the drawer; modal/QR behavior remains partly source-supported.

Evidence: [clean drawer](android-evidence/native-clean-drawer.png), [Back to launcher](android-evidence/native-clean-back-drawer.png), [return](android-evidence/native-clean-return-back.png), `cleanBack`/`cleanBackReturn` trace records. Source: [MainActivity](../../apps/android/android/app/src/main/java/com/clipp/app/MainActivity.java), [ClipboardApp](../../packages/ui/src/ClipboardApp.tsx).

### A04 — Text actions are squeezed into icon buttons · High

**Native-isolated, default phone; rendered-fixture for stopped/limited state.** The diagnostics export action is a **32×32px** `.icon-button` containing four words. Its label wraps outside the button and overlaps neighboring content and the navigation area. “Start background mode” uses the same class when an enabled service is stopped. Export remains a real native action; its poor geometry is not evidence that the bridge is missing.

**Expected / next action:** use content-sized text buttons with touch-sized hit areas; reserve icon buttons for actual icons. Require the complete label and hit target to remain visible at all supported font/display scales. High confidence; shared UI source directly explains the layout.

Evidence: [native export](android-evidence/native-continuity-clean-bottom.png), [older Android comparison](android-evidence/api31-bottom.png), [stopped/limited fixture](android-evidence/fixture-continuity-limited-stopped.png). Source: [continuity section](../../packages/ui/src/ClipboardApp.tsx), [icon-button CSS](../../packages/ui/src/styles.css).

### A05 — Everyday settings sit behind verbose advanced guidance · Medium

**Native-isolated, empty navigation at 360×720.** Drawer content is already **947px** in a **716px** client area, before adding Trusted Devices or relays. Experimental background continuity displays two long paragraphs even when disabled, including “Activity-owned WebView,” “partial CPU wake lock” and “OEM process management.” It repeats much of this in the opt-in confirmation. The content explains real limits, but its prominence competes with the user's daily task.

**Expected / next action:** keep a short state/benefit/battery summary and a clearly named opt-in; move implementation detail and diagnostics into expandable help or a troubleshooting destination. Preserve the experimental/best-effort limitation and clipboard-focus requirement. High confidence in space cost; organization choice belongs to the layout decision.

Evidence: [continuity guidance](android-evidence/native-continuity-clean-bottom.png), [confirmation](android-evidence/native-continuity-confirmation.png). Source: [ClipboardApp](../../packages/ui/src/ClipboardApp.tsx).

### A06 — Pause and Resume appear together regardless of state · Medium

**Native-isolated, ongoing Android notification.** Enable background continuity, expand its notification, tap Pause, then Resume and Stop. Public state confirms Pause sets Auto Sync false and continuity connection `paused`; Resume restores Auto Sync true; Stop disables continuity while leaving Auto Sync true. Both Pause and Resume are always visible. “Pause” also fails to say it affects sharing rather than stopping the service.

**Expected / next action:** propose a single state-dependent “Pause Auto Sync” / “Resume Auto Sync” action alongside a clearly named stop-background action. Retain distinct Auto Sync and continuity semantics. High confidence in behavior and redundancy; removal/renaming requires the control decision.

Evidence: [expanded notification](android-evidence/native-notification-expanded.png), [paused notification](android-evidence/native-notification-paused-expanded.png), `afterPause`/`resume`/`afterStop` trace. Source: [BackgroundContinuityService](../../apps/android/android/app/src/main/java/com/clipp/app/BackgroundContinuityService.java).

### A07 — Notification denial explains the problem but offers no recovery route · Medium

**Native-isolated, real POST_NOTIFICATIONS dialog and denial.** Deny a synthetic notification issued through the real runtime adapter. The drawer explains that reconnect alerts may not appear and keeps continuity available, matching the accepted best-effort behavior. There is no visible permission/settings shortcut. The study subsequently grants permission through emulator setup to inspect notifications; that is not an app-provided recovery path.

**Expected / next action:** pair the blocked state with a user-initiated notification-settings action or precise concise instructions. Do not force notification permission as a new gate for background mode. High confidence.

Evidence: [permission prompt](android-evidence/native-notification-permission.png), [denied state](android-evidence/native-notifications-denied.png). Source: [Android notification adapter](../../apps/android/src/client.ts), [continuity controls](../../packages/ui/src/ClipboardApp.tsx).

### A08 — Scan QR crashes the tested native barcode provider · High

**Native-isolated, AOSP Android 15/WebView 124.** In a fresh foreground app, open navigation and select Scan QR. Two processes terminated at the scanner entry point. The retained Java exception is `GooglePlayServicesMissingManifestValueException` from Chromium's `bindBarcodeDetectionProvider`, raised on `Chrome_InProcGpuThread`. The scanner constructs `BarcodeDetector` when exposed and only catches JavaScript construction errors; that cannot recover a native process crash.

**Expected / next action:** qualify barcode-provider availability on supported native environments and choose a safe path before constructing it. Reproduce on a current physical device and the intended WebView distribution before choosing a manifest/provider/fallback fix. High confidence for this environment and stack; cross-device prevalence is unknown. Do not classify the AOSP-only reproduction as a universal Android failure.

Evidence: [crash screen](android-evidence/native-camera-permission.png), [sanitized exception](android-evidence/camera-crash-log.txt). Source: [createBarcodeDetector](../../apps/android/src/qrCameraScanner.ts).

### A09 — Scanner actions overlap Android navigation · High

**Rendered-fixture/native media, 360×720, three-button navigation.** With BarcodeDetector absent by an in-memory capability override, the real emulated camera opens through the existing jsQR fallback. Scan now and Cancel extend into the bottom system navigation area. The toolbar adds `env(safe-area-inset-bottom)`, which is zero in this WebView. The crop frame and toolbar also need independent landscape sizing. Permission denial produces a readable native message but only an OK action; there is no permission recovery shortcut.

**Expected / next action:** use real native bottom insets and a reachable cancel route; verify portrait/landscape with keyboard/system navigation and permission denial. Cancel was confirmed to remove the overlay and end the captured track. A Home probe retained a live track but reported document visibility inconsistently; it does **not** establish background camera use or leakage. Lifecycle cleanup remains a source-supported qualification question.

Evidence: [portrait](android-evidence/fallback-camera-portrait-settled.png), [landscape](android-evidence/fallback-camera-landscape.png), [denial](android-evidence/fallback-camera-denied.png), `cameraCancel` trace. Source: [scanner toolbar and cleanup](../../apps/android/src/qrCameraScanner.ts).

### A10 — Compact navigation hides search and uses small touch targets · Medium

**Native-isolated, phone viewports.** Search disappears below the shared compact breakpoint; the logo is the navigation entry. The local rename control measures **18×18px**, ordinary icon controls **32×32px**, and the browser-native preference selects about **20px high** at default text size. These are smaller than the study's Android 48dp touch-target criterion. Closed navigation also has no pending-request count; the dense-state case demonstrates the hidden requests, not a real received request.

**Expected / next action:** provide a recognizable, labelled navigation/search route and preserve compactness with appropriate touch hit areas. Surface actionable pending state without opening the drawer. High confidence in geometry and source; validate assistive navigation separately.

Evidence: phone matrix in the gallery, [closed dense state](android-evidence/fixture-dense-history.png), [dense drawer](android-evidence/fixture-dense-navigation.png). Source: [ClipboardApp](../../packages/ui/src/ClipboardApp.tsx), [styles](../../packages/ui/src/styles.css), [platform criteria](platform-constraints.md).

### A11 — Native defaults, branded controls and remote icons diverge · Medium

**Native-isolated across Android versions.** Rounded purple Pairing actions sit beside rectangular white browser-default Add relay/select controls. The Android 12 image renders icon names such as `dark_mode`, `unfold_more` and `qr_code_scanner` as large words when the external icon font is unavailable. Several then overflow their allocated control. Android 15 successfully loads those icons in the same study, so this is an offline/provider-dependent weakness rather than a fixed OS rule.

**Expected / next action:** apply shared field/button tokens to all controls and bundle essential icons or provide a usable local fallback. Native permission/notification dialogs may retain Android styling. Do not make their legitimate platform appearance identical to web cards. High confidence in the captured inconsistency.

Evidence: [API 31 icon text](android-evidence/api31-bottom.png), [API 35 drawer](android-evidence/native-continuity-clean-bottom.png). Source: [styles](../../packages/ui/src/styles.css), [Android entry HTML](../../apps/android/index.html), [ManagedRelaySettings](../../packages/ui/src/ManagedRelaySettings.tsx).

### A12 — Phone history spends too much space above and inside each Clip · Medium

**Native-isolated, 360×720 with eight short Clips.** The compact header is about **61px** high. The three-row history heading/actions consume about **108px**; the first Clip begins around y=219. Each one-line Clip occupies a fixed **160px** card, with repeated source/type/time metadata and substantial empty space. Search is absent despite this space cost. Android's local “Mobile” identity and Local history metadata also use a desktop computer icon.

The actual **340×350 freeform** window leaves only **58px** of history client height: the first card's header is visible, while its content and Copy action require scrolling. At **220×360**, the history client height falls to **6px**. Conversely, the settled **1200×800** surface shows all nine short Clips. The space problem is concentrated in compact/short windows and should not be generalized to every expanded layout.

**Expected / next action:** compare a compact list/card density with one toolbar row plus a deliberate overflow menu; keep Copy and the primary action reachable, and preserve readable metadata without repeating it at equal prominence. Use runtime-appropriate device icons. High confidence in measured layout; the density choice belongs to the later layout decision.

Evidence: [native history](android-evidence/native-after-anr-wait.png), [short freeform window](android-evidence/native-freeform-short.png), [expanded tablet](android-evidence/native-tablet-history-settled.png), native size matrix. Source: [history rendering](../../packages/ui/src/ClipboardApp.tsx), [fixed card height](../../packages/ui/src/styles.css).

### A13 — Pairing diagnostics displace the entire app · High

**Native-isolated, invalid Pairing text, 360×720, default font.** Submit malformed text. A native alert gives a technical attempt identifier and logging namespace; after dismissal a JSON panel opens above the app. The shell remains **720px** high but starts at **y=212**, ending at **932**, outside the 720px viewport. Collapsing diagnostics still puts it at **y=64**. The history scroller's bottom moves below the usable screen; this is a height-contract error in addition to excessive diagnostic prominence.

**Expected / next action:** use a concise actionable error near Pairing, preserve/edit the draft, and offer expandable or exportable diagnostics within the available layout height. Technical timestamps and JSON should not permanently reduce daily history access. High confidence in native behavior and geometry.

Evidence: [alert](android-evidence/native-invalid-pairing-alert.png), [expanded](android-evidence/native-diagnostics-history.png), [collapsed](android-evidence/native-diagnostics-collapsed.png). Source: [PairingDiagnosticsPanel and wrapper](../../apps/android/src/main.tsx), [100vh shell](../../packages/ui/src/styles.css).

### A14 — Enlarged text escapes fixed history cards · High

**Native-isolated, actual Android font scales 1.0, 1.3 and 2.0; 360×720.** WebView text responds to the system setting: shell font size changes from **16px → 20.8px → 32px**. At 200%, content and metadata exceed the fixed **160px** card; the Copy button and type label overlap the next Clip. The first card starts around **y=347**, leaving about 300px of history height. Disabled continuity guidance expands the drawer to **1658px** (1067px at 130%, 947px at default). Enlarging text is working; the layout does not accommodate it.

**Expected / next action:** use content-driven card heights and wrapping at large text, keep each action visually associated with its Clip, and reduce persistent chrome rather than reducing the user's selected text size. Test the actual 200% setting, not just browser zoom. High confidence.

Evidence: [200% history](android-evidence/native-font-2-history-settled.png), [200% drawer end](android-evidence/native-font-2-bottom.png), [200% rename with keyboard](android-evidence/native-font-2-rename-keyboard.png). Some subsequent relay/Pairing keyboard attempts targeted a stale editor; their labels are excluded, not claimed passes. Source: [history styles](../../packages/ui/src/styles.css).

### A15 — A 320px window requires sideways history scrolling · Medium

**Native-isolated, virtual display 960×1920 at 480dpi → 320×640 CSS.** The history scroller is **254px wide** but has **268px** scroll width; card edges and part of the Copy affordance extend behind its right edge. A horizontal scrollbar appears in addition to vertical scrolling. All eight card boxes are wider than their visible region, so no complete card fits at once. This is not proof that Copy cannot be reached; it is avoidable two-axis navigation.

**Expected / next action:** allow the card grid and footer to shrink/wrap within the narrow viewport, keeping Copy and the Clip content visible without horizontal scrolling. Preserve normal vertical history scrolling. High confidence in native geometry and screenshot.

Evidence: [320px history](android-evidence/native-size-320x640.png). Source: [grid/card sizing](../../packages/ui/src/styles.css).

### A16 — Dense navigation hides settings behind long lists and identifiers · Medium

**Rendered-fixture, 360×720, 200 Clips / 20 devices / seven relays / four incoming and four outgoing requests.** The drawer has **3248px** of content in **716px**, over four viewport lengths. Pending Peer IDs are not wrapped and spill beyond the row, producing **418px** scroll width in a **310px** client width with horizontal overflow hidden. Ordinary relay actions wrap successfully; the long relay name/URL costs height but does not push its action buttons offscreen. These are different problems and need different remedies.

**Expected / next action:** group everyday settings separately from device/relay administration; truncate or wrap identifiers with a deliberate copy/full-value route; summarize long status details without hiding the next action. Preserve the working relay-action wrapping. High confidence in rendered geometry, not network-state occurrence.

Evidence: [pending identifiers](android-evidence/fixture-dense-navigation.png), [relay wrapping](android-evidence/fixture-dense-relays.png), [settings at the bottom](android-evidence/fixture-dense-bottom.png). Source: [shared navigation](../../packages/ui/src/ClipboardApp.tsx), [relay cards](../../packages/ui/src/ManagedRelaySettings.tsx).

### A17 — Concurrent recovery notices overlap · High

**Rendered-fixture, adversarial returned public state, 360×720.** Identity recovery and a clipboard-storage notice both occupy **y=62**; the 17px identity row is partly obscured by the 63px history notice. A cleanup notice follows at y=125. This repeats the shared layout defect seen in Electron and Chrome. The fixture proves rendering under those props, not that the real Android runtime emits all states together.

**Expected / next action:** give notices their own content-sized stack in layout, keep every message/action reachable, and preserve enough space for the current task. Test individual and concurrent notices with large text. High confidence in the UI response.

Evidence: [overlap](android-evidence/fixture-stacked-recovery.png), alert rectangles in the ledger. Source: [notice rows](../../packages/ui/src/ClipboardApp.tsx), [shell grid](../../packages/ui/src/styles.css).

### A18 — Landscape QR opens cropped, with Copy below the fold · Medium

**Native-isolated, generated Pairing QR, 720×360 landscape.** Open Show my QR and rotate. The modal is **328px** high, with **435px** scroll height in a **326px** client area. Its initial view clips the bottom of the QR and hides the Copy action. The close control remains visible. The dialog does scroll; this is not proof that a complete code cannot be brought into view or that decoding fails.

**Expected / next action:** fit the code and essential actions to the available short-window height, or make the required scroll explicit; preserve a usable copy route. Test full-code visibility and an actual scan after sizing. High confidence in initial cropping and source height rules; no real scan was performed.

Evidence: [landscape QR](android-evidence/native-qr-landscape.png), modal geometry in the ledger. Source: [QR modal sizing](../../packages/ui/src/styles.css). The portrait screenshot taken immediately after leaving freeform mode is excluded because its native frame had not settled.

## Coverage boundaries

Real relay authentication and return from an external identity provider, two-device Pairing/approval notifications, physical-camera QR decoding, OEM background survival/Doze/battery policy, TalkBack, a hardware keyboard and physical foldable transitions are not established. A synthetic native notification verifies permission/display mechanics; it does not prove a pending-request notification opens the approval region. Source routes the notification selection toward window focus without an explicit drawer destination, so that concern remains a recommendation to qualify.

Explicit SEND intents exercised actual ingestion into the isolated app and produced eight retained synthetic Clips. A real PROCESS_TEXT intent subsequently produced a ninth synthetic Clip; the first immediate probe was false and a later public-state read confirmed it, so no immediate-delivery timing claim is made. That does not prove remote delivery and is not a walkthrough of another app's system Sharesheet chooser. No user data or live relay account was needed. The report preserves these distinctions for the final handoff.

The complete large-text keyboard matrix is also unfinished: 200% rename is valid, default-size relay landscape is valid, and malformed Pairing uses the real keyboard, but the later 200% relay/Pairing attempts targeted the wrong or disconnected document. Cutout geometry, QR Back, split-screen, successful external export and a stable API 36 run need targeted repetitions. On 2026-10-08 the user instructed proceeding with the next frontier after the recommendation to carry these documented gaps into the handoff. The observation ticket is therefore resolved for this study; every gap remains unverified follow-up work. Recommendations here are not an implementation decision.
