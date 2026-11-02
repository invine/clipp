# Observe Electron flows across window sizes

Type: task
Labels: wayfinder:task
Mode: AFK
Status: resolved
Assignee: Codex (current session, 2026-10-07)
Parent: [Clipp cross-runtime UX study](../map.md)
Blocked by: 01, 02

## Question

What concrete UX failures or inefficiencies appear in Electron when the inventoried flows run at supported window sizes, display scales and window modes?

Capture the actual Electron runtime with isolated synthetic data. Source reconnaissance found a 520×760 default and 480×640 minimum main window in `apps/electron/src/main.ts`; verify the current implementation and measure renderer content bounds rather than treating outer bounds as viewport dimensions.

Exercise the minimum, default, wider ordinary window, short wide window, maximized and native fullscreen. Include representative available display work areas around 1280×720, 1440×900 and 1920×1080, plus high-DPI/scaled-display behavior and increased text/zoom where supported. Record unavailable environments explicitly. Resize with a populated panel/dialog open, not only the initial screen.

Measure immediately below, at and above the shared 600px, 900px and 1100px breakpoints when renderer bounds permit; especially compare the JavaScript drawer threshold with CSS at exactly 1100px. Refresh these source-defined boundaries before capture.

Walk the common scenario matrix, Pairing dialogs/camera, long values, settings/relay validation, startup/recovery banners and tray/native entry points. Explicitly trace what **Configure Relays** does today, whether it reaches a relevant destination and whether it duplicates another command. Do not classify it as obsolete solely because the user named it.

Collect screenshots and geometry/reproduction evidence for clipping, inaccessible bottom actions, horizontal overflow, excessive vertical chrome, sparse fullscreen layouts, focus/scroll loss, inconsistent styling and redundant or missing controls. Measure useful visible history and steps to frequent actions. Separate app rendering problems from OS decoration. Return findings and native evidence gaps for the later layout/control decisions.

## Comments

2026-10-07 inventory handoff: use [user flows and control coverage](../flow-control-inventory.md) and [fixtures/evidence format](../inventory-fixtures.md). Prioritize notification-to-approval navigation, the keyboard-inaccessible narrow logo trigger, hidden search at ≤600px, the exact 1100px sidebar/drawer mismatch, duplicate tray destination, Clip inspection and stacked recovery notices. Refresh the source baseline; charting's temporary tray changes are no longer present.

## Answer

Resolved 2026-10-07. The [Electron observation report](../electron-observations.md) records 17 findings, measured task/space costs, bounded passes and explicit native evidence gaps. The [screenshot gallery](../electron-evidence/index.html) contains 76 captures; the [ledger](../electron-evidence/evidence.jsonl), [trace](../electron-evidence/trace.jsonl) and [source/build receipt](../electron-evidence/source-build-receipt.json) retain their basis.

Built and launched actual Electron 43.4.0 on macOS 26.4.1 with a new temporary profile, empty managed relays and a memory-only native clipboard. Observed native capture/Copy, QR generation, relay validation, tray destinations, minimize/close/reopen, restored/maximized/fullscreen bounds. Dense/error/pending states used the built renderer with a labelled public IPC seam. Eight captures are native-isolated; 68 are rendered fixtures, including a controlled upstream-font comparison after the app's remote font request failed.

Measured native minimum/default and larger/short windows, every 600/900/1100 width boundary, 760px filter-height boundary and page zoom through 200%. Findings include overlapping recovery banners and obstructed Retry; inaccessible settings at exactly 1100px; hidden active search; lost relay drafts on resize; keyboard navigation/dialog gaps; unusable compact enlarged layouts; missing full Clip inspection; unclear Clear scope; silent operation failures; inconsistent control styling; and excessive space/distance to routine preferences. Configure Relays invokes the same main-window destination as Open Clipp; relay configuration itself remains useful. Open Clipp successfully restored a minimized window, correcting the earlier source-only concern.

All 145 inventory source hashes still matched. No product source was changed. The owned process closed. Native 1×/other display work areas, OS text scaling, live notification selection, signed pairing, relay auth return and native identity/storage failure acceptance remain explicitly unrun. The report separates those gaps from observed renderer failures. No additional product decision ticket is needed yet: the existing control/layout decisions already cover the now-concrete findings and remain blocked on Chrome and Android observation.
