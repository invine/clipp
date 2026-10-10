# Local live-journey evidence

Read the [report](../live-journey-observations.md). This round probes the exact user-supplied unpacked folder in a new study profile, then exercises local QR generation/copy, relay configuration and a real self-target Pairing rejection. It does not qualify live account authorization, two-device exchange, camera capture or OS clipboard permissions.

- `chrome-folder-probe.cjs` loads the exact folder, reads public installed-ID/callback metadata, opens only about:blank and closes. Its JSON receipt confirms the mismatch and unchanged manifest.
- `chrome-local-journey.cjs` resumes that owned temporary profile. It installs a memory clipboard guard before options loads; UI actions come from CUA, not the harness. `local-journey-trace.jsonl` contains sanitized native outcomes, and `local-journey-closed.json` confirms shutdown.
- `phase-qr.js` decodes the real displayed image using the installed jsQR library and compares its parsed target with the real Copy handler's memory-clipboard result. `pairing-decoder.mjs` is a study-only esbuild bundle of the current core decoder, built with external package dependencies. It does not edit the app or inject a fake QR/response.
- A passive options `sendMessage` callback observer recorded Pairing `ok:false` without modifying the returned result. The raw non-code error text is not exported.
- The screenshots contain a fresh public Pairing QR/short text prefix. No private key, token or operator clipboard is exported. The JSON's `publicPayloadExported:false` refers to raw receipt text, not to the screenshot's public QR.
- The existing user-supplied build was not rebuilt; its exact hashes are in `existing-build-receipt.json`. Current source hashes are separately checked. Do not infer original build inputs from current source alone.

The scripts depend on this checkout, installed Playwright/Chrome, and the temporary study profile recorded by the probe. They are retained observation tools, not portable acceptance tests. Never redirect their profile path to the operator's browser or reuse a credential store. Keep the supplied folder unchanged until any new build has an explicit reviewed purpose and rollback plan.

## Corrected-folder continuation

`chrome-corrected-folder-probe.cjs` and `corrected-folder/chrome-folder-probe.json` test the second user-supplied path. The `consolidated` component is a symlink; Chrome still loaded the resolved main-checkout ID. `corrected-folder/configuration-receipt.json` records both path-derived IDs and the compiled registered-ID argument. The manifest stayed unchanged.

`chrome-manual-load.cjs` launched an empty fresh profile for native Load unpacked. The picker navigated to the resolved directory, but Select stayed disabled. The operation was cancelled; the trace records zero extension workers and normal shutdown. Do not count it as a successful native extension installation.

`chrome-fixed-id-probe.cjs` initially failed automatic approval because loader-identity changes were outside the earlier authorization. The user then explicitly approved the disposable fixed-ID test, and normal escalation review approved execution. The [native result](fixed-id/chrome-folder-probe.json) confirms installed `gkmcpbabbekiafkmkgjmdlmdlijhjdle` and the exact registered callback. The original build and symlink remain unchanged.

`chrome-auth-journey.cjs` reuses only that disposable copy/profile. Its options, popup and offscreen HTML carry memory clipboard guards. Before account pages opened, the copy's `content_scripts` declaration was removed to prevent copy/cut capture on those pages; [auth isolation](fixed-id/auth-isolation.json) records the exact boundary and hashes. The auth implementation, permissions and ID metadata were preserved. This round cannot qualify webpage capture or OS clipboard behavior.

The native Log in control opened Google's real sign-in prompt. Closing it returned the relay to Login needed without a visible cancellation error, and the options page survived. CUA then timed out accessing that remaining window; a normal owned-browser restart restored UI access. That is a tooling limitation, not an app defect. After restart, configuration persisted and Log in opened a fresh Google prompt. The user subsequently reported Google rejected the test browser and asked to skip sign-in for now; successful authorization stays unverified. [Sanitized trace](fixed-id/local-journey-trace.jsonl), [cancelled-login options capture](fixed-id/native-options-login-cancelled.png), [handoff state](fixed-id/auth-handoff.json). The latest closed receipt now records shutdown of the second run after the user’s skip instruction. No bypass or personal-browser attempt was made.
