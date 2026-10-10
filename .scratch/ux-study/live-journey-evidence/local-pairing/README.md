# Sign-in-free Pairing evidence

**Continuation completed for the cases below; all hosts in this directory are now closed.** See [the outcome report](../../sign-in-free-journeys.md) for actual Chrome import failure, signed Electron request/reject/accept, real SQLite approval failure/retry, native notification failure, and persistent recovery-notice dismissal. Google sign-in remains deferred. The original setup checkpoint below is historical; its pending handoff was completed by the user. Actual clipboard work is tracked separately under [native-clipboard](../native-clipboard/README.md).

## Isolation and provenance

- `electron.cjs` launches the existing native build with a fresh temporary `userData` directory and normal direct networking. Unlike the relay-acceptance opt-in, this permits direct Pairing. Relays start empty. Native and renderer clipboard APIs are memory guarded. No operator profile is opened.
- `chrome.cjs` copies the existing normal extension build into a disposable folder and launches Chrome for Testing with a fresh profile. Popup/options/offscreen clipboard APIs are guarded; webpage content scripts are removed in this copy. The original build is unchanged. No account or relay is configured.
- `source-receipt.json` confirms all 145 inventoried sources, eight Electron build artifacts and 43 normal-extension artifacts match their recorded baselines. Initial sandboxed native launches failed; subsequent reviewed launches succeeded. These are launch-environment results, not app defects.
- UI input uses CUA or a requested human action. CDP/Playwright launch, observe public state, capture evidence and install passive observers or clipboard guards. The notification observer calls the original native notification method unchanged and records actual events; it does not create notifications or synthesize selection.
- The QR contains a fresh test identity's public Pairing Target and signed reachability, not a private key. It is retained locally for image import. Profiles remain private, not study deliverables.

## Observed so far

1. Electron opened at outer 520×760 / content 520×728, DPR 2, with no clips/devices/relays. The real Show my QR action generated an image. Its source PNG is 292×292 and software-decodes to a valid Pairing Target with a Signed Peer Record (`qr-validation.json`).
2. Chrome options opened at content 1100×681, DPR 2. The native Auto-sync checkbox changed to off; public state confirms it. Electron remains at `autoSync: true`; attempted native select input did not change it. Both clipboard guards remain active.
3. Chrome Add Device → Choose File opened the real macOS file picker. This desktop branch has no live camera prompt. CUA could open the picker but could not reliably populate its Go to field; one call lost active computer-use state. No file was imported by these failed tool actions.
4. Browser permission reads: notifications `granted`; required `clipboardRead`/`clipboardWrite` present; `navigator.permissions` clipboard-read `prompt`, clipboard-write `granted`. These are different API layers. They establish neither OS clipboard access nor a native denial/recovery result.
5. Last public samples (`chrome-current.json`, `electron-current.json`) show zero devices, pending/waiting requests, connections and Pairing errors. Pairing-response and native-notification observers are empty. **Signed request, approval/rejection and notification delivery/selection have not yet run.**

## Historical manual handoff — completed

The user was asked to complete the native picker: paste `/Users/invine/src/js/clipp/.scratch/ux-study/live-journey-evidence/local-pairing/electron-pairing-qr.png` into Go to, Return, then Open, and report the outcome. The field was last at `/`. Elapsed time is not completion.

Both owned hosts remain running for this handoff. Exact profiles/PIDs are in `electron-environment.json` and `chrome-environment.json`; do not start another copy of either identity concurrently. Live shell sessions: Electron `32693`, Chrome `98246`. Each accepts sequential observation commands; `await quit();` closes its owned host and writes a close receipt. If unavailable, inspect only these owned processes/profiles before recovery.

After the picker completes, run `phase-chrome-observe.js` and `phase-observe.js` through their respective harness sessions. Inspect actual state/UI to determine whether a request reached Electron or Chrome silently discarded a transport failure. Green “QR scanned” is not proof of successful Pairing.

Continue signed accept/reject/failure and notification routes where reachable. OS clipboard checks require a coordinated interval containing only a synthetic marker; keep guards active while waiting. Recovery-notice Dismiss/persistence remains unverified. The prior recovered Electron profile is closed and contains a wrapper stop flag; snapshot before exclusive reuse.
