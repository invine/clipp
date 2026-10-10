# Android UX evidence

The [observation report](../android-observations.md) contains the findings, proposed acceptance criteria and coverage limits. The [gallery](index.html) is an index of native screenshots; a capture does not mean that a scenario passed. The [Wayfinder ticket](../issues/05-observe-android-ux.md) owns closure and any human decision to bound missing coverage.

## Isolation and build

The source/build receipt records the exact client HEAD, existing dirty files, APK hash and comparison against all 145 inventory source hashes. The study built the web bundle, synced Capacitor and assembled the acceptance variant using `apps/android/scripts/native-acceptance.init.gradle`. No production source was edited and no commit was created.

All AVDs were fresh temporary AOSP arm64 installations. Only `com.clipp.app.acceptance` was installed for the study. They used emulated cameras and no operator identity, memberships, clipboard history or relay account. The main AVD used serial `emulator-5580` and a localhost-only WebView debug connection forwarded at port 9226. Separate API comparisons used `emulator-5582` and port 9228. Do not reuse these scripts against an operator installation or an emulator that already holds personal data.

`setup.json`, `avd-config.ini`, `environment.json` and the API-specific environment files describe the owned devices. `closed.json` records shutdown of the main emulator. The comparison receipt or coverage-gap record describes its final outcome. Retained AVD directories are disposable study data; no cleanup of unrelated devices or profiles was performed.

## What the evidence means

- **native-isolated:** the real acceptance app in an Android emulator. This includes native permission dialogs, keyboard, notifications, Back, Android intents and actual window resizing. Remote transport, physical-device behavior and external authentication still need their own evidence.
- **rendered-fixture:** the unchanged UI rendered in the real native app with a temporary public-state or browser-capability override. Dense lists, stopped continuity and concurrent recovery notices use returned public state, without changing the real backend. Scanner fallback removes `window.BarcodeDetector` in one document; permission and video media remain native. A fixture does not establish that the runtime naturally emits the represented state.
- ADB grants of CAMERA or POST_NOTIFICATIONS are fixture setup for later observations, not recovery controls supplied by Clipp. Actual denial dialogs were tested separately.
- `wm size` and `wm density` changed the virtual device's native display. System `font_scale` changed actual WebView text size: 16px, 20.8px and 32px were measured at 100%, 130% and 200%. Density, font scale and viewport dimensions are separate fields.
- Native freeform mode was verified in Android task state. DOM coordinates then have an offset within the physical display; multiplying by DPR alone is not a valid tap position. Native split-screen and physical foldable transitions were not qualified.

## Reading the files

`observations.jsonl` is the append-only capture-attempt log, including geometry, native display settings and image names. A few exploratory IDs were reused, so the corresponding PNG contains the latest image for that ID. `evidence.jsonl` reconciles one record per retained image. Use `capture-annotations.json` to identify failed, stale or limited attempts; scenario labels and names such as “stable” or “verified” were intentions, not final conclusions.

`trace.jsonl` records public state and native actions. Native window dumps and selected UI hierarchy XML files accompany relevant images. The readable barcode-provider exception is retained in `camera-crash-log.txt`; crashpad memory dumps were removed and are not needed to reproduce the finding. No raw private-key store or live account credentials were collected.

`finalize.py` builds the ledger, counts, gallery and source/build receipt from the retained files. Run from the repository with:

```sh
python3 .scratch/ux-study/android-evidence/finalize.py
```

The source receipt describes the tree at generation time, so regenerate only when that is intentional. It does not run builds or tests; the recorded build outcomes came from the original successful commands.

## Reproduction cautions

`harness.cjs`, the `phase-*.js` files and `compare-apis.cjs` are exploratory study aids, not an unattended acceptance suite. Read the phase preconditions and the report before repeating a case. Establish the intended drawer/editor/permission state and inspect the native frame after actions settle. Never treat a failed selector, disconnected debugging session or stale screenshot as an app defect.

OS font changes, navigation overlays, windowing transitions and process recreation can replace the WebView while retaining the same Android PID. Reconnect to the current debug target before measuring or interacting. Some early scripts did not do this; their misleading captures are explicitly excluded. Native frame composition can also lag behind DOM geometry.

The original barcode provider caused a native process crash on AOSP API 35/WebView 124. Fallback camera phases are deliberately separate, and do not turn that failed path into a pass. Early Back trials were contaminated by an ANR; the clean process repeat is the qualified drawer-Back evidence.

The main app ended with nine synthetic Clips, zero Trusted Devices, zero managed relays and continuity disabled. The public end state is retained in `native-end-state.json`. Real-device camera decoding, notification-to-approval routing, external sign-in return and OEM background survival remain explicitly unqualified.
