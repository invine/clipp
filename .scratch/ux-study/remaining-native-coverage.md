# Remaining native coverage decision

Prepared 2026-10-10 for [Observe live Pairing and account journeys](issues/14-observe-live-pairing-and-account-journeys.md#answer). **Carryforward accepted by the user.** The linked resolution records the decision to retain the exact cases below as unverified implementation-validation work after the targeted observations. No runtime was launched in this reconciliation round.

## Evidence now available

The study retains **51 findings** (17 Electron, 16 Chrome, 18 Android). The native follow-ups strengthened or qualified existing findings rather than increasing that count.

| Follow-up | What it establishes | Important limit |
| --- | --- | --- |
| [Host lifecycle](native-host-continuation.md) | Native popup dismissal, user-observed click-away/tray return, restart, conditional natural worker stop/wake, SQLite failure/retry and Identity Loss/relaunch. | Tray reopening returned the Dock icon in the user's trial; revalidate the earlier contrary finding before prescribing a fix. Worker behavior depends on whether offscreen is running. |
| [Signed Pairing](sign-in-free-journeys.md#electron-signed-pairing-and-failure-recovery) | Electron request, Reject, Accept, outgoing waiting/rejection and real approval-storage failure/retry against fresh signed protocol peers. | Counterparts were not complete native Clipp apps; no full app-to-app transfer or reconciliation pass. |
| [Chrome image import](sign-in-free-journeys.md#native-chrome-qr-import-hidden-connection-failure) | A real generated QR decoded; the actual connection-policy rejection was hidden behind green scan feedback. | No Chrome Pairing request reached the other app. This does not prove all browser direct routes fail. |
| [Native notification failure](sign-in-free-journeys.md#actual-native-notification-failure-delivery-still-unverified) | Electron invoked the OS notification and received `UNErrorDomain error 1`; pending work remained hidden on History. | No delivered/selected notification. Packaging or OS authorization as the cause was not established. |
| [Clipboard and recovery](sign-in-free-journeys.md#coordinated-native-clipboard-results) | Real Electron text read/capture and retained-Clip Copy writes in both hosts; exact OS marker values verified. Identity Loss notice Dismiss also survived restart. | Chrome read failed with measured document focus loss during tool input; this is not OS permission denial. Copy success is not read recovery or remote delivery. |
| [Display and keyboard](display-accessibility-observations.md) | Actual built-in 1024×665/1800×1169 modes; Electron window states; final-control reachability in a shorter Chrome popup; native Tab/dialog defects and name-validation/truncation defects. | Same Retina display throughout. Popup text enlargement, OS text-only scaling and whole-display Chrome fullscreen remain unqualified. |

All owned test hosts are closed and native clipboard gates are off. The original display mode is restored. No old Retry, file-picker or sign-in action is pending. [Clipboard closure](live-journey-evidence/native-clipboard/closure-receipt.json), [display restoration](display-accessibility-evidence/native/display-restoration.json), [host closure](display-accessibility-evidence/native/closure-receipt.json).

## Exact live-journey gaps

These cases remain **unverified**, with different reasons. Unrun work is not automatically an unavailable prerequisite.

| Remaining case | Current boundary | Follow-up that would qualify it | Ownership |
| --- | --- | --- | --- |
| Complete app-to-app Pairing and subsequent exchange | Electron-to-protocol-peer flows passed; Chrome's tested direct record was rejected. | Two fresh complete runtimes with guarded clipboards: request/wait/accept/reject and observe resulting membership/exchange. An Electron-to-Electron trial is still feasible without sign-in. Chrome specifically needs a route permitted by its normal transport policy; do not weaken that policy. | Core Pairing + affected runtime bridges. |
| Successful notification delivery, selection destination and permission recovery | Real Electron delivery failed; Chrome received no incoming request. | Diagnose a host that can deliver a real notification, send a genuine request, select the notification and inspect the destination. Separately qualify applicable denial/regrant. A packaged build is a possible diagnostic variable, not a proven prerequisite. Global permission changes require their own coordinated interval. | Electron/Chrome notification bridges + Requests navigation. |
| Chrome native clipboard read and recovery | Real calls failed with `document.hasFocus() === false`; manual Retry was not observed. | Fresh isolated host and a new coordinated marker interval with the popup visibly focused by the user; observe actual read, feedback and recovery. The prior clipboard interval is finished. | Chrome popup/clipboard adapter. |
| Other native clipboard branches | Text read/Copy evidence does not cover QR payload Copy/import, deliberate applicable permission denial/regrant or unchanged-clipboard recapture. | Separate real results in a fresh coordinated interval. Keep file-based desktop QR import distinct from Android camera permission. Reuse the existing [restart-recapture issue](../extension-clipboard-io/issues/02-prevent-restart-recapture.md); do not redefine the separate [content-script capability issue](../extension-clipboard-io/issues/03-align-content-script-capture-capability.md). | Runtime clipboard bridges + existing capability owners. |
| Relay authorization completion, callback/readiness, portal return and authenticated lifecycle | Chrome sign-in entry/cancel/retry and the registered callback setup were checked. The user deferred completion after reporting Google's browser rejection. | Resume only when the user requests it, with approved test-account participation. Verify actual callback/readiness/return and subsequent authenticated restart/suspension separately. Electron's account journey is not qualified by Chrome entry evidence. [Account disposition](live-journey-evidence/fixed-id/auth-handoff.json). | Each runtime's managed-relay auth/lifecycle. |

## Other precise gaps retained for handoff

| Remaining case | Disposition or next requirement |
| --- | --- |
| External display, native 1× and physical 1920-wide panel | No external display is available. Built-in scaled logical sizes do not substitute for that hardware. |
| VoiceOver | User explicitly chose to leave it unverified. Native Tab and accessibility-support flags do not establish a screen-reader pass. |
| Independent enlarged popup text, OS text-only scaling and complete-display Chrome fullscreen | Disposable Chrome font preference reached 32, but no stable enlarged-popup capture followed. This can be retried in isolation. OS text-only scaling needs a new coordinated global-setting interval. Chrome reported fullscreen, but complete-display geometry remains incompletely established. |
| Further name/alias boundaries and assistive paths | The 64/65 ASCII and 64-emoji Device Name samples are qualified; comprehensive normalization, whitespace, alias and assistive combinations are not. Further memory-guarded native samples remain feasible. |
| Android native follow-up | Carryforward already accepted in [Observe Android layouts and native interactions](issues/05-observe-android-ux.md#answer); do not reopen that decision. The [handoff coverage table](handoff.md#coverage-disposition-explicit-carryforward-accepted) preserves the exact cases. |
| Approved new UI and controls | Future implementation must satisfy the accepted [layout](layout-state-contract.md) and [control-flow](control-flow-contract.md) contracts. Existing-app observations are not acceptance of those unimplemented changes. |

## Accepted disposition

The user accepted the recommendation to end this native-observation task with the above cases explicitly unverified and assigned to validation of the affected implementation. The canonical decision is recorded in [Observe live Pairing and account journeys](issues/14-observe-live-pairing-and-account-journeys.md#answer). This concerns study scope, not release readiness or a claim that every targeted case passed.

Feasible unrun work remains identified above for later validation; acceptance does not make those checks impossible or unnecessary to qualify the affected behavior. Native clipboard and global-setting work still need fresh coordinated intervals. Deferred sign-in, unavailable hardware and the accepted VoiceOver/Android gaps are unchanged.

The user previously required targeted checks before considering carryforward. After those observations, the user accepted this specific residual ledger. **Observe live Pairing and account journeys** and [Prioritize the UX findings and handoff](issues/08-prioritize-ux-study-handoff.md#answer) are resolved. Priority remains **correctness → compact workspace → additions**. The [study map](map.md) is complete; the cases above remain unverified validation work for the subsequent implementation effort.
