# Electron UX observations

Recorded 2026-10-07 for [Observe Electron flows across window sizes](issues/03-observe-electron-ux.md). This is the Electron evidence input to the later control and layout decisions. Recommendations below are proposals, not approved implementation.

Electron has reproducible failures in responsive navigation, retained form state, recovery notices, keyboard access and enlarged layouts. The strongest new finding is that ordinary history/recovery notices can overlap the main content and lose their clickable recovery action. Several daily-use controls also depend on discovering an unlabelled, pointer-only logo.

## Evidence and scope

- [Screenshot gallery](electron-evidence/index.html), [normalized evidence ledger](electron-evidence/evidence.jsonl), [raw capture measurements](electron-evidence/observations.jsonl), [interaction trace](electron-evidence/trace.jsonl).
- [Environment](electron-evidence/environment.json), [source/build receipt](electron-evidence/source-build-receipt.json), [public synthetic fixtures](electron-evidence/fixture-public.json), [reproduction notes](electron-evidence/README.md).
- Fresh build: `npm --workspace apps/electron run build`, passed. Client HEAD `a2e1a64cad05eadb7c567b48e3ec45ce7cd51e33`. All 145 inventory source hashes still matched after observation. The receipt records the current full tracked diff and generated bundle hashes; existing managed-relay-auth work was preserved.
- Actual Electron 43.4.0 / Chromium 150.0.7871.224, macOS 26.4.1 arm64, one Retina display. Native display bounds 1512×982 DIP; available work area 1512×949 DIP; scale factor 2. Native screenshot pixel dimensions are recorded separately. The physical panel's hardware resolution was not independently measured.
- New temporary profile, empty managed relays, relay-only isolation, native clipboard reads/writes replaced with memory. Native local capture, retained Copy, QR generation, invalid relay validation and tray callbacks were exercised. No operator clipboard, identity, membership or credentials were used. The owned app closed successfully.
- 76 captured observations: eight `native-isolated`, 68 `rendered-fixture`. Populated/pending/error states used the real built renderer and native window with a synthetic public IPC state/action seam. They demonstrate UI behavior, not actual pairing, storage failure, auth or transfer success.
- The app's external Google font stylesheet failed with `net::ERR_SOCKET_NOT_CONNECTED`. Native captures show that failure. For the remaining layout study, the same upstream font assets were fetched separately and supplied by request interception, with source URLs and hashes retained. No app CSS was changed. These captures remain labelled `rendered-fixture`, including those whose underlying action used native code.

The study uses the user's preference for shared styling with adapted layouts and simple defaults with compact daily use. Confidence is **observed** for the listed rendering/action result; backend behavior outside the stated seam remains unverified.

## Window and density measurements

Dimensions below are renderer CSS px at 100% zoom. Card counts account for clipping by scrolling ancestors; an earlier raw `dom.fullyVisibleCards` counter checked the viewport only and overcounted some clipped bottom rows. Use `geometry.visibility.fullCards` in the later `measured-*` records.

| Case                  | Native outer window | Renderer | Fully visible Clips   | Observation                                                           |
| --------------------- | ------------------- | -------- | --------------------- | --------------------------------------------------------------------- |
| Minimum               | 480×640             | 480×608  | 2, plus part of one   | Search absent; header actions wrap                                    |
| Default               | 520×760             | 520×728  | 3                     | Search absent; settings behind logo                                   |
| Search first appears  | 601×760             | 601×728  | 2, plus part of one   | Subtitle wraps; extra header height and padding reduce useful history |
| Ordinary wider        | 800×760             | 800×728  | 6                     | Two columns; search available                                         |
| Sidebar first appears | 1101×760            | 1101×728 | 6, plus part of two   | 260px sidebar; ordinary device labels become abbreviated              |
| Wide restored         | 1440×900            | 1440×868 | 9, plus part of three | Expanded filters; three columns                                       |
| Maximized             | 1512×949            | 1512×917 | 12                    | Four columns; 160px cards occupy ~216px grid tracks                   |
| Native fullscreen     | 1512×949            | 1512×949 | 12                    | Four columns; 160px cards occupy 227px grid tracks                    |

Also captured: short wide 1200×608 content; 1280×720 outer; widths 599/600/601, 899/900/901 and 1099/1100/1101; heights 759/760/761. The three height captures confirmed automatic filter expansion at 760 when the user has not explicitly toggled it. All these were windows on the same display, **not** simulated claims of different monitor work areas.

Page zoom 125%, 150% and 200% was measured. At 640×728 native content and 200% zoom, the renderer is 320×364 CSS px with DPR 4, while the native display remains scale 2. Collapsed filters leave a 254×57 history scroller whose content is 268px wide. No complete Clip or Copy action is visible initially. At the native minimum and 200%, the renderer is 240×304, below the chosen 320px reflow criterion; that is a separate stress case.

Playwright's zoomed screenshots cropped the rendered content incorrectly in this environment. The zoom findings use DOM geometry and the replacement **native** captures [320px reflow](electron-evidence/native-reflow-320-collapsed.png), [expanded filters](electron-evidence/native-capture-reflow-320.png) and [minimum at 200%](electron-evidence/native-capture-minimum-zoom2.png). Earlier zoom screenshots remain in the raw ledger, labelled in the gallery as unsuitable for judging the whole viewport.

## Findings

Priority is provisional: **High** blocks a task, loses work or hides material recovery; **Medium** adds confusion, effort or inconsistency. Each reproduction starts with the fixture and size stated. Source links identify the current implementation; detailed line anchors also remain in the [source inventory](flow-control-inventory.md).

### E01 — Missing external font breaks icons and hit targets · High

**Native, empty/local history, 520×728, 100%, DPR 2.** Launch with the Google stylesheet unavailable, capture one Clip, then try Pin. Icon ligatures appear literally as `dark_mode`, `push_pin`, `more_vert` and `content_copy`. The header text crosses its edge, and the More icon's text intercepts the Pin button's pointer target. The automation retried Pin for 30 seconds and timed out; after supplying the intended font, Pin succeeded.

Expected: essential icons and controls work without a successful third-party font request. This is an observed network-failure mode, not evidence that every normally connected installation always renders this way. Propose packaging essential icons/fonts and verifying a cold offline launch. [Native failure](electron-evidence/native-font-failure-pin-overlap.png), [loaded comparison](electron-evidence/loaded-fonts-default.png); [external import and icon styles](../../packages/ui/src/styles.css), lines 1 and 220.

### E02 — Recovery banners overlap content and hide Retry · High

**Rendered failure fixtures, 520×728, 100%.** Inject cleanup failure, capture failure, rotation recovery or rotation notice with populated history. A single notice receives only a 17px-high grid box at y=62; the main content also begins at y=62. Cleanup Retry's center hit-test returns the main element rather than the button. Stacking recovery, capture and cleanup notices makes the first notice overlap the second. Retained Copy failure and partial-success notices show the same shell defect.

Expected: each notice occupies its own row, its complete explanation and action remain visible and pointer/keyboard reachable. Propose a dedicated notice region with intentional scroll/space behavior, preserving useful history. [Cleanup](electron-evidence/measured-cleanup-banner.png), [stacked notices](electron-evidence/banner-stacked.png), [Copy failure](electron-evidence/copy-failure-banner.png); [shell grid](../../packages/ui/src/styles.css), lines 58–70, and [conditional banners](../../packages/ui/src/ClipboardApp.tsx), lines 1628–1718. Initialization failure has a separate grid class and rendered correctly in its seam test; do not generalize that pass to native bootstrap recovery.

### E03 — Exactly 1100px has no settings navigation · High

**Typical fixture, restored content 1099/1100/1101×728.** At 1100 the sidebar is hidden, but clicking the logo opens no drawer. At 1099 it opens; at 1101 the sidebar appears. Identity, pairing, approvals and preferences are therefore inaccessible at that exact width.

Expected: one usable navigation route at every width. Use one shared boundary/visibility contract. [1100px](electron-evidence/sizing-1100.png), adjacent [1099](electron-evidence/sizing-1099.png) / [1101](electron-evidence/sizing-1101.png), interaction trace `exact1100Drawer: 0`; [JavaScript threshold](../../packages/ui/src/ClipboardApp.tsx), line 455, versus [CSS media query](../../packages/ui/src/styles.css), line 1474.

### E04 — Narrowing hides an active search and its escape route · High

**Typical fixture, 800×728 → 520×728.** Search for `NO_MATCH_9f69e62`, then narrow the window. Search disappears at ≤600px but continues filtering. The user sees “No clips yet. Copy something!” with no visible query or clear-search action. Even without an active query, search is unavailable in the default Electron window.

Expected: search remains available, active filters are visible and removable, and no-results wording distinguishes filtered results from empty storage. [Before](electron-evidence/search-no-results.png), [after](electron-evidence/search-hidden-active.png); [search/filter state and empty message](../../packages/ui/src/ClipboardApp.tsx), [600px rule](../../packages/ui/src/styles.css), line 1455. Reorganize search as a daily control rather than remove it to gain width.

### E05 — Opening the sidebar layout discards a relay draft · High

**Typical fixture, 520×728 → 1101×728.** Open logo → Add relay, enter a name and endpoint, then widen the window. The drawer closes, the visible relay editor disappears, and its unsaved fields are gone. The two nav instances own separate `ManagedRelaySettings` component state.

Expected: resizing preserves the user's draft, validation and editing context. [Before](electron-evidence/relay-draft-before-resize.png), [after](electron-evidence/relay-draft-after-resize.png); [editor state](../../packages/ui/src/ManagedRelaySettings.tsx), lines 36–44, and [drawer/side nav rendering](../../packages/ui/src/ClipboardApp.tsx). Move draft ownership above the responsive presentation or keep a single editor instance.

### E06 — Navigation and dialogs lack keyboard behavior · High

**Default window, typical fixture and real QR generation.** The only narrow navigation trigger is a clickable logo `div` with no role and `tabIndex=-1`; it is absent from the Tab sequence. Opening QR does not place focus reliably into the dialog; tabbing passes Close and Copy pairing text into background controls. Escape leaves the QR dialog open. Escape also leaves the source menu open.

Expected: a labelled keyboard-operable settings/navigation button; focus moves into a modal, remains there, Escape closes it and focus returns to the invoker. [QR at minimum](electron-evidence/qr-minimum.png), trace `logo`, `qrFocus` and `qrEscapeStillOpen`; [logo](../../packages/ui/src/ClipboardApp.tsx), line 1590, [QR portal](../../packages/ui/src/ClipboardApp.tsx), line 1980. Pairing text copy was not sent to the system clipboard.

### E07 — Enlarged UI spends almost all height on chrome · High

**Typical fixture, 640×728 native content, 200% zoom → 320×364 CSS px.** With filters collapsed, the title/header/actions push history to y=234 and leave 57px. The history scroller also needs horizontal scrolling because its minimum card is 260px plus padding. With filters expanded, they consume the remaining usable space. This is a control-organization problem as well as a fixed-minimum-width problem.

Expected: at the chosen 320px criterion, a Clip and its actions can be reached without simultaneous horizontal and vertical hunting. Propose a compact header and a history layout that can shrink, with filters in an accessible secondary surface. [Native complete-viewport capture](electron-evidence/native-reflow-320-collapsed.png); [grid minimum/card height](../../packages/ui/src/styles.css), lines 1080 and 1143. Page zoom is not an OS text-size test.

### E08 — History cannot reveal the full Clip before copying · Medium

**Typical fixture, default and fullscreen.** Two Clips share their first 220 characters and differ afterward; previews are indistinguishable. Long URLs and unbroken strings truncate. The only card actions are Pin, More→Delete and Copy; there is no inspect/expand/open control. Multiline content also loses its line layout in the preview. Native retained Copy worked with complete synthetic content, but that does not provide inspection before choosing it.

Expected: a deliberate way to inspect full content without replacing the clipboard. Keep previews compact and add an accessible detail route. [Default](electron-evidence/sizing-default.png), [fullscreen](electron-evidence/measured-fullscreen.png); [220-character truncation](../../packages/ui/src/ClipboardApp.tsx), line 61, and history rendering around line 1919. This is a missing user control, separate from changing Clip semantics.

### E09 — Clear's visual context understates its scope · High

**Typical fixture, 800×728.** Search `shopping` so two of twelve Clips are visible; expand filters and click Clear. All twelve fixture Clips disappear, including pinned/out-of-view records, without confirmation or undo. The mock recorded the real UI's unscoped `clearHistory` invocation; production scope is confirmed by the inventory.

Expected: the label and interaction communicate the affected set before deletion. Decide between explicitly named Clear all history and a separately defined filtered deletion; preserve intended retention semantics. [Before](electron-evidence/filtered-before-clear.png), [after](electron-evidence/filtered-after-clear.png); [clear handler](../../packages/ui/src/ClipboardApp.tsx), line 594, [Electron handler](../../apps/electron/src/main.ts), around line 1224. No operator data was deleted.

### E10 — Configure Relays duplicates Open Clipp · Medium

**Native menu callbacks, default window, drawer closed.** Invoking the actual tray menu item's callback opens/focuses history without navigating to relays or opening the drawer. Open Clipp has the same destination. Thus the current command label promises a destination it does not deliver; relay configuration itself remains useful.

Expected: either redirect to relay settings or remove/rename the duplicate entry. The later control decision should choose which. [Destination](electron-evidence/native-tray-configure-relays.png), interaction trace of native menu items; [tray construction](../../apps/electron/src/main.ts), around line 894. The native popup was not clicked through OS accessibility; its actual constructed MenuItem callback was invoked.

### E11 — Failed edits/approvals lack actionable feedback · High

**Rendered rejection fixtures, 520×728.** Reject a device-name save: the editor closes, the old name returns, and no explanation appears. Reject Accept on an incoming request: the request stays present without a failure or retry explanation. Native invalid relay Save does report an error, but exposes `Error invoking remote method 'clipp:set-managed-relays': Error: Invalid discovery URL`; the alert can be below the currently visible form and requires further scrolling.

Expected: failed operations retain relevant input, expose plain-language feedback near the action, and provide a safe retry. [Name failure](electron-evidence/rename-save-failure.png), [approval failure](electron-evidence/pending-accept-failure.png), [native relay error](electron-evidence/native-relay-invalid.png); [name saves](../../packages/ui/src/ClipboardApp.tsx), lines 642/669, approval handlers around 1279, [relay catch](../../packages/ui/src/ManagedRelaySettings.tsx), lines 100–103. The 65-character name case used a rejection seam, so this does not independently verify native length validation.

### E12 — Pending work has no closed-drawer indication · Medium

**Rendered incoming requests, 520×728.** Inject two requests while the drawer is closed: the main view has no pending count, banner or approval action. A user must discover the logo and open it to see the requests. With several outgoing waits/errors, incoming decisions appear further down the same panel.

Expected: pending decisions are discoverable from the main view; notification entry reaches the relevant request. [Main view](electron-evidence/pending-main-no-indicator.png), [dense drawer](electron-evidence/dense-drawer-top.png); [pending section](../../packages/ui/src/ClipboardApp.tsx), line 1199. Native notification-click delivery was not exercised; the source-supported `showWindow()`-only route remains a gap to verify with signed paired test clients.

### E13 — Theme control is inert; core settings use inconsistent controls · Medium

**Typical fixture, default/sidebar/fullscreen.** Clicking Toggle theme produces no DOM/style change; source has no action handler. Add relay is a white browser-default button, and retention/Auto Sync are white browser-default selects, alongside dark purple custom controls. The relay editor's Type select is styled dark. This is inconsistency within one Electron surface, before comparing runtimes.

Expected: actionable controls use one visual system; an inactive feature should not appear to work. [Fullscreen](electron-evidence/measured-fullscreen.png), [sidebar](electron-evidence/sidebar-ordinary-labels.png), trace `themeChanged: false`; [theme button](../../packages/ui/src/ClipboardApp.tsx), line 1622, [settings](../../packages/ui/src/ManagedRelaySettings.tsx) and [preference controls](../../packages/ui/src/ClipboardApp.tsx), lines 1425–1480.

### E14 — Routine preferences sit below long technical settings · Medium

**Dense fixture: 20 devices, four incoming requests, four waiting targets, one pairing storage error, seven relay states.** The 340px drawer's scrolling content is 2814px high versus 724px visible. Relays precede Auto Sync and retention. A 256-character relay name plus long endpoint consumes hundreds of pixels; diagnostics and full addresses remain permanently expanded. Device lists also have an independent 200px scroller inside the main settings scroller.

Expected: frequent controls remain quick to reach as data grows. Propose separate Devices/Pairing and advanced Relay settings, compact relay summaries with expandable detail, and Auto Sync near daily actions. [Long relay](electron-evidence/dense-relay-long-name.png), [drawer bottom](electron-evidence/dense-drawer-bottom.png), [narrow sidebar bottom](electron-evidence/dense-sidebar-bottom.png); [nav order](../../packages/ui/src/ClipboardApp.tsx), [relay cards](../../packages/ui/src/ManagedRelaySettings.tsx). Long relay addresses/actions **did wrap within bounds** in the tested sidebar; the issue here is space and effort, not a claim that those buttons escaped.

### E15 — Fixed cards and stretched tracks waste useful space · Medium

**Typical and one-Clip fixtures, default/fullscreen.** A one-line Clip still takes 160px. Default history begins at y=141 and displays three complete Clips in 728px. Fullscreen keeps 160px cards but allocates 227px tracks, adding 67px beyond each card before the declared 12px gap. One Clip occupies one 705px grid track, leaving the rest of the surface visually empty. The same Clip can thus look sparse while longer content is truncated.

Expected: density follows content and available space without hiding controls. Compare a compact row/list option or tighter, top-aligned card tracks in the later layout decision; do not choose a redesign from sparsity alone. [Default](electron-evidence/measured-default.png), [fullscreen](electron-evidence/measured-fullscreen.png), [single Clip](electron-evidence/fullscreen-one-clip.png); [history grid/card CSS](../../packages/ui/src/styles.css), lines 1080–1145.

### E16 — Labels overstate connectivity and obscure device identity · Medium

**Connected-peer fixture with Auto Sync disabled, 1101×728.** The header still says Synced. Connected devices lists offline trusted devices too. The sidebar abbreviates even ordinary names such as Study Android despite available space elsewhere; every remote uses a smartphone symbol, including a desktop/Chrome fixture. Pending/waiting Peer IDs overflow horizontally into the clipped drawer edge. Incoming IDs have a native hover title; outgoing waiting/error IDs do not.

Expected: distinguish connection status from sync enablement; label the trusted-device set accurately; keep identification details intentionally expandable/copyable. [Auto Sync off](electron-evidence/auto-sync-off-synced.png), [ordinary sidebar](electron-evidence/sidebar-ordinary-labels.png), [pending overflow](electron-evidence/dense-drawer-top.png); [status label](../../packages/ui/src/ClipboardApp.tsx), line 1607, device/pending rendering lines 1210–1417. Icon/runtime classification needs a supported data model, not guessed platform identity.

### E17 — Reopening from tray leaves the Dock hidden · Medium, intent needs decision

**Actual native shell.** Closing the window hides it and the Dock icon. Invoking Configure Relays reopens the window, but `app.dock.isVisible()` remains false. Open Clipp did restore a minimized window successfully, so the earlier source-only concern about failing to unminimize was **not reproduced**.

Expected behavior for Dock/app-switcher participation after reopening should be settled explicitly. The observed asymmetry is not automatically an OS defect. [Interaction trace](electron-evidence/trace.jsonl), `afterWindowClose`, `afterConfigureReopen`, `beforeTray` and `afterTray`; [close/show handlers](../../apps/electron/src/main.ts), lines 716–736. A capture timed out following hidden-Dock reopening; the study explicitly restored the study app's Dock before continuing. This is recorded as a harness/native follow-up limitation, not independent proof of a blank UI.

## Action costs and positive checks

| Goal, starting at default main view | Observed minimum UI work                       | Consequence                                                                                      |
| ----------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Copy / Pin a visible Clip           | One click                                      | Works with fonts loaded; Copy creates another native Local Clip and has no positive confirmation |
| Delete one Clip                     | More on card → Delete                          | Two clicks; final-card dropdown remained inside the visible history surface in the sampled case  |
| Search history                      | Widen above 600, then enter query              | Window manipulation is required at the default size                                              |
| Show own pairing QR                 | Logo → Show my QR                              | Two clicks; Close fits at minimum size; no Electron camera scan callback                         |
| Reach relay editor                  | Logo → Add relay, plus scroll as needed        | Daily preferences become increasingly remote as relay/pending lists grow                         |
| Clear history                       | More → Clear, if filters collapsed             | Two clicks, no scope confirmation                                                                |
| View pending decisions              | Discover and click logo; scroll for dense list | No main-view indicator or keyboard route                                                         |

Native empty-state bootstrap, local-only capture and full synthetic retained Copy succeeded without a configured relay. Real QR generation produced a QR image; decoding it with a second device was not tested. Minimum-size QR layout stayed within its scrollable modal; too-large QR fallback and generation failure rendered useful explanations in mocked variants. Relay actions wrapped in 226px-wide sidebar cards. The source dropdown, bottom-card menu and drawer bottom were inspected rather than assumed broken. These are bounded passes, not blanket accessibility/runtime acceptance.

Manual healthy-identity generation, clearing a local device alias and changing sharing lifetime remain the distinctions established in the [inventory](flow-control-inventory.md). This observation did not introduce or authorize new identity lifecycle semantics. There is still no visible manual new-identity control; whether to add that operation belongs to the human control decision.

## Coverage limits and next decisions

No actual 1280×720, 1440×900 or 1920×1080 monitor/work-area configuration was available beyond the one 1512×949 work area. Restored 1280×720 and 1440×900 windows were tested on it; 1920-wide native display coverage, native 1× DPR, additional OS display scaling and OS text scaling remain **not run**. Native fullscreen was verified with `isFullScreen()`, not inferred from screenshot size. Screen decorations and OS notification popups were not captured.

Live signed pairing, native notification selection, relay login/portal return, denied permissions, native identity corruption/relaunch and actual failed storage transactions were **not run**. The real app displayed QR and native validation; error/pending/recovery/relay-status combinations were renderer seams. No camera control is wired in Electron. QR Copy's browser clipboard path was not clicked, preserving the operator clipboard boundary. Comprehensive 1/63/64/65-code-point normalization, all rejection combinations, long-running performance and assistive-technology navigation remain outside this observation sample.

The evidence is sufficient to resolve this observation ticket and inform [Decide missing controls and obsolete entry points](issues/06-decide-control-gaps-and-retirements.md) and [Decide visual consistency and efficient layout](issues/07-decide-layout-and-visual-direction.md). Cross-runtime conclusions still wait for **Observe Chrome popup and options flows** and **Observe Android layouts and native interactions**. Preserve these native gaps in the final handoff; do not convert them into passes or implementation prerequisites that were never agreed.

**2026-10-10 native follow-up qualification:** the user manually closed/reopened the isolated app through Open Clipp and reported that the Dock icon returned. That route did not reproduce this earlier callback-level result. See the [continuation and evidence limitation](native-host-continuation.md#electron-close-to-tray-background-state). Keep the approved Dock-visible-while-open intent, but reproduce the actual tray route before treating this as a current unconditional defect.


## Signed Pairing and recovery continuation

The [sign-in-free follow-up](sign-in-free-journeys.md) adds real signed Pairing against a fresh protocol peer, native Reject/Accept, outgoing waiting/rejection and actual SQLite approval failure/manual retry. These strengthen E11, E12 and E16. The native notification API failed with an OS error; no delivered notification or click route is claimed. Incoming/waiting IDs visibly clip and History says Synced even before trust is accepted. Recovery-notice Dismiss works and persists across restart. These bounded observations supersede the corresponding original unrun branches; complete two-native-app and successful notification routes remain unverified.

## Coordinated native clipboard continuation

The [native clipboard results](sign-in-free-journeys.md#coordinated-native-clipboard-results) supersede the original unrun text clipboard scope: real OS text-read/capture and retained-Clip Copy passed with exact marker verification in a fresh, unpaired profile. Deliberate OS denial/regrant, QR payload clipboard paths, unchanged-system-clipboard recapture and remote delivery remain unqualified. Native gates are off and the owned host closed normally.

## Native display and accessibility continuation

The [display/accessibility follow-up](display-accessibility-observations.md) adds actual OS 1024×665 and 1800×1169 modes on the built-in Retina display, native maximize/fullscreen/restore measurements, focused keyboard traversal and QR Tab/Escape failures (E06), real 65-character name rejection with lost draft/no feedback (E11), and a valid 64-emoji name whose middle-ellipsis preview splits a surrogate and shows a replacement glyph (E16). Stored name and full title remain correct. The original 1512×982 display mode is restored and hosts are closed. No external display is available; VoiceOver is explicitly unverified by user choice. OS text-only scaling and other precise limits remain in the report.
