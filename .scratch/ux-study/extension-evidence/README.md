# Chrome UX evidence

This directory supports [Chrome extension UX observations](../extension-observations.md). It is a local study harness and evidence set, not production code or a release acceptance suite.

## Evidence ownership

`observations.jsonl` contains 94 timestamped capture attempts and their DOM geometry. `trace.jsonl` preserves exploration, action responses and failed automation attempts. `evidence.jsonl` normalizes those records and explains capture limitations. `capture-annotations.json` corrects misleading intermediate labels and marks unsuitable screenshots; do not infer a visual pass from an excluded image. The gallery shows those annotations.

The report's 16 findings distinguish native behavior, injected UI failures and source-supported gaps. The report is authoritative for interpretation. `pass` in the ledger only means that the stated bounded observation was obtained, not that all tasks on that surface passed.

## Build and isolation

1. From the repository root use Node 22.22.1+ and npm. Build with `CLIPP_RELAY_ACCEPTANCE_TRANSPORT=wss npm --workspace apps/extension run build:relay-acceptance`.
2. `harness.cjs` copies that build into a new temporary directory and launches Playwright's installed Google Chrome for Testing in a new profile. It inserts `clipboard-guard.js` into popup, options and offscreen HTML before app modules. It does not modify production JS/CSS. The guard keeps clipboard operations in memory, including the old execCommand path.
3. Run `node .scratch/ux-study/extension-evidence/harness.cjs` only in an environment permitted to launch native Chrome. Its stdin is a persistent asynchronous JavaScript evaluator. Use short commands that load phase files; long PTY input can be truncated.
4. Keep the resulting profile/build private and disposable. Do not use an operator profile. The retained `fixtures.json` contains public synthetic names, Peer IDs, text and a disposable public Pairing target, not private identity keys or relay credentials. Fixture relay URLs use `example.invalid` and are rendered through the response seam, not sent for authentication.

## Reproduction approach

These phase scripts record an exploratory session, not a single uninterrupted replay. Read the report's reproduction for the desired finding and establish its preconditions. In particular, initial drawer state, real popup closure and the distinction between native and mocked messages matter. The trace includes selector/lifecycle retries; an automation exception is not an app defect.

- `phase-setup.js` installs measurement/capture helpers and opens the actual popup. `measure.js` checks clipping ancestors when counting complete history cards.
- `phase-native.js` and `phase-native-finish.js` record real extension message handling, native popup dismissal, options state divergence, preferences, synthetic Clip capture and native window state. The initial native phase assumes a drawer was opened. Clear at narrow width is behind the history **More** button. These preconditions were satisfied interactively during the recorded run.
- `phase-zoom.js` uses `chrome.tabs.setZoom`. This changed options tab zoom and did not change popup zoom. Its Playwright screenshots at enlarged zoom are unsuitable; geometry remains useful.
- `phase-fixtures.js` prepares a 12-Clip/three-device typical state and a 200-Clip/20-device dense state. It uses the public fixture generator retained in the Electron study. `fixture-bridge.js` replaces UI `chrome.runtime.sendMessage` responses and UI message subscriptions in the disposable popup/options copy only. The real background/offscreen runtime remains isolated; simulated UI actions do not perform account/network operations.
- `phase-errors.js`, `phase-final.js` and `phase-details.js` exercise errors, keyboard behavior, theme/media settings and dense layouts. Use `phase-final.js`'s drawer/QR helpers: showing QR closes the drawer, so it must be reopened before asking for another QR.
- Native validation was checked again after removing the fixture script tags from the copied HTML. `options-native-invalid-settings` therefore uses real background validation at an emulated 480×640 options viewport.
- `zoom-recapture.cjs` is a standalone replacement capture pass. It creates a second isolated profile/copy, renders the retained typical fixture and uses direct CDP screenshots at 100/125/150/200% Chrome tab zoom. Those images were visually checked and cover the full native viewport. `zoom-environment.json` and `zoom-closed.json` are its receipts.

## Native popup lifecycle

`openPopup()` focuses the owned Chrome window, waits for focus to settle, calls `chrome.action.openPopup({windowId})`, locates its target and attaches raw CDP. Its document is verified by `chrome.runtime.getContexts({contextTypes:['POPUP']})`. A normal extension tab is not a substitute.

Attaching a debugger changes dismissal behavior. Before claiming click-away loss, detach via `Target.detachFromTarget`, focus/click the options document, verify that POPUP contexts are empty, then reopen and attach again. Do not reuse an attached popup as a lifecycle pass. The source confirms the lack of in-document Escape handling; the attached Escape check does not establish how the uninspected native popup closes.

## Measurement limits

- Popup geometry is the real toolbar host at native DPR 2. Clipboard is always guarded.
- `options-fixture-<width>x<height>` and 320px reflow use viewport emulation and report DPR 1. They are not physical monitor captures. The explicit DPR 1 record is also emulated.
- Native tab zoom changes CSS viewport/DPR but not physical display scaling. Direct CDP screenshots have 2200×1466 pixels in all four zoom cases.
- Chrome reported fullscreen with 1100×820 bounds and no 87px tab chrome; it did not demonstrate display-filling 1512×982 fullscreen. Early transition captures are excluded from settled measurements.
- Long pending IDs overflow their text content; an element-box scan alone misses glyph overflow. Do not treat the 418px drawer scroll width as proof of offscreen relay buttons: those actions wrapped successfully.
- No real notifications, permission prompts, authenticated relays, two-device Pairing, system clipboard writes, suspension/restart, other physical displays or OS text scaling were qualified.

Both owned Chrome processes were closed (`closed.json`, `zoom-closed.json`). No source changes or commits were made. Temporary study profiles remain in OS temporary storage and are not part of the evidence handoff.
