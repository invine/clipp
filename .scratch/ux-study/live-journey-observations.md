# Live-journey follow-up observations

Observed 2026-10-10 Asia/Dubai. [Observe live Pairing and account journeys](issues/14-observe-live-pairing-and-account-journeys.md#answer) is now resolved after the user accepted explicit unverified carryforward. These rounds verified the supplied extension folders, advanced local QR/setup branches and opened real account sign-in. The approved disposable fixed-ID copy matches the registered callback; the user deferred account completion after reporting Google's test-browser rejection. The corrected folder revealed a compatibility symlink; see the continuation below. No production source, original generated extension file, relay registration or personal browser profile was changed.

## Exact folder and callback check

The user supplied `/Users/invine/src/js/clipp/apps/extension/dist` as the original unpacked extension folder. Loading **that exact directory**, without copying or rebuilding it, in a fresh Chrome for Testing 143.0.7499.4 profile produced:

| Public setup | Value |
| --- | --- |
| Originally supplied registered ID | `gkmcpbabbekiafkmkgjmdlmdlijhjdle` |
| Actual installed ID from the supplied folder | `hpmkdfhffpekhgkinfgfjlfdekcaokhd` |
| Actual `chrome.identity.getRedirectURL('clipp-relay')` | `https://hpmkdfhffpekhgkinfgfjlfdekcaokhd.chromiumapp.org/clipp-relay` |
| Fixed `key` in that generated manifest | Absent |
| Manifest before/after probe | Same SHA-256 |

The [native ID receipt](live-journey-evidence/chrome-folder-probe.json) records the actual runtime values, not only a calculated path hash. The probe opened only `about:blank` and closed normally. **The directory does not reproduce the originally supplied registered ID in this environment.** This is a test-setup mismatch, not an inferred Clipp UX defect.

The user was asked whether the observed `hpm…` callback is also registered, or for a fixed-ID build/public manifest key corresponding to `gkm…`. No OAuth registration was changed and no sign-in was attempted. Before a live flow, verify the registered callback and build input `VITE_CLIPP_REGISTERED_EXTENSION_ID` agree with the actual installed ID. The existing build's original invocation/input is not established by this probe; its [artifact hashes](live-journey-evidence/existing-build-receipt.json) identify exactly what was exercised. All 145 current source-inventory hashes remain unchanged.

## Native local QR and setup checks

The local journey resumed only the freshly created study profile. CUA supplied native UI input. Options received a verified memory clipboard guard before loading; no popup or web content-script surface was opened. Before actions, the actual public state had zero Clips, zero Trusted Devices and zero relay configurations. Background clipboard reads are unsupported in this runtime; no incoming peer or history-copy action invoked the offscreen writer.

The options content viewport was **1100×733, DPR 2** on the previously recorded Retina display. The [trace](live-journey-evidence/local-journey-trace.jsonl) records only sanitized outcomes. Screenshots include a synthetic public QR, not a credential. The QR trace's `publicPayloadExported:false` field means no raw payload text was exported in that JSON measurement; it does not mean the screenshot conceals its public QR.

| Action | Result | Qualification |
| --- | --- | --- |
| Generate My QR | A real image and Copy as Text appeared. Software decoded the image at its displayed 320×320 size; the source PNG was 244×244. | [Generated QR](live-journey-evidence/native-options-generated-qr.png). Both decoded image and copied text parsed as valid Pairing Targets and contained the same Peer ID and signed record. No physical-camera or signature-verification acceptance is claimed by this parsing check. |
| Copy as Text | One write to the memory clipboard, no read before importing. | Correct payload through the real click/handler; **not an OS clipboard permission/write pass**. No positive Copy confirmation appeared in the AX state. |
| Add approved test relay | The HTTPS `/v1/relay` endpoint saved as one configuration and public state/UI reported `login_needed`. | [Configured relay](live-journey-evidence/native-options-relay-login-needed.png). No authentication, account change or successful relay connection is claimed. The existing unstyled relay actions remain visible, corroborating C03. |
| Inspect Add Device (QR) | Options offered an image-file input and Paste QR/Text from Clipboard. | This desktop surface has **no live-camera request**; a camera-denial test is not applicable to this branch. The native file picker, upload decoding and actual OS clipboard-denial branches were not exercised. |

## Real Pairing rejection is silently discarded

**Additional native support for C07, not a new independent finding.** After generating/copying the fresh device's own target, open Add Device (QR) and choose Paste QR/Text from Clipboard. The real `pairDevice` callback returned `{ok:false}` with an error. A passive callback observer recorded that outcome without altering the response. No Trusted Device, waiting request or exposed Pairing error appeared in public state.

Expected: retain the input and explain that the Pairing operation failed, with an appropriate correction/retry route. Actual: the page retained only green **“QR scanned: …”** feedback and showed no rejection. The decoding acknowledgement is true; it is the subsequent Pairing failure that is missing. [Native rejection screenshot](live-journey-evidence/native-options-self-pair-response.png), [response/state trace](live-journey-evidence/local-journey-trace.jsonl), [options handler](../../apps/extension/src/options.tsx) `handleScan` ignores the callback result.

Confidence is high for this local self-target rejection branch. It does not establish successful signed two-device Pairing, remote approval/rejection, notification delivery/selection or network timeout recovery. The error's raw non-code text was deliberately not exported; do not assert a particular underlying transport error from this receipt.

## Corrected folder and the compatibility symlink

The user corrected the location to `~/src/js/clipp/.local/managed-relay/worktrees/consolidated/apps/extension/dist`. On this filesystem, `consolidated` is now a symlink to `/Users/invine/src/js/clipp`. Passing the exact corrected path to a fresh Chrome loader still produced **`hpmkdfhffpekhgkinfgfjlfdekcaokhd`**; its public callback remained the `hpm…` URL. [Corrected-path native receipt](live-journey-evidence/corrected-folder/chrome-folder-probe.json).

The SHA-256-derived ID of the original, unresolved path is **`gkmcpbabbekiafkmkgjmdlmdlijhjdle`**, which explains the supplied registration. The actual background bundle also passes that `gkm…` literal to its credentials factory. Thus the build's registered-ID input agrees with the user's registration, while the currently resolved installation path does not. [Path/build receipt](live-journey-evidence/corrected-folder/configuration-receipt.json). The original build invocation remains unknown; this is direct inspection of its compiled argument.

The native Load unpacked picker also navigated to the resolved regular-checkout directory. Select remained disabled, so the picker was cancelled and no extension was installed through that attempt. This is not a second successful installed-ID check or a Clipp defect. Its fresh browser then closed normally; no unrelated file was selected. [Native loader trace](live-journey-evidence/manual-load/local-journey-trace.jsonl).

## Approved fixed-ID copy and real sign-in entry

Automatic approval initially rejected the disposable-copy test because the earlier request to inspect the supplied build did not authorize changing its loader identity. The user explicitly replied **“Approve the disposable fixed-ID test.”** The exact proposal was then submitted through normal escalation review and approved. This supersedes the earlier pending-approval status; no registration or original build was changed.

The [actual native probe](live-journey-evidence/fixed-id/chrome-folder-probe.json) installed **`gkmcpbabbekiafkmkgjmdlmdlijhjdle`** and returned **`https://gkmcpbabbekiafkmkgjmdlmdlijhjdle.chromiumapp.org/clipp-relay`**. Both comparisons passed. The copied manifest's loader metadata uses the original development path bytes, not a private signing key. This establishes only the authorized disposable development-copy setup, not a release packaging/signing strategy. The probe opened about:blank and closed normally.

The account round reopened that isolated profile in Chrome for Testing 143.0.7499.4. Extension HTML uses memory clipboard guards. The disposable manifest's web content-script declaration was removed before visiting account pages, preventing automatic capture of copy/cut there; [isolation receipt](live-journey-evidence/fixed-id/auth-isolation.json). Auth logic and native identity APIs remain unchanged. Webpage capture and OS clipboard acceptance are outside this check.

| Native action | Observed result | Limit |
| --- | --- | --- |
| Add approved HTTPS discovery endpoint | Public state and options report one relay, Login needed; zero Clips/Trusted Devices. | Local configuration only. |
| Log in | A real Chrome identity auth window reaches `accounts.google.com`, Sign in to continue to everk8s.duckdns.org. | Sign-in entry is verified; no user credential entered by agent. |
| Close auth window | Google auth page closes; options still exists and reports Login needed with Log in available. No visible cancellation message in retained options capture. | Does not prove eventual OAuth callback success. |
| Reopen owned browser, then Log in | Configuration persists and a fresh Google prompt opens. | Retry is verified across a normal restart, not an uninterrupted same-window retry. |

The [trace](live-journey-evidence/fixed-id/local-journey-trace.jsonl) exports public statuses and URL origin/path only. [Options after cancellation](live-journey-evidence/fixed-id/native-options-login-cancelled.png) was visually inspected at 1100×733 content, DPR 2; C03's unstyled/abutting relay action labels remain visible. After native auth close, CUA timed out trying to reselect the surviving options window; the page was still alive and readable through the observer. Normal browser restart restored CUA access. Record this as an automation limitation, not a Clipp defect or failed return.

The user reported **“google says that this is not safe browser. skip for now.”** Record this as a user-reported provider rejection; the agent did not inspect the rejection page or establish its exact error code/cause. The current isolated Chrome sign-in is **deferred by user**, not a pass. No protection bypass, alternative browser or personal-profile attempt followed. The owned browser closed normally; [disposition](live-journey-evidence/fixed-id/auth-handoff.json), [shutdown](live-journey-evidence/fixed-id/local-journey-closed.json). No account credential, callback code or token store was inspected or exported into evidence files.

## Remaining gates

The installed-ID/callback gate is **passed**. The current Chrome account sign-in is **deferred at the user’s request** after the reported Google browser rejection; do not retry it until the user resumes it. Successful callback, authenticated relay readiness and account/portal return remain unverified. This bounded deferral neither closes the study nor waives two-device Pairing, other native gaps or future implementation acceptance.

The [sign-in-free continuation](sign-in-free-journeys.md) qualifies native image import with a hidden Chrome connection-policy failure, real Electron signed Pairing against a fresh protocol peer, approval storage failure/retry, native notification failure and persistent recovery-notice dismissal. Native Electron text-read/capture and retained-Clip Copy writes in both hosts are verified in the coordinated marker interval. Chrome successful native read/recovery, deliberate applicable denial/regrant, unchanged-clipboard recapture, native QR clipboard paths, successful notification delivery/destination and complete two-native-app Pairing remain unverified. Desktop image import has no live-camera branch; Android camera follow-up retains its already accepted ownership. All clipboard-test hosts are closed. The [host lifecycle task](issues/13-observe-native-window-and-popup-lifecycle.md#answer), [display/accessibility task](issues/15-qualify-display-scaling-and-accessibility.md#answer) and [live-journey task](issues/14-observe-live-pairing-and-account-journeys.md#answer) are resolved with bounded evidence and accepted residual coverage. The [final handoff](issues/08-prioritize-ux-study-handoff.md#answer) is resolved. The [remaining native coverage ledger](remaining-native-coverage.md) preserves exact cases accepted for implementation validation as unverified.

The earlier [local browser shutdown receipt](live-journey-evidence/local-journey-closed.json) confirms that older run closed. The fixed-ID browser has also closed following the user’s skip instruction; its latest disposition is [auth handoff](live-journey-evidence/fixed-id/auth-handoff.json). The original build remains untouched.
