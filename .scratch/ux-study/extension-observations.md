# Chrome extension UX observations

Recorded 2026-10-07 for [Observe Chrome popup and options flows](issues/04-observe-extension-ux.md). This resolves the observation frontier. Recommendations remain proposals for the later user decisions.

The extension has two substantially different interfaces to the same state. The most consequential defect is that changing an unrelated preference in an already-open options page can silently re-enable Auto Sync after the popup disabled it. Options also exposes ineffective preferences, an unstyled relay editor and incomplete Pairing feedback. The actual toolbar popup reproduces several shared UI problems found in Electron, particularly hidden keyboard navigation and overlapping recovery notices.

## Evidence and isolation

- [Screenshot gallery](extension-evidence/index.html), [evidence ledger](extension-evidence/evidence.jsonl), [raw geometry](extension-evidence/observations.jsonl), [interaction trace](extension-evidence/trace.jsonl), [reproduction notes](extension-evidence/README.md).
- [Source/build receipt](extension-evidence/source-build-receipt.json), [environment](extension-evidence/environment.json), [zoom recapture environment](extension-evidence/zoom-environment.json), [synthetic public fixtures](extension-evidence/fixtures.json).
- Client HEAD `a2e1a64cad05eadb7c567b48e3ec45ce7cd51e33`. Build `CLIPP_RELAY_ACCEPTANCE_TRANSPORT=wss npm --workspace apps/extension run build:relay-acceptance` passed. All 145 inventory source hashes still matched. Production source, JavaScript and CSS were unchanged; existing managed-relay-auth edits were preserved.
- Google Chrome for Testing **143.0.7499.4**, Darwin **25.4.0**, arm64. One display reports **1512×982 DIP**, available area **1512×949**, native DPR **2**. This is the tested browser version, not a claim about the latest Chrome or every supported version. Hardware panel resolution was not independently measured.
- Two disposable profiles and copied unpacked builds were used. Popup/options/offscreen clipboard APIs were replaced with memory before app code ran. Relays started empty and the build's relay-only gate isolated direct networking. No operator identity, membership, relay credentials or clipboard contents were used. Both owned browsers closed successfully.
- **94 captures:** 36 native-isolated observations and 58 rendered-fixture observations. The native stage used real extension/background behavior with synthetic local text; failure fixtures later replaced UI message responses, leaving production rendering intact. A rendered-fixture record is evidence of UI behavior, not actual storage failure, Pairing, account login or transport success.
- The popup was opened through Chrome's extension action API. `chrome.runtime.getContexts` identified it as **POPUP**, with no normal tab ID. All popup captures therefore use the actual toolbar host, including fixture captures. No popup-as-tab surrogate is used to establish host behavior.

Debugger attachment keeps this Chrome popup alive when focus moves away. Lifecycle observations detached the debugger first, clicked the options page, verified that POPUP contexts became empty, then reopened it. Earlier attached click-away probes are not evidence of normal dismissal.

Playwright's zoomed options screenshots cropped the surface incorrectly, sometimes to a blank image. Use the replacement `options-zoom-cdp-*` captures from Chrome's direct screenshot API; they contain the complete 2200×1466 pixel viewport at all four zoom settings. Earlier affected images remain in the raw record and are marked unsuitable in the gallery/ledger. One intermediate QR capture was mislabeled as a failure after the failure seam had been removed; the annotation excludes it from that claim. The verified error capture is linked below.

## Size, zoom and space measurements

All dimensions are CSS px unless marked otherwise. A smaller browser window did not make the toolbar popup shorter on this display.

| Case | Actual content viewport | Result |
| --- | --- | --- |
| Real toolbar popup, normal browser | **480×600**, DPR 2 | Requested document height/min-height is 800, but Chrome grants 600. Shared shell uses 600px `100vh`. |
| Popup from 520×440 outer browser | **480×600**, DPR 2 | Host can extend beyond the browser's content window; do not assume popup height equals tab height. |
| Options, normal 1100×820 outer window | **1100×733**, DPR 2 | Browser chrome consumes 87px vertically. |
| Options, short 520×440 outer window | **520×353**, DPR 2 | Document scroll reaches lower sections. |
| Options, maximized 1512×949 outer window | **1512×862**, DPR 2 | Content remains a centered 672px column. |
| Options, Chrome API reports fullscreen | **1100×820**, DPR 2 | Browser chrome disappears, but observed bounds remain 1100×820. This is not evidence of filling the 1512×982 display. |
| Options, controlled viewport matrix | **480×640, 768×800, 1024×768, 1440×900, 1920×1080** | Playwright viewport emulation reports DPR 1. Typical content remains within horizontal bounds; settings remain reachable by document scroll. |
| Options, 320px reflow fixture | **320×640**, DPR 1 | Typical content has no horizontal document overflow; dense relay names are a separate failure. |
| Native tab zoom 100%, 125%, 150%, 200% | **1100×733, 880×586, 733×488, 550×366** | DPR becomes 2, 2.5, 3, 4 on the same DPR 2 display. Settings remain reachable at 200%. |
| Popup after those tab zoom changes | **480×600**, DPR 2 throughout | Tab zoom does not enlarge the popup. This does not qualify popup accessibility at enlarged UI scaling. |

At 480×600, the popup header consumes 72px, the history toolbar is 78px high, and history starts at y=199. The history scroller is 414×328 with 160px cards: **one complete Clip and most of the next**. Counts account for clipping by ancestors, not just the viewport. The last Clip and Copy button can be reached by scrolling.

The empty popup drawer has 617px of content in a 596px client area and scrolls to the final controls. The dense fixture has **3079px** of content there. Options with three devices and 12 Clips is 966px high. With 20 devices, seven relays, 200 Clips and concurrent Pairing states, its Settings heading reaches **y=2276**; the full page is 2526px high and a long relay name makes it **2118px wide at a 480px viewport**.

The 800px popup document request creates an outer height/scrollbar mismatch, but the measurements **do not support** claiming that its bottom 200px of controls are inherently inaccessible. Drawer and history scrolling work. Fix the sizing contract while preserving that working reachability.

## Findings

Priorities are provisional. **High** changes behavior unexpectedly, blocks a task or obscures material feedback. **Medium** adds confusion, work or space cost. Each expected result is a proposed acceptance criterion, not an accepted redesign.

### C01 — A stale options page silently re-enables Auto Sync · High

**Native-isolated, options 1100×733 and popup 480×600, 100%, DPR 2.** Open options with Auto-sync enabled. Disable Auto Sync through the popup drawer. Close the popup normally: stored state is false, while options still displays a checked box. Change Expiry to 7 in options. The real stored Auto Sync becomes true. The handler sends the entire stale settings object; options only applies relay fields from runtime updates.

Expected: an unrelated preference cannot overwrite a newer Auto Sync choice; every open surface reflects authoritative state. Propose field-level writes plus a shared preference subscription and acknowledged results. This affects the user's control over automatic sharing, beyond a cosmetic stale checkbox. [Stale display](extension-evidence/options-native-stale-autosync.png), [overwrite](extension-evidence/options-native-stale-overwrite.png), trace `staleBeforeChange` / `staleAfterChange`; [options subscription and writes](../../apps/extension/src/options.tsx), lines 68–86 and 134–139. **Confidence: observed native behavior.**

### C02 — Expiry and type preferences promise behavior they do not control · High

**Native-isolated, options 1100×733, 100%.** Uncheck Text, then capture synthetic text through the real background path: the Clip is still stored. Set Expiry to 7 days, then capture another Clip: `shareExpiresAt - capturedAt` is **86400000ms**, while `localRetentionMs` remains **2592000000ms** (30 days). The preference values save, but neither changes the behavior implied by these labels. Images and Files are also exposed despite the current text/URL Clip model.

Expected: controls correspond to supported capabilities, and local retention is distinguished from the accepted 24-hour sharing lifetime. Propose removing or replacing these legacy controls after the control decision; do not silently reinterpret Expiry as either lifetime. [Text disabled but captured](extension-evidence/options-native-types-off.png), trace `expiryNativeClip` / `settingsAfterInertChange`; [background settings](../../apps/extension/src/background.ts), lines 1241–1335, and [Clip type](../../packages/ui/src/types.ts), lines 1–8. **Confidence: native text/expiry observation plus source-supported unsupported-type gap.**

### C03 — Options relay controls lose styling and overflow with long names · High

**Native editor at 1100×733; dense fixture at 480×640.** Choose Add relay in options. Labels, inputs and actions look like plain inline text; Save and Cancel run together. Populated rows render strings such as `Manage accountRetryEditRemove`. The emitted options stylesheet has 116 top-level rules and no `.managed-relay` or `.relay-settings` rules. A 236-character unbroken name extends document width to 2118px; its end is offscreen.

Expected: relay controls use the same distinguishable field/button states across surfaces, long content wraps or has an accessible disclosure, and the document fits the viewport. Import the shared component's required styling without accidentally restyling the entire options page. [Native editor](extension-evidence/options-native-relay-editor.png), [native validation](extension-evidence/options-native-relay-invalid.png), [long relay](extension-evidence/options-fixture-long-relay-name.png), [popup comparison](extension-evidence/popup-fixture-dense-relays.png); [direct component import](../../apps/extension/src/options.tsx), line 9, [component classes](../../packages/ui/src/ManagedRelaySettings.tsx), [stylesheet receipt](extension-evidence/source-build-receipt.json). **Confidence: observed native rendering, emitted CSS and fixture geometry.**

### C04 — Popup recovery notices overlap the header and history · High

**Native clipboard-denial boundary and rendered recovery fixtures, 480×600.** Invoke Share Now with the memory clipboard rejecting with `NotAllowedError`. The error row receives only 17px at y=72 although its content needs more height; the sticky header and history panel cover text and part of Retry. A single identity-recovery notice reproduces this. A separately labelled adversarial stack demonstrates overlapping messages, without asserting that all injected errors arise together natively.

Expected: complete notice text and actions occupy reserved space and remain usable. Propose an explicit notice region with measured wrapping/scroll ownership. [Share Now denial](extension-evidence/popup-native-share-denied.png), [single recovery](extension-evidence/popup-fixture-recovery.png), [adversarial stack](extension-evidence/popup-fixture-stacked-recovery.png); [shell rows](../../packages/ui/src/styles.css), lines 57–93, [banners](../../packages/ui/src/ClipboardApp.tsx), lines 1628–1718. This confirms the shared Electron finding in the actual Chrome popup. **Confidence: observed UI, not an OS permission-prompt test.**

### C05 — Theme controls are ineffective and some fields become unreadable · High

**Native popup/options plus dark-media fixture.** Popup Auto Sync and retention selects use `rgb(226,226,231)` on white: calculated contrast **1.29:1**, with 16px-high control boxes. The popup theme icon has no click handler. Options' Toggle Dark Mode toggles a `dark` class, while its compiled CSS uses the system media query instead. The button changes no relevant card colors. Simulating system dark mode gives device/history cards black text on `rgb(31,41,55)`, **1.43:1**, against a still-white page.

Expected: the selected theme controls all surfaces consistently, text/fields remain legible and controls meet the study's chosen accessibility criteria. Decide whether to implement or retire the inert toggles; define shared field/theme tokens. [Popup selects](extension-evidence/popup-fixture-select-contrast.png), [options system-dark fixture](extension-evidence/options-fixture-system-dark.png), [native toggle](extension-evidence/options-native-dark-toggle.png); [popup toggle](../../packages/ui/src/ClipboardApp.tsx), line 1622, [options toggle](../../apps/extension/src/options.tsx), [compiled Tailwind source](../../apps/extension/src/styles/tailwind-built.css). **Confidence: observed rendering/computed styles and source; system dark mode was emulated.**

### C06 — The only popup navigation entry is absent from the keyboard sequence · High

**Actual popup host, fixture state, 480×600.** Press Tab from the document: focus first reaches the inert theme button. The logo that opens navigation is a `DIV`, `tabIndex=-1`, with no role. Keyboard users lack the route to Pairing, approvals, identity naming, relays and preferences. QR opens with focus on the body rather than its dialog; an in-document Escape check leaves it open.

Expected: a named button opens navigation by keyboard, modal focus moves inside and returns on close. Give dialogs an explicit focus/keyboard contract. Native Escape dismissal cannot be inferred from the attached-debugger check; Chrome may close the whole popup when uninspected. [QR focus capture](extension-evidence/popup-fixture-qr-keyboard.png), trace `popupFirstTab`, `logo`, `qrFocusOnOpen`, `qrAfterEscape`; [navigation logo](../../packages/ui/src/ClipboardApp.tsx), line 1591, [QR portal](../../packages/ui/src/ClipboardApp.tsx), line 1981. **Confidence: observed document behavior plus source; native Escape lifecycle remains a gap.**

### C07 — Pairing failures are presented as success or silently discarded · High

**Native invalid input in options; mocked action rejection in both surfaces.** Paste `not-a-pairing-target` through options: it displays green `QR scanned` without reporting invalidity. With a valid generated pairing target and a rejected `pairDevice` response, options keeps the same green status. In the popup, rejected valid text is cleared with no visible error. Rejecting `respondTrust` after Accept leaves the request in place with no explanation or retry state.

Expected: distinguish payload read, validation, request sent, waiting, accepted and failure. Retain recoverable input; show a useful retry path and prevent ambiguous repeated submissions. [Native invalid paste](extension-evidence/options-native-invalid-paste.png), [options failed Pairing](extension-evidence/options-fixture-pair-failure.png), [popup failed submission](extension-evidence/popup-fixture-pair-failure.png), [failed Accept](extension-evidence/popup-fixture-visible-accept-failure.png); [options scan](../../apps/extension/src/options.tsx), lines 93–105, [popup callbacks](../../apps/extension/src/popup.tsx), lines 265–274 and 356–389, [input cleared on submit](../../packages/ui/src/ClipboardApp.tsx), line 858. **Confidence: observed native validation wording and response-seam failure UI.**

### C08 — Failed QR generation leaves a misleading Hide control in options · Medium

**Options fixture, 480×640.** Return no pairing target, then choose Generate My QR. The button changes to Hide My QR, with no image, loading explanation, failure or retry. The popup's equivalent renders “Unable to create a pairing QR code,” providing a useful comparison.

Expected: visible loading/result/error state shared across both entry points, with retry available. [Options blank result](extension-evidence/options-fixture-qr-failure.png), [verified popup error](extension-evidence/popup-fixture-qr-error-verified.png); [options QR generation/toggle](../../apps/extension/src/options.tsx), lines 110–121 and 167–173. **Confidence: observed response-seam rendering.**

### C09 — Options history stays stale after Clear and violates its active search · High

**Native-isolated, options 1100×733 and real popup.** Populate history, leave options open, then use popup More → Clear. Real history has zero Clips, but options still shows old rows until reloaded. Separately, enter an unmatched query in options and capture unrelated text: the new Clip appears in the filtered view. The component only listens for `newClip`, prepending it without applying the query; it does not reconcile removal/clear state.

Expected: all surfaces agree on current history and maintain the active filter. Subscribe to authoritative changes and derive results from current query/state. [Stale cleared rows](extension-evidence/options-native-stale-history.png), [after reload](extension-evidence/options-native-clear-after-reload.png), [nonmatching arrival](extension-evidence/options-native-search-newclip.png); [history component](../../apps/extension/src/components/ClipHistoryList.tsx), lines 8–41. **Confidence: observed native behavior.**

### C10 — Rejected settings appear saved · High

**Native validation at a controlled 480×640 viewport; fixture storage rejection.** Enter Expiry 0. The real background rejects it, but options retains 0 without explaining the failure; stored Expiry remains 7. A rejected Auto Sync save similarly leaves the new checkbox value visible while the fixture's authoritative state stays unchanged. The current handler does not consume a response.

Expected: validate before submission, acknowledge successful saves, and restore or mark unsaved values on rejection. A subsequent unrelated change should not keep resending an invalid setting. [Native invalid preference](extension-evidence/options-native-invalid-settings.png), [failed Auto Sync save](extension-evidence/options-fixture-setting-save-failure.png), trace `invalidExpiry` / `settingSaveFailure`; [options write handler](../../apps/extension/src/options.tsx), line 134, [background validation](../../apps/extension/src/background.ts), line 1269. **Confidence: native validation and mocked persistence rejection.**

### C11 — Essential controls are split across surfaces without a visible handoff · High

**Actual popup and options; source-confirmed inventories.** Popup search is always hidden at its 480px host width. Options has search, but its history has no Copy, Pin, Delete or Clear controls. Options also has no incoming approvals, local identity/alias editing, actual local-retention control or recovery notices. A pending request is invisible in the popup's closed navigation, and options cannot approve it. No in-app options link exists in the popup; Chrome's extension context-menu route is separate host UI.

Expected: each surface has an explicit role, and users can continue a task in the appropriate persistent surface while retaining context. Decide the minimum daily popup controls and the complete management surface; do not blindly duplicate every control. [Pending hidden](extension-evidence/popup-fixture-pending-hidden.png), [options during recovery](extension-evidence/options-fixture-recovery-invisible.png), [options history](extension-evidence/options-fixture-480x640.png); [popup search rule](../../packages/ui/src/styles.css), line 1455, [options](../../apps/extension/src/options.tsx), [history actions](../../apps/extension/src/components/ClipHistoryList.tsx). **Confidence: observed rendering and source coverage.**

### C12 — Popup dismissal loses relay drafts · Medium

**Native-isolated, 480×600.** Open navigation → Add relay, type a name, detach the inspection debugger, click the options tab, confirm POPUP context is gone, then reopen. The editor/draft is gone. This is normal Chrome popup lifetime exposing a product-flow mismatch: longer configuration work lives in a transient host.

Expected: either retain recoverable drafts or send long configuration work to a persistent, styled editor. Provide a visible route there. [Draft](extension-evidence/popup-native-unsaved-draft.png), [after reopening](extension-evidence/popup-native-draft-lost.png), trace `popupClosedContexts` / `editorAfterReopen`; [local editor state](../../packages/ui/src/ManagedRelaySettings.tsx), lines 36–44. **Confidence: observed native dismissal with inspection detached.**

### C13 — Popup history uses most space for chrome and fixed card structure · Medium

**Native local history and 12/200-Clip fixtures, 480×600.** Only one complete Clip fits initially in a 328px history scroller. Each 160px card repeats source/location/date/type and has substantial spacing even for a one-line note. Two long Clips with different tails have indistinguishable truncated previews; there is no full-content inspector. Options uses shorter rows and a 256px nested list, but removes actions and still limits text previews to 200 characters (full text is available only through a native title tooltip).

Expected: compact repeated use should preserve Copy, distinguishing content and accessible full inspection. Compare a compact row or adjustable density with the existing card treatment; measure useful Clips per viewport rather than selecting a style now. [Popup](extension-evidence/popup-native-populated.png), [last Clip reachable](extension-evidence/popup-fixture-last-clip.png), [options rows](extension-evidence/options-fixture-480x640.png); [shared card](../../packages/ui/src/ClipboardApp.tsx), line 1866, [160px styling](../../packages/ui/src/styles.css), line 1126, [options preview](../../apps/extension/src/components/ClipHistoryList.tsx). **Confidence: observed geometry and source-supported inspection gap.**

### C14 — Dense management lists bury frequent preferences · Medium

**Dense public fixture, popup 480×600/options 480×640.** Four incoming requests, four waiting requests, one Pairing error, 20 devices and seven relay states produce 3079px of drawer content before the final preferences. Options places the Settings heading at y=2276. A single long relay name/endpoint takes much of a popup viewport. Raw waiting Peer IDs overflow their text boxes and are clipped by the drawer; the 418px scroll extent is not evidence that relay buttons are lost. The relay actions wrap and the final selects remain reachable.

Expected: routine preferences and actionable approvals should be directly reachable without traversing every diagnostic/detail row. Consider separate management sections, collapsed details, constrained labels with disclosure and a persistent everyday control area. [Drawer bottom](extension-evidence/popup-fixture-dense-bottom.png), [long relay](extension-evidence/popup-fixture-dense-relays.png), [raw identifiers](extension-evidence/popup-fixture-pending-overflow.png), [options bottom](extension-evidence/options-fixture-dense-bottom.png); [navigation order](../../packages/ui/src/ClipboardApp.tsx), lines 1114–1460, [options section order](../../apps/extension/src/options.tsx). **Confidence: observed fixture geometry; not a claim that scrolling is trapped.**

### C15 — Styling and terminology diverge beyond useful runtime adaptation · Medium

**Native empty/ordinary surfaces and controlled wide options.** Popup is branded Clipp, uses Roboto, dark rounded surfaces and purple actions; options says “Clipboard Share – Settings,” uses system/Inter fallback, white space, blue full-width actions and unstyled relay text. “Peers”/“Connected devices” versus “Trusted Devices,” “Show my QR” versus “Generate My QR,” and “Auto Sync” versus “Auto-sync” describe overlapping tasks differently. At 1920px, options keeps a 672px column (35% of width), yet device labels are capped at 140px and history at 256px high.

Expected: common language, semantic colors, fields and status treatment, with deliberate runtime-specific layout. The wide column itself is not a defect; reassess truncation and fixed list height before merely stretching the form. [Native popup](extension-evidence/popup-native-empty.png), [native options](extension-evidence/options-native-empty.png), [wide options](extension-evidence/options-fixture-1920x1080.png); [options layout](../../apps/extension/src/options.tsx), line 152, [device label cap](../../apps/extension/src/components/DeviceList.tsx). **Confidence: observed styling/layout; preferred organization remains a user decision.**

### C16 — Automatic clipboard-read failure has no visible recovery context · Medium

**Clipboard boundary fixture, popup 480×600.** Make the guarded clipboard reject, then dispatch the focus event used for automatic local capture. The failure is swallowed and no capture/permission notice appears. Explicit Share Now does report the read failure, although its banner has the layout defect above. The options scanner also has its own separate browser-alert error path in source.

Expected: users who cannot capture should have a discoverable, consistent explanation and a deliberate retry action; avoid repetitive alerts on every focus. Clarify the status of local capture separately from network connectivity. [Focus denial](extension-evidence/popup-fixture-focus-read-denied.png), [explicit failure](extension-evidence/popup-native-share-denied.png); [focus capture catch](../../apps/extension/src/popup.tsx), lines 161–178, [scanner clipboard errors](../../apps/extension/src/components/QRScanner.tsx). **Confidence: observed boundary-seam behavior; real permission prompts were not exercised.**

## Controls and flows that held up

- Native QR generation worked in both surfaces. The popup QR fits its host, and its error response has a visible message.
- Native synthetic Share Now stored the requested text. Pin worked. Clear removed real synthetic history; its scope/confirmation remains the shared control decision described in the Electron/inventory findings.
- Real popup drawer scrolling reaches retention/Auto Sync; history scrolling reaches the final Clip. Long popup relay actions wrap, including Log in, Manage account, Edit and Remove.
- Options exposes a Revoke confirmation and a Retry control on simulated rejection. This does not qualify real revocation persistence.
- Typical options reflows at 320px and keeps lower preferences reachable at 200% native tab zoom. Use the direct-CDP replacement screenshots for the latter visual check.
- Chrome loaded the external icon/font resources in this run. The Electron cold-font failure remains valid evidence of a separate condition; this run does not establish offline Chrome resilience.

## Decision handoff and remaining gaps

[Decide missing controls and obsolete entry points](issues/06-decide-control-gaps-and-retirements.md) should use C01/C02/C07–C12/C16 to settle surface roles, preference contracts, Pairing feedback, visible navigation and removal/replacement of ineffective controls. The manual new-identity request remains the distinct Identity Rotation lifecycle decision already identified in the inventory; no new destructive operation was introduced. The macOS Configure Relays tray item is covered by Electron evidence, not this browser frontier.

[Decide visual consistency and efficient layout](issues/07-decide-layout-and-visual-direction.md) should use C03–C06/C13–C15 to choose shared tokens, responsive notices, keyboard contracts, density and settings organization. Recommendations here follow the user's shared-styling/adapted-layout and compact-daily-use preferences, but are not accepted decisions.

Unrun native cases remain explicit: OS notification delivery/click, native clipboard permission prompts and OS clipboard writes, real two-device Pairing and relay authentication handoffs, service-worker suspension/restart, physical non-Retina or small work-area displays, OS text scaling, and enlarged popup UI independent of tab zoom. Chrome reported fullscreen but did not expand the measured window to the display bounds; true display-filling fullscreen remains unqualified. The notification source opens a popup without selecting the hidden approval drawer, but that native notification journey was not claimed as exercised. Existing content-script and restart-recapture tickets retain their scope.

The next frontier is [Observe Android layouts and native interactions](issues/05-observe-android-ux.md). The control/layout decision tickets still await its evidence and their required exchange with the user.


## Native image-import continuation

The [sign-in-free follow-up](sign-in-free-journeys.md#native-chrome-qr-import-hidden-connection-failure) completes actual native QR image selection/decoding. The real request fails because the browser connection gater rejects the target addresses; options retains green QR-scanned feedback with no failure. This strengthens C07. The connection policy remains intact, Electron receives no request and successful remote Pairing/notification routes remain unverified.

## Coordinated native clipboard continuation

The [native clipboard results](sign-in-free-journeys.md#coordinated-native-clipboard-results) qualify retained-Clip Copy through the real popup/offscreen path, with the system value independently verified. Share Now/Retry hit the browser's Document is not focused enforcement during CUA input; no OS denial or successful native read recovery is claimed. With one Clip, the actual error occupied 152px of the 495×600 popup with complete text/Retry visible; it does not reproduce C04's dense-history 17px overlap and adds sparse-content space evidence. All gates are off and the browser closed normally. QR clipboard paths and deliberate denial/regrant remain unverified.

## Native display and accessibility continuation

The [display/accessibility follow-up](display-accessibility-observations.md) adds focused native Tab traversal confirming C06 and actual OS display scaling. A freshly reopened popup shrinks to 495×559 at 1024×665, yet the final Auto Sync control remains reachable by keyboard scrolling. A popup opened from Chrome fullscreen at 1800×1169 remains 495×600. Native zoom shortcuts did not enlarge the popup; the underlying options page instead showed increased zoom. The separate default-font-32 attempt lacks a reliable popup capture and remains unverified. Native fullscreen bounds are preserved without claiming full-display coverage. All global display settings are restored, owned hosts closed and remaining prerequisites explicit.
