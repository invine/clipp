# Observe live Pairing and account journeys

Type: task
Labels: wayfinder:task
Mode: HITL
Status: resolved
Assignee: Codex (current session)
Parent: [Clipp cross-runtime UX study](../map.md)
Blocked by: 06, 07

## Question

Do the real Electron and Chrome Pairing, approval-notification, permission and relay-account journeys provide truthful, reachable controls and recovery, including interruption and return?

Use two fresh isolated Clipp identities with synthetic data and an approved test relay/account when authentication is needed. Inspect public state/UI, never operator profile databases or token stores. Follow [Electron runtime acceptance](../../../docs/electron-relay-acceptance.md) and [Chrome registered-ID requirements](../../../apps/extension/README-managed-relays.md); acceptance guidance is not itself permission to use an existing private profile/account. Discover available public tooling first; request only missing test endpoint/registered callback/account participation. Do not deploy services, change OAuth registrations or reuse production credentials by inference.

Target signed Pairing request/wait/accept/reject/failure, actual native notification delivery and selection destination, generated QR decode/copy, native permission denial/recovery and real browser sign-in/cancel/callback/portal return. Separate local Copy/queued capture from delivery. Preserve the operator clipboard; actual system-clipboard checks require a controlled user-coordinated interval or an isolated desktop session. Memory guards establish runtime action behavior but cannot stand in for OS clipboard permission/write acceptance.

Account and notification states must come from real native/runtime results. Do not manually inject public state and call it a live-journey pass. Record prerequisites that are unavailable and return those specific gaps to the handoff decision; the user has not approved carrying them forward yet. Do not reopen Android's already accepted native carryforward.

## Comments

### 2026-10-10 sign-in-free Pairing and permission continuation

Claimed at the user's explicit request. Exercise real Pairing between fresh synthetic identities, notification delivery/routing and permission branches that do not require an account. Keep Google sign-in deferred. First establish a local transport path and preserve the operator clipboard; memory-guarded action checks are not OS permission acceptance. Reuse prior evidence instead of repeating qualified QR generation or ordinary restart.

2026-10-10: Created because the user selected targeted native checks before closing the study. This observation task unblocks the final handoff and authorizes no production feature work or private account access.

### 2026-10-10 public setup supplied; installed-ID prerequisite pending

The user supplied registered extension ID `gkmcpbabbekiafkmkgjmdlmdlijhjdle` and portal `http://relay-portal-test.everk8s.duckdns.org/`. A read-only request redirects to HTTPS; unauthenticated `https://relay-portal-test.everk8s.duckdns.org/v1/relay` returns 401. This is consistent with the client obtaining an Access Token before discovery and the relay requiring a Bearer header; it does not qualify authenticated readiness. No credentials or response bodies were exported. See the [public setup receipt](../native-host-evidence/public-relay-setup.json).

The isolated study build installs as `mgbhapohdjbmjpnifgkafnmphahfebbm`, which differs from the registered callback ID. The source manifest has no `key`; setting `VITE_CLIPP_REGISTERED_EXTENSION_ID` alone does not assign the installed ID. Clipp requires both IDs and `https://<id>.chromiumapp.org/clipp-relay` to agree. A bounded search found no checked-in public key or setup for the supplied ID.

Asked the user for **the public manifest key or exact original unpacked-extension folder path**, never a private signing key or credential. Once supplied, prepare an isolated copy/fixed-ID build, verify the actual installed ID, and build with the registered-ID input before initiating sign-in. Keep real authorization NOT RUN until that gate agrees. Do not alter OAuth registration, inspect a personal browser profile or reuse its credential store. The task remains open/unclaimed while its public setup is prepared alongside the current host task.

2026-10-10 continuation: the user supplied `/Users/invine/src/js/clipp/apps/extension/dist` as the original folder and instructed its use. Claim this live-journey task to verify the actual installed ID using that exact folder in a fresh browser profile. Preserve the folder's current build during the ID probe; do not open the popup or any web content, which avoids its clipboard-reading entry points. Background's clipboard-read adapter reports unsupported, and the new profile has no Trusted Devices or relay credentials. Keep sign-in gated on the measured ID/callback match.

### Supplied-folder result and local journey progress

The [exact-folder native probe](../live-journey-evidence/chrome-folder-probe.json) installed as `hpmkdfhffpekhgkinfgfjlfdekcaokhd`, with callback `https://hpmkdfhffpekhgkinfgfjlfdekcaokhd.chromiumapp.org/clipp-relay`. It does not match the originally supplied `gkm…` ID. The manifest stayed unchanged and the isolated browser closed. Asked whether this observed callback is also registered; otherwise a fixed-ID public key/build for the original registration is still needed. No sign-in or registration change was attempted.

The [live-journey follow-up](../live-journey-observations.md) separately records real QR generation/software decode, matching guarded Copy output, and successful local test-relay configuration to Login needed. Importing the device's own generated target produced an actual runtime rejection while the options page retained only green “QR scanned” feedback. This strengthens C07 without adding a new finding. The desktop QR importer is file/clipboard based, so no live-camera permission prompt applies to that branch. These bounded results do not qualify OS clipboard access, remote Pairing, native notification routing or account authorization. All owned browsers closed normally; the task remains claimed and unresolved.

### Corrected path: symlink diagnosis; initial approval rejection

The user corrected the folder to `~/src/js/clipp/.local/managed-relay/worktrees/consolidated/apps/extension/dist`. `consolidated` is a compatibility symlink to the main checkout. A fresh native load of that exact path still yielded `hpm…`, while the unresolved original path hashes to the registered `gkm…`. The background bundle contains `gkm…` as its registered-ID factory argument. The [continuation report](../live-journey-observations.md#corrected-folder-and-the-compatibility-symlink) and receipts record these facts; no registration or original file was changed.

A disposable-copy probe was prepared to set manifest loader-ID metadata from the original path bytes and check the resulting ID. **Automatic approval rejected execution**, stating that changing the copied loader identity was not authorized by the request to check the supplied build. At that point the script had not run and explicit approval was requested. No workaround followed that rejection. The next comment records the subsequent authorization and result.


### Explicit approval, matching ID and account handoff

The user explicitly approved the disposable fixed-ID test. Re-submission through normal escalation review was approved; the [native probe](../live-journey-evidence/fixed-id/chrome-folder-probe.json) now verifies installed `gkm…` and the exact registered callback. The original build/symlink/registration remain unchanged. The prepared-copy prerequisite is satisfied.

The [continuation report](../live-journey-observations.md#approved-fixed-id-copy-and-real-sign-in-entry) records real Log in reaching Google's prompt, native cancellation back to Login needed, persisted configuration across normal restart, and a fresh login retry. The copy disables webpage clipboard capture and guards extension clipboard I/O; those boundaries do not qualify OS clipboard or content-script behavior. CUA lost window access after auth close and recovered after restart; this is a tool limitation, not an app defect.

The second real sign-in window is ready in isolated Google Chrome for Testing. Asked the user to complete sign-in/consent directly and report Done or failure, never credentials. [Handoff state](../live-journey-evidence/fixed-id/auth-handoff.json). Successful callback/readiness, portal return and remote Pairing remain unverified. This ticket stays claimed and unresolved; no native gap is silently waived.


### User deferred Google sign-in after browser rejection

The user reported “google says that this is not safe browser. skip for now.” Record the provider rejection as **user-reported**; its exact page/error and cause were not inspected. The current isolated Chrome account sign-in is deferred, not passed. No workaround, security bypass or personal-profile attempt is authorized or needed. The owned browser [closed normally](../live-journey-evidence/fixed-id/local-journey-closed.json); [disposition](../live-journey-evidence/fixed-id/auth-handoff.json).

Successful callback, authenticated readiness and portal return remain unverified. This bounded skip does not waive other live/native journeys, close this task or approve final study closure. Release the claim without resolution so non-account work can proceed; do not retry sign-in until the user resumes it.


### Non-account continuation boundary

[Observe native window and popup lifecycle](13-observe-native-window-and-popup-lifecycle.md#answer) now supplies actual SQLite contention/retry and automatic Identity Loss/relaunch evidence. The recovered notice was visible, but its native Dismiss click failed at the UI-tool boundary after relaunch; retain Dismiss and subsequent persistence as unverified here. Actual OS clipboard permission/write behavior and unchanged system-clipboard recapture remain unverified: the host study used memory guards. These can be investigated without resuming the deferred Google sign-in. Real signed two-device Pairing and approval-notification routes remain open. Do not repeat already-qualified plain restart, QR generation/software decode or local self-target rejection solely to fill this gap.

### Sign-in-free checkpoint: native QR picker needs a human action

Prepared fresh normal-network Electron and Chrome hosts with memory clipboard boundaries and empty relay settings. All inventoried sources and reused build artifacts match their recorded baselines. The [local Pairing checkpoint](../live-journey-evidence/local-pairing/README.md) records real QR generation, native Chrome Auto-sync off, browser permission states and exact owned-host recovery details.

Chrome's actual file picker is open for the fresh Electron QR. CUA could not reliably fill its Go to field, so the user was asked to select the exact study image and report the result. No Pairing request has yet been sent; public device/pending/waiting/connection counts and notification events remain zero. Do not convert this tool boundary into a Clipp defect or mark Pairing/permissions passed. Hosts remain running, clipboard-guarded, for that precise pending action. This ticket remains claimed and unresolved; Google sign-in remains deferred.


### Native image import, signed protocol journeys and recovery results

The user completed the picker. Chrome decoded the real image but discarded an actual connection-gater failure, strengthening C07. The [sign-in-free report](../sign-in-free-journeys.md) records signed native Electron request/reject/accept and outgoing waiting/rejection against fresh protocol peers, real SQLite approval failure/manual recovery (E11), actual native notification failure with hidden pending work (E12), and clipping/misleading connection text (E16). This is not two complete native apps or successful notification delivery/selection. Recovery-notice Dismiss now persists after restart with identity/preferences preserved. All Pairing and recovery hosts closed normally.

A normal escalation retry after the user requested continuation succeeded; the earlier approval-service usage failure was not bypassed. Fresh unpaired clipboard-test hosts are prepared with native access off. Asked the user to copy the exact synthetic marker and confirm Ready for a controlled interval, as required to protect personal clipboard content. See [clipboard checkpoint](../live-journey-evidence/native-clipboard/README.md). The ticket remains claimed and unresolved; sign-in stays deferred, and unavailable routes retain explicit gaps.


### Coordinated clipboard interval started

The user confirmed Ready with the exact synthetic marker. Electron successfully captured it through its original native clipboard API with zero unexpected content, then its gate was disabled. Chrome's real Share Now/Retry calls failed with Document is not focused; the observer confirms focus false and user activation true at Retry. This is browser focus enforcement, not OS permission denial. CUA coordinate input also failed. Asked the user to click Retry manually; the interval remains active with Chrome gates on and Electron off. Native writes and the final gate shutdown are pending. The [report](../sign-in-free-journeys.md#coordinated-native-clipboard-results) distinguishes these results and qualifies the earlier banner geometry finding with the one-Clip 152px notice.

### Coordinated clipboard interval completed; remaining prerequisites retained

Actual retained-Clip Copy succeeded in both hosts and each OS value was verified against the exact synthetic marker. Electron native read/capture also passed. Chrome native read hit a measured focus error during CUA input; no manual Retry was observed. Copy cleared that notice, the manual request was withdrawn, and successful Chrome read recovery remains unverified. All gates are off, both hosts exited normally, and the user was told normal copying may resume. [Final clipboard results](../sign-in-free-journeys.md#coordinated-native-clipboard-results), [closure](../live-journey-evidence/native-clipboard/closure-receipt.json).

Release the claim without resolution. The [remaining prerequisites](../sign-in-free-journeys.md#remaining-prerequisites) precisely retain notification delivery/selection, a Chrome-eligible full-runtime Pairing path, a future coordinated Chrome read/permission/recapture/QR check, and the user-deferred account journey. No gap is waived. The independent display/accessibility task is available while these prerequisites remain open; the handoff stays blocked. Production sources were not changed; the 51-finding count is unchanged.


### 2026-10-10 remaining-prerequisite decision round

Claimed after the user requested the next frontier. Reconcile the completed native evidence and exact remaining prerequisites into a concrete coverage decision. The earlier clipboard interval is closed; its late Retry reply was answered and creates no pending action. Google sign-in remains explicitly deferred. Do not restart either interval by inference, waive gaps or resolve this ticket before the user settles the proposed carryforward or chooses further targeted work.

The read-only audit is complete. The [remaining native coverage decision](../remaining-native-coverage.md) distinguishes verified paths from deferred account work, unavailable hardware, coordination needs and feasible unrun trials. It corrects stale display-task status and removes the unproven assumption that notification success requires packaging or that every full-app Pairing trial requires a Chrome-eligible route. No runtime was launched and no gap was waived in this round.

Proposed decision: carry the exact residual cases into validation of the affected implementation, resolving this native-observation task and allowing final handoff next; alternatively, retain the task and continue feasible native checks, beginning with complete Electron-to-Electron Pairing. This remains a proposal awaiting the user's answer. Priority order, Android carryforward, deferred sign-in and the accepted VoiceOver gap are unchanged.

## Answer

Resolved 2026-10-10 after the user selected **“Carry explicit gaps into implementation validation (Recommended).”** This accepts the exact residual scope in the [remaining native coverage ledger](../remaining-native-coverage.md), including its live-journey and display/accessibility cases. It supersedes the pending-disposition comments above after the requested targeted observations; it does not mark any unverified case passed.

The completed work establishes real QR generation/import and hidden Chrome connection failure, Electron signed request/wait/reject/accept against protocol peers, genuine approval-storage failure/retry, native notification failure, persistent recovery-notice dismissal, registered Chrome callback setup and sign-in entry/cancel/retry, Electron native text capture, and retained-Clip OS Copy writes in both desktop hosts. See [local/account observations](../live-journey-observations.md), [Pairing and clipboard observations](../sign-in-free-journeys.md), and their linked receipts. The independent [host lifecycle](13-observe-native-window-and-popup-lifecycle.md#answer) and [display/accessibility](15-qualify-display-scaling-and-accessibility.md#answer) tasks supply the other targeted native results.

Carry complete app-to-app Pairing, successful notification delivery/selection and applicable permission recovery, Chrome focused read/recovery, other native clipboard branches, account callback/readiness/return and authenticated lifecycle, and the ledger's exact display/name/assistive gaps into validation of affected implementation work. Preserve each case's evidence, prerequisite, validation criterion and ownership. Existing extension capture/recapture issue ownership remains intact. Feasible unrun checks are not relabeled as impossible.

Google sign-in remains user-deferred; Android carryforward and the accepted VoiceOver gap remain unchanged. The earlier clipboard interval is closed, all owned hosts are closed, and the original display mode is restored. No further native action, account retry or global-setting interval is started by this resolution. No production code changed; the register retains 51 findings.

**Prioritize the UX findings and handoff** is now unblocked for final synthesis. Its already approved order remains correctness → compact workspace → additions. That ticket and the map remain open; this resolution settles native coverage scope rather than release readiness or implementation acceptance.
