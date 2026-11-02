# Coordinated native clipboard checks — finished

**Current state:** all native clipboard gates are off; both owned hosts closed normally. The user was told that ordinary copying may resume. No manual Retry is pending. See [interval receipt](interval-progress.json) and [host closure](closure-receipt.json).

The user copied `CLIPP UX PERMISSION CHECK 2026-10-10` and confirmed Ready. The interval ran from 08:13:29Z until native access ended at 08:24:03Z on 2026-10-10; both hosts were closed by 08:24:15Z. Chrome Copy changed the system clipboard to `CLIPP UX COPY CHECK 2026-10-10`; Electron Copy changed it back to the permission marker. Both values were explicitly allowed. No unexpected value entered Clipp or the evidence.

## Results

| Check | Result / evidence |
| --- | --- |
| Electron native text read and automatic capture | Passed for this host. The expected permission marker appeared as a Local Clip, with no runtime error. [Read receipt](electron-native-read.json). |
| Chrome Share Now and Retry native text read | Both reached the original API and failed with `NotAllowedError: Document is not focused.` Retry had focus false and user activation true. This is browser focus enforcement during CUA input, not an OS permission denial. [Receipt](chrome-native-read-result.json), [UI](chrome-native-read-error.png). |
| Manual Chrome Retry | Requested after CUA coordinate input failed; no manual click/result was observed. The subsequent native Copy action cleared the notice, and the request was explicitly withdrawn. Successful Chrome read/recovery remains unverified. |
| Chrome retained Clip Copy | CUA clicked the actual Copy button. Offscreen recorded one successful native text write, and Electron's original OS text API independently verified the Copy marker. [Write receipt](chrome-native-copy-result.json), [OS verification](chrome-native-copy-os-verification.json). |
| Electron retained Clip Copy | CUA clicked Copy on the previously captured permission marker. One native write succeeded; a subsequent native read verified the changed system value. [Receipt](electron-native-copy-result.json), [UI](electron-native-copy-complete.png). |
| Shutdown | Final Electron totals: 43 native reads, one write, zero unexpected values. Chrome: two attempted popup reads, one offscreen write, zero unexpected values. Gates disabled, hosts exited 0. [Closure](closure-receipt.json). |

## Isolation and interpretation

Fresh Electron and Chrome profiles had no Trusted Devices or configured relays, used relay-only transport, and Chrome's disposable copy had no webpage content scripts. Exact paths/PIDs and versions are retained in each environment JSON. Shell sessions 70594 and 70618 are closed; do not attempt to reuse them. Initial ready-checkpoint files are historical gate-off setup receipts.

The wrappers saved the original native text APIs before installing memory boundaries. While enabled, only the two permitted markers could enter Clipp or be written; unexpected content would be discarded and counted without logging its value. Rich clipboard APIs remained disabled and were not tested. No OS permission settings or personal profiles were changed. The allowlist is a study boundary, not production behavior.

Both hosts had a seeded Local Clip made through the memory boundary before the native interval. Switching the Electron boundary back to that seed may produce another local capture; do not report that boundary transition as a duplicate-capture defect. Copy itself creates a new Local Clip by the existing contract. Successful local capture/Copy does not prove remote delivery.

The one-Clip Chrome error notice occupied 152px of a 495×600 popup, with complete text and Retry visible. It does not reproduce the earlier dense-history 17px overlap; together the cases show unstable space allocation. See [geometry](chrome-native-error-layout.json) and the [study report](../../sign-in-free-journeys.md#coordinated-native-clipboard-results).

Chrome successful native read/recovery, deliberate OS permission denial/regrant, unchanged-system-clipboard recapture and QR payload native clipboard paths remain unverified. Notification delivery/selection, complete two-native-app Pairing and account routes have separate prerequisites in the study report. Nothing in this checkpoint waives them.
