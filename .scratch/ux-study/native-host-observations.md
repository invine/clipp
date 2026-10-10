# Native host follow-up observations

Observed 2026-10-10 Asia/Dubai (2026-10-09 UTC). This is additional evidence for [Observe native window and popup lifecycle](issues/13-observe-native-window-and-popup-lifecycle.md), following the user's requirement to complete targeted native checks before study closure. **This initial report left the task and study open.** The later [non-account continuation](native-host-continuation.md) resolves the bounded host task and qualifies its earlier gaps; the overall study remains open. This report does not waive the remaining host, live-journey or display cases.

The [source/build receipt](native-host-evidence/source-build-receipt.json), [evidence notes](native-host-evidence/README.md), [gallery](native-host-evidence/index.html) and machine traces preserve the tested boundaries. No production source was changed. The two existing managed-relay-auth changes were preserved. No UI response fixtures were used in this follow-up; clipboard access was replaced with a memory boundary, and Chrome offline networking was controlled on the actual popup target.

## Environment and isolation

Both runtimes used new temporary profiles, new synthetic identities, one synthetic Local Clip, Auto Sync disabled, and empty relay configuration. Electron used its WSS-only acceptance environment; Chrome used the compiled WSS-only acceptance build. These prevent the study marker from being shared through ordinary discovery. They are not evidence of normal transport fallback or connected account lifecycle. Only public state was observed; comparisons export identity-continuity booleans, not private keys or tokens. Both owned hosts exited normally after testing.

The host is macOS 26.4.1, arm64, with one built-in Retina display: 1512×982 logical units, scale factor 2, work area 1512×949 at y=33. Electron 43.4.0 embeds Chromium 150.0.7871.224. The isolated Chrome for Testing is 143.0.7499.4. This environment does not establish other installed Chrome versions, non-Retina displays, OS scaling or other physical work areas. Native Electron screenshots contain renderer content, not the title bar; PNG pixels are twice the measured logical dimensions.

## Qualified lifecycle results

| Scenario | Actual result | Evidence and limit |
| --- | --- | --- |
| Chrome actual toolbar popup → native Escape | One POPUP context before, zero after. No popup debugger attached. Repeated after native menu exploration with the same result. | [Trace](native-host-evidence/chrome/trace.jsonl), [recheck trace](native-host-evidence/chrome/recheck/trace.jsonl). Initial History view only; not nested task Escape semantics. |
| Chrome offscreen document close/recreation | Context count 1→0→1, new document ID, same identity, one Clip retained, Auto Sync still false. | Actual `chrome.offscreen.closeDocument()` followed by real runtime-state wake. [Trace](native-host-evidence/chrome/trace.jsonl), [capture](native-host-evidence/chrome/offscreen-recreated.png). No configured/authenticated relay reconnect. |
| Chrome worker forced stop/wake | Chrome emitted stopped, old target temporarily disappeared, then worker ran again. Same identity, one Clip, Auto Sync false. | Actual CDP ServiceWorker stop, then real message wake. Chrome reused its target ID. This is explicit stop/wake, **not natural idle suspension**. A subsequent stale Playwright worker reference failed in the capture helper; that is a harness error after the state check, not an app failure. |
| Full Chrome close/restart, same isolated profile | Old contexts gone; same identity, one Clip and Auto Sync false. Options visibly showed Auto-sync unchecked. | [Restart capture](native-host-evidence/chrome/browser-restarted.png), [trace](native-host-evidence/chrome/trace.jsonl). Memory clipboard resets on process start; unchanged system-clipboard recapture is **not qualified**. |
| Full Electron close/restart, same isolated profile | First process exited 0 without timeout. Relaunch retained identity, one Clip, Auto Sync false, zero relay configurations. | [Trace](native-host-evidence/electron/trace.jsonl), [restart capture](native-host-evidence/electron/native-restarted.png). A normal restart, not corrupt-identity recovery or storage failure. |
| Electron native minimize/inspection | Native minimize event reported invisible/minimized; native restore followed when the automation tool inspected/activated the app. | [Event timeline](native-host-evidence/electron/trace.jsonl). Establishes actual minimize and activation restoration; cannot establish sustained background behavior because observation activates the app. |
| Electron native close/inspection | Close event reported window hidden and Dock hidden. Tool activation then showed the window and Dock again. | [Event timeline](native-host-evidence/electron/trace.jsonl). **Not a tray selection** and not evidence that the old tray/Dock defect is fixed. |

## Native window sizes

Native fullscreen and zoom controls were operated through CUA, not by changing CSS viewport dimensions. Follow-up measurements waited for repeated unchanged geometry. The simple one-Clip options page had no horizontal document overflow in these samples; this does not supersede the earlier long-name/dense-data findings.

| Surface/state | Native bounds (logical units) | Renderer content | Evidence |
| --- | --- | --- | --- |
| Electron restored | 520×760, x496 y111 | 520×728 | [Restored](native-host-evidence/electron/native-restored.png) |
| Electron maximized | 1512×949, x0 y33 | 1512×917 | [Maximized](native-host-evidence/electron/native-maximized.png) |
| Electron fullscreen | 1512×949, x0 y33; fullscreen true | 1512×949 | [Fullscreen](native-host-evidence/electron/native-fullscreen.png) |
| Chrome restored | 1100×820, x0 y33 | 1100×733 | [Restored](native-host-evidence/chrome/recheck/native-restored-settled.png) |
| Chrome maximized | 1512×949, x0 y33 | 1512×862 | [Maximized](native-host-evidence/chrome/recheck/native-maximized-settled.png) |
| Chrome fullscreen | Chrome API reports 1512×861, x0 y121, state fullscreen | 1512×861 | [Fullscreen](native-host-evidence/chrome/recheck/native-fullscreen-settled.png) |

Chrome expanded to the physical display's logical width, unlike the old narrower capture. Its API still reports a region below the top browser controls; this is **not a 1512×982 content-area pass or a whole-screen pixel proof**. Keep native state, reported bounds and content dimensions distinct. Electron fullscreen likewise uses the reported work-area height here. Both restored to their prior normal sizes.

## Essential icons fail in the cold offline Chrome popup

**Observed failure; high confidence within the tested condition.** In the actual POPUP host, attach the network observer, enable Network, clear browser cache, disable cache, set that target offline, and reload. The target reported `navigator.onLine=false`, an empty font-face collection, and real app responses. Dimensions were **495×600, DPR 2**, including the visible outer scrollbar; the previous study's 480×600 should not be treated as a universal fixed measurement.

Expected: essential actions retain their local icons and usable geometry without a network font request. Actual: literal `dark_mode`, `push_pin`, `more_vert`, `unfold_more` and `content_copy` text appeared. Theme text crossed the header edge; Pin and More labels overlapped; the action/header area expanded. [Verified failure image](native-host-evidence/chrome/offline-popup-verified.png), [measured font/icon state](native-host-evidence/chrome/observations.jsonl).

This extends the existing shared external-asset finding **E01** to native Chrome and supports the already approved local-SVG recommendation. It is **additional evidence, not a new independent finding**, so the register remains 51 findings. Do not claim a successful Pin click or OS clipboard write in this offline sample; this check established rendering and overlap.

The first offline attempt used context-level offline configuration, which did not reach the untracked popup target. That target remained online and loaded its fonts. Its `cold-offline-popup.png` and initial `networkOffline:true` record are **invalid offline evidence**, superseded by the target-specific result. The initial icon selector was also wrong; an empty selection and `document.fonts.check()` did not prove loaded icons. These trials remain retained and annotated, not silently counted as passes.

## Remaining checks after this initial round

- **Native popup pointer dismissal:** Escape is qualified. Clicking Chrome's native File menu left the POPUP context alive; it did not test a click in another window or browser content. A later Escape closed it. Keep ordinary outside-pointer/focus dismissal distinct from native menu behavior and the earlier detached-debugger dismissal observation.
- **Electron tray route:** the tool exposes the app window/menu bar but did not expose the Clipp status item for native selection. Close/minimize observations activate the app afterward. A manual OS tray walkthrough is still needed; the earlier constructed-menu callback findings remain valid.
- **Failure recovery:** no corrupt-identity, actual write-failure, automatic recovery relaunch or unchanged system-clipboard recapture was exercised. Do not mutate the operator's store to obtain these cases. A future test must retain ownership of all automatically relaunched processes and use a fresh disposable identity/store.
- **Live tasks:** [Observe live Pairing and account journeys](issues/14-observe-live-pairing-and-account-journeys.md) still owns real Pairing/notification selection, permission denial/recovery, QR copy/decode and relay auth/portal return. The user supplied the public test portal and registered extension ID; reproducing that installed ID remains a prerequisite.
- **Display/input:** [Qualify desktop display scaling and accessibility](issues/15-qualify-display-scaling-and-accessibility.md) still owns other actual displays/scaling, independently enlarged popup and assistive navigation. The read-only display inventory found only the built-in Retina display. No global display/accessibility preference was changed.

This is the historical gap list from the first round. The [later continuation](native-host-continuation.md#completion-and-remaining-boundaries) supplies the current dispositions. These were evidence gaps, not inferred product failures or accepted carryforward. The approved priority order and Android coverage disposition are unchanged.
