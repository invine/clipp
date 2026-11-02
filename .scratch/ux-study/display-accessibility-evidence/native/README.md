# Native display and keyboard evidence

All owned hosts are closed and the original **1512×982, scale 2** display mode is restored. [Closure](closure-receipt.json), [restoration](display-restoration.json). No human input remains pending. Native clipboard access was never enabled; both test hosts used memory-only boundaries.

See the [observation report](../../display-accessibility-observations.md) for results and the task resolution. The user approved two temporary OS display modes, reported no external display, and accepted VoiceOver as unverified. [Decisions](user-decisions.json).

## Provenance and replay

[source-receipt.json](source-receipt.json) verifies all 145 inventoried sources and 51 reused build artifacts unchanged. The actual Electron profile is the canonical `/private/var/...` path of the fresh configured `/var/...` profile; [display-inventory.json](display-inventory.json) confirms realpath equality. A raw string comparison in the historical initial environment was false only because of that macOS path alias.

The first native launch sessions lacked persistent stdin and were closed through native Quit before restarting with PTYs. Initial PIDs 1384/1410 were verified absent. Final Electron session 51307 and Chrome session 15950 are closed. `electron.cjs` / `chrome.cjs` create fresh isolated profiles; they do not reopen these profiles automatically. Chrome used the existing WSS-only acceptance build, removed webpage content scripts in its disposable copy, and added the memory clipboard boundary before each extension document. Empty relays and no Trusted Devices prevented data delivery. The production build was not edited.

Input came from CUA native controls and keyboard commands. Harnesses observed public runtime state, focus events, native geometry and screenshots; none injected keyboard events or invoked application actions. The real native control applied OS display scaling after user approval. Browser text preference changes affected only the disposable Chrome profile. The later font preference reached 32 but no stable popup capture was obtained; its layout remains unverified.

## Capture qualifications

There are 25 PNG captures, not 25 passes. `popup-os1024.png/json` was an already-open popup whose screen metrics still described 1512×982 after the OS changed; exclude it from smaller-display coverage. `popup-os1024-reopened` replaces it. `options-os1024` captured the underlying options page at DPR 2.5 after native zoom shortcuts; `options-os1024-resetzoom` returns it to DPR 2 and is the size comparison. Neither measures enlarged popup text.

The trace’s original `electron-os1800-maximized` capture was taken immediately after the OS mode changed and actually had `maximized:false`. Its files were renamed to `electron-os1800-after-mode-change`; only `electron-os1800-maximized-settled` establishes the native maximized state. Electron fullscreen is verified by `isFullScreen`; its content equals the measured work area rather than the complete display bounds. Chrome’s native fullscreen flag and measured bounds are retained without claiming complete physical-display coverage.

Screenshots are renderer content, with pixel dimensions in paired geometry JSONs; these are not photographs of the panel. All sampled native display modes retained scale factor 2. No 1× display, external monitor, OS text-only scaling or VoiceOver session was tested. The independent popup font test lacks a reliable final capture. Native scroll/element/tool failures are logged as tool limitations, not Clipp defects.
