# Native lifecycle and storage continuation

Observed 2026-10-10. This round advances [Observe native window and popup lifecycle](issues/13-observe-native-window-and-popup-lifecycle.md) under the user's request to continue without sign-in. The study remains open. Account sign-in remains deferred; no account or personal profile is used.

## Setup and evidence boundaries

The [fresh source receipt](native-host-evidence/continuation/source-receipt.json) confirms all 145 inventory sources and the earlier native build artifacts are unchanged. Chrome for Testing 143.0.7499.4 and Electron 43.4.0 run with fresh disposable profiles, empty relay configuration, WSS-only isolation and memory clipboard boundaries. The host/display remain the single built-in Retina setup from the earlier report. This is native runtime evidence with isolated clipboard I/O, not an OS clipboard or connected relay pass.

The Chrome observer launches the browser directly and uses browser-level target discovery; it does not auto-attach to workers or popup targets. In the first run, public-state reads briefly attached only to options and immediately detached. In the second run, one brief worker attachment invoked the native offscreen-close API, then detached before the idle interval; no stop-worker command was sent. The [first-run environment](native-host-evidence/continuation/chrome-first-environment.json), [second-run environment](native-host-evidence/continuation/chrome-environment.json) and [trace](native-host-evidence/continuation/chrome-trace.jsonl) record those boundaries. An initial startup race and accidental selection of Chrome's built-in `thunk.js` worker were corrected before any Clipp action; its destruction is not Clipp suspension evidence.

Electron's main-process event/state logger reads visibility and Dock state without activating the app. The [events](native-host-evidence/continuation/electron-native-events.jsonl), [action trace](native-host-evidence/continuation/electron-trace.jsonl) and [environment](native-host-evidence/continuation/electron-environment.json) contain no private key or operator clipboard content.

## Chrome popup and idle behavior

| Check | Result | Qualification |
| --- | --- | --- |
| Native Escape during an unsaved relay task | Open the actual toolbar popup, activate the Clipp logo, Add relay, type a synthetic name, press Escape. The entire popup target closes. Reopening returns to History; opening management shows Add relay rather than the unsaved form. | No popup debugger attached. Additional native support for C12 draft loss; no new finding. This is not an in-dialog Cancel operation. |
| Outside-page click | User reports “Clicked the page; popup closed.” | Manual native observation. The automated trace also contains a later agent Escape, so it cannot independently attribute that earlier closure to the user's pointer action. |
| No Clipp UI open, no attached worker debugger | After navigating options to about:blank, Clipp's same worker and offscreen targets remain present and unattached after **651 seconds**. | This observes survival over that interval; it does not demonstrate a natural suspension/wake cycle or diagnose why the worker remains alive. The interval was extended by a native status-bar tool timeout. |

The first Chrome run closed normally with exit 0 ([first shutdown](native-host-evidence/continuation/chrome-first-closed.json)). The second run also closed with exit 0. [Latest shutdown receipt](native-host-evidence/continuation/chrome-closed.json). Forced stop/wake remains covered by the earlier native round; it is not substituted for natural idle.

A second fresh profile then exercised a different condition: invoke the real `chrome.offscreen.closeDocument()`, detach the brief worker observer, leave only about:blank and send no worker-stop command. The Clipp worker target was destroyed **30.005 seconds after detachment/offscreen close**. Native address-bar navigation to the extension’s options page subsequently woke a **different worker target** and created a **different offscreen target**. Reconnected public-state observation found zero Clips/devices/relays, default Auto Sync true and the clipboard guard present. This is a real natural stop/wake result **with the offscreen document intentionally absent**, not evidence that ordinary offscreen-running operation suspends.

The observer encountered `Target.getTargets` timeouts across a long wall-clock gap between the stop event and later UI navigation. Its socket was reconnected to the same owned browser, after which target IDs/public state and normal shutdown were verified. No precise continuous wake latency is claimed. A script-evaluation syntax error during the first reconnect attempt was fixed; neither harness error is a Clipp failure. The [trace](native-host-evidence/continuation/chrome-trace.jsonl) retains those errors.

## Electron close-to-tray background state

A real native close-button click hid the window and Dock icon. Passive reads at once and after ten seconds showed `visible:false`, `focused:false`, `dockVisible:false`; the later read after the status-bar timeout still showed them hidden. No Electron AX inspection/activation occurred between close and those observations. This closes the previous observation-contamination gap for sustained background hiding.

Attempting to inspect macOS status-bar access through SystemUIServer timed out. Reopening through CUA activation returned the window and Dock as before; that activation is not the tray command. The user then reported **“Window reopened; Dock icon returned.”** This is a manual native observation, recorded in the [manual receipt](native-host-evidence/continuation/manual-observations.json). The test app was restarted for identity recovery while that question was pending, so the logger cannot uniquely correlate the reported menu invocation. E17 was **not reproduced in this manual route**; retain the earlier constructed-menu callback result as conflicting evidence and revalidate the actual route before assuming an implementation fix is necessary.

## Native SQLite write failure and automatic retry

A second SQLite connection held `BEGIN IMMEDIATE` on only the owned disposable database, without reading values or changing rows. Auto Sync was disabled through the native UI. Changing the memory clipboard to a synthetic marker queued an ordinary local capture; a native Share Now action also queued an explicit capture. Both writes encountered the real native database lock. This is actual SQLite contention, not a mocked rejection or evidence of disk-full/filesystem-permission behavior.

The app exposed `clipboardHistoryError: pending_capture_failed`, zero stored Clips and the message **“Clipboard History storage is unavailable. Clipp will retry pending Clips automatically.”** Identity remained unchanged. The [blocked-write capture](native-host-evidence/continuation/sqlite-write-blocked.png) at **520×728 content, DPR 2** shows the error banner consuming roughly half the available height, adding native support to E02's recovery-layout problem.

Releasing the writer lock did not immediately remove the error: a capture approximately three seconds later still showed pending recovery. The file named `sqlite-write-recovered.png` records this **early pending sample**, not success. A later state read showed two stored synthetic captures and no error; [completed recovery](native-host-evidence/continuation/sqlite-auto-retry-complete.png). Both images were visually inspected. Two captures reflect the two submitted capture actions, not a claimed duplicate-write defect. Auto Sync stayed false and identity stayed the same. No response fixture, manual database repair or Retry click completed those writes.

## Actual Identity Loss and automatic relaunch

After the first owned Electron process closed with exit 0, a profile-local SQLite backup preserved the disposable test state. A targeted SQL update replaced only that profile’s stored private-key field with synthetic invalid bytes, without reading/exporting its old value. No operator profile or production source was touched. [Fault setup](native-host-evidence/continuation/identity-fault-setup.json).

The actual runtime detected Identity Loss, exited 0 and automatically launched a new process through `app.relaunch`. The replacement process reported a different public identity, **history 2 → 0**, Auto Sync **false → false**, zero relays, default Device Name Desktop, `identityRotationNotice: identity-loss`, and no active rotation recovery. [Process/public-state events](native-host-evidence/continuation/identity-events.jsonl). This matches the accepted Identity Loss contract; no replacement state was injected into the UI.

The [recovered window](native-host-evidence/continuation/identity-recovered.png), visually inspected at 520×728, correctly explains identity reset, history deletion and the need to pair again. The notice occupies roughly half the window, further supporting the recovery-layout issue. The guarded memory clipboard started with the same pre-reset synthetic value and History remained visibly empty at later inspection; this does not qualify the real OS clipboard boundary. CUA failed to execute the Dismiss click with `noWindowsAvailable` after the relaunch, so dismissal/persistence is unverified in this round.

The owner tracked both initial and relaunched PIDs through the profile-local wrapper and closed them through its stop signal. [Closure receipt](native-host-evidence/continuation/identity-closed.json) confirms no owned PID remains alive. This establishes successful recovery; a failure during the replacement commit or process termination mid-rotation remains a separate fault scenario.

## Completion and remaining boundaries

[Observe native window and popup lifecycle](issues/13-observe-native-window-and-popup-lifecycle.md#answer) is resolved for the bounded native investigation: the target conditions were exercised and their actual outcomes/limits recorded. Successful checks are not implementation or release acceptance. The task does not require every observed state to succeed or the ordinary running worker to suspend.

The user-observed tray route returned the Dock icon, conflicting with the earlier callback result; revalidate E17 before assuming a repair is required. Keep the approved visible-window/Dock policy. Recovery-notice Dismiss after automatic relaunch was blocked by native UI tooling and remains unverified.

[Observe live Pairing and account journeys](issues/14-observe-live-pairing-and-account-journeys.md) still owns real two-device Pairing/approval notification routes, actual OS clipboard permissions and unchanged-clipboard recapture, recovery-notice dismissal, and other account-independent journeys. Sign-in remains explicitly deferred. [Qualify desktop display scaling and accessibility](issues/15-qualify-display-scaling-and-accessibility.md) still owns additional physical displays, OS scaling, independent enlarged-popup and assistive paths. The overall study remains open; these gaps are not waived by closing the bounded host investigation.
