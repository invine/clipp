# Android scanner diagnosis harness

This harness separates the existing scanner entry, exposed feature property,
availability probe, constructor, native detection and software decoding. It does
not change or enable the production scanner. Follow [project operations](agents/operations.md)
and [isolated native acceptance](android-managed-relay-native-acceptance.md).

Preparation needs no device, browser or camera:

```sh
node tests/harness/android-scanner-diagnosis.mjs /absolute/retained/ticket-14-prepared
```

The command builds `ticket-14-probes.js`, a QR PNG through the accepted
`createPairingCode(encodePairingTarget(...))` generator using the repository's
public signed target fixture, and a receipt containing source/build hashes.
It checks jsQR against that QR and a blank frame on the host and verifies the
decoded Peer ID and Signed Peer Record through the accepted target decoder. These checks prove
software decoding of supplied pixels only; they do not prove media acquisition,
physical camera decoding, Pairing submission or native provider safety.

Each native trial requires a fresh coordinator assignment and an already ready
`com.clipp.app.acceptance` document in the exclusively owned guest. The interval
owner installs the inspected acceptance APK, disables host clipboard sharing
before guest launch, establishes guest/window/document readiness, and restores
scoped settings after shutting down the guest. The driver neither launches a
guest/app nor installs, clears storage, grants permission or changes settings.
Use a fresh app document for each trial. A fatal trial ends that trial; do not
silently reconnect or retry it as though it passed.

The outer `android-scanner-interval.mjs` wrapper owns an explicitly assigned
subset of the six diagnostic trials, with no duplicate action retry.
It requires an `ACTIVE` assignment, exact APK/bundle/driver/wrapper hashes,
the owned `dev35_default_arm64-v8a_Pixel_2` AVD and its process-local managed
AVD home. It disables Qt clipboard sharing before launch, uses
`-no-snapshot -read-only -no-window -camera-front none -camera-back none`,
verifies stock AOSP WebView124, and clears only acceptance data before each
fresh document. It records native readiness and each failed or completed trial,
stops its guest and restores the original sharing key after confirmed shutdown.
After each driver exit and on failure/closure, it removes only new forwards
for the assigned serial and a known acceptance PID socket, then verifies none
remain and preexisting mappings are preserved. It withholds launch when that
serial already has a forwarding mapping. The source fingerprint includes the
bytes of every bounded untracked harness/document input as well as tracked diff.
Source preparation or a sample assignment below does not authorize its execution.
After the scanner baseline it stops the app, prints the baseline receipt and
pauses 30 seconds before split probes. Inspect the actual result and publish
ranked falsifiable hypotheses at this checkpoint. A failure before the trigger
ends the interval as a prerequisite failure; an absent candidate crash is
recorded honestly rather than inferred from the historical exception.

The assignment JSON contains these fields (values below are placeholders):

```json
{
  "ticket": 14,
  "interval": "coordinator-owned-interval-id",
  "exclusive": true,
  "camera": false,
  "expiresAt": "fresh-coordinator-deadline-in-ISO-8601",
  "packageId": "com.clipp.app.acceptance",
  "serial": "emulator-5554",
  "adb": "/absolute/sdk/platform-tools/adb",
  "api": "35",
  "expectedProvider": "exact observed WebView package/version",
  "sourceRevision": "full candidate source commit",
  "apkSourceRevision": "retained comparison APK source commit",
  "dirtyStateSha256": "candidate dirty state SHA256 from source receipt",
  "apkSha256": "installed acceptance APK SHA256 from interval receipt",
  "bundleSha256": "ticket-14-probes.js SHA256",
  "trials": ["scanner-before-media"]
}
```

Run a single assigned trial:

```sh
node tests/harness/android-scanner-native.mjs \
  /absolute/retained/assignment.json scanner-before-media \
  /absolute/retained/ticket-14-prepared/ticket-14-probes.js \
  /absolute/retained/ticket-14-scanner-before-media.json
```

The command is red when the native process terminates, the stage times out, or
the expected trial outcome is missing. It records timestamped stages from the
WebView console and checks native PID survival independently. It captures only
the isolated process's filtered fatal provider stack, uses an ephemeral owned
ADB forwarding port and removes that forwarding on exit. The interval receipt
must independently link the installed APK and exact source; the driver records
the assignment's APK hash without proving installation bytes itself.
Each trial has its own terminal stage: `construct-after` cannot finish `detect`.
A failed decode assertion records `verification-failed`; the wrapper cannot
accept a successful stage label when the child exited unsuccessfully or recorded
an error. Missing stages remain harness failures rather than provider evidence.
Native fatal exception, same PID presence, unfinished stage and actual wait
expiry are recorded separately. A present PID after a fatal stack is not healthy
provider support. Offline replay exercises this same live classification without
native access and writes a new result, preserving the original receipt:

```sh
node tests/harness/android-scanner-native.mjs --replay \
  /absolute/retained/original-trial.json /absolute/retained/replayed-outcome.json
```

| Trial                  | Boundary and required observation                                                                                                                                                                                                                                                  |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scanner-before-media` | Calls the unchanged public scanner. Intercepts `getUserMedia` with a rejecting sentinel before any permission/acquisition. Records whether the scanner reaches media or terminates in its earlier provider path. This is an acquisition fixture, not unmodified camera acceptance. |
| `feature`              | Reads presence of BarcodeDetector, format probe and media API. Calls neither provider nor media. Exposure does not establish availability.                                                                                                                                         |
| `probe`                | Calls `BarcodeDetector.getSupportedFormats()` alone. This may itself enter the provider and terminate the process; test it separately before considering it a guard.                                                                                                               |
| `construct`            | Constructs the native QR detector alone. No media access.                                                                                                                                                                                                                          |
| `detect`               | Constructs/detects against the public synthetic QR canvas. Requires the expected decoded text and process survival. No camera acceptance.                                                                                                                                          |
| `software`             | Decodes the same synthetic canvas and a blank frame through jsQR without touching BarcodeDetector or media. Requires expected text, blank null and process survival.                                                                                                               |

Begin with the unchanged scanner trial in the implicated API35/AOSP WebView124
environment. Confirm its exact symptom before using the split trials to localize
it. A missing provider/document or disconnected process before the trigger is a
prerequisite failure, not a scanner diagnosis. The diagnostic bundle's unique
`[CLIPP-SCANNER-14]` console prefix is confined to the harness.

Hold source/APK constant for provider comparisons and change one variable at a
time. Record Android image/build/API/ABI, WebView package/version/distribution,
resolved dependencies and packaged manifest. Do not infer a manifest correction
from the exception alone. No broad upgrade follows from these trials.

The final receipt must distinguish actual candidate observations from historical
crashes, controlled overrides and host pixels. Recommend a supported smallest
remedy only after the required comparison is available; otherwise name the exact
environmental blocker and leave provider choice pending. Issue15 separately owns
the implemented remedy, typed recovery, permission/acquisition, actual camera
valid/no-QR, repeated open/close, Back/background/abort/late-result and bounds
qualification. Physical/provider/API36/OEM gaps remain explicit, and this
diagnosis does not close A08.

## Candidate observation — 2026-10-11, attempt01

Client source `343f1f6312c6371c2cfa865efdbdebcfde2ad00a`, dirty fingerprint
`765375d0760d78aebcf0811940921baae19a8f0dbd6a8c17120402ada856af48`;
acceptance APK SHA256
`5d12c061b91f8d0de4a4af5eb24cd182ddfaeb33a97f6eb518eb00a4a4202c97`.
This opt-in package was `com.clipp.app.acceptance`, min 23/compile 36/target 36.
Capacitor Android/core 7.4.4 and jsQR 1.4.0 were resolved. The packaged manifest
lacked `com.google.android.gms.version`; the resolved Android runtime graph had
no Play Services or MLKit dependency. Neither fact establishes a manifest remedy.

The exclusive managed Pixel 2 guest was API 35/arm64-v8a,
`Android/sdk_phone64_arm64/emu64a:15/AE3A.240806.019/12368160:userdebug/test-keys`,
1080×1920 physical pixels at 420 dpi, stock `com.android.webview` 124.0.6367.219
(versionCode 636771901). Both emulated cameras were `none`; camera app-op was
`ignore`. No provider install/switch, permission request/grant, real camera,
host clipboard, account or Pairing operation occurred. Every trial used fresh
acceptance data and a ready, awake, unlocked, focused document.

| Boundary                         | Actual observation and scope                                                                                                                                                                                                                                                                                                             |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Existing scanner, media sentinel | Reached intercepted media, rejected `camera_permission_denied`; PID1711 survived and no fatal stack was captured. This baseline did **not** reproduce the historical scanner crash.                                                                                                                                                      |
| Feature inspection               | BarcodeDetector, its format probe and media API were exposed. Exposure did not establish provider safety.                                                                                                                                                                                                                                |
| Format availability probe        | `getSupportedFormats()` alone terminated PID2384 after `probe-before`, with `GooglePlayServicesMissingManifestValueException` beneath `InterfaceRegistrar.bindBarcodeDetectionProvider`. This reproduces the recorded native failure at a smaller no-media boundary and disproves treating that probe as a safe guard on this candidate. |
| Constructor alone                | Returned and PID 2644 survived the driver's observation window. No detection/provider support claim follows from that short constructor trial.                                                                                                                                                                                           |
| Native canvas detection          | **Invalid/incomplete.** The old driver mistook `construct-after` for a terminal detect stage, never recorded `detect-before`/`detect-after`, and its decode assertion exited1. The outer wrapper incorrectly recorded `completed` and exited0. The original receipt is preserved unchanged and supplies no native decode evidence.       |
| Existing jsQR on native canvas   | Accepted signed public target decoded to the expected QR transport text; blank frame returned null; PID 3059 survived. This proves supplied-pixel decoding only, with no BarcodeDetector override and no camera acquisition.                                                                                                             |

The interval ended 2026-10-11T11:51:29.325Z: emulator exit 0 and stopped;
all owned forwarding checks were empty and preexisting mappings were preserved;
the original absent Qt sharing key was restored. Durable run evidence lives
under `.local/ux-implementation/run-20261010/ticket-14-api35-attempt01/`, including
the exact assigned APK/bundle hashes, script bytes, original assignment,
per-trial events/PIDs/fatal stack and closure receipt. The historical study's two
crashes remain separate dated evidence.

The observer published four ranked conditional checks at the baseline checkpoint:
absent API; JavaScript constructor rejection; deferred native provider binding
during probe/detect; and jsQR compatibility on public native pixels. The first
two were not observed; the probe and software observations support the latter
two within their respective stages. Missing detect completion is a harness
defect, not an Android provider pass or failure. Trial-specific terminal stages
and child error propagation now correct that defect; a fresh assigned detect
trial and bounded probe reproducibility check were performed in attempt02 below.

## Corrected bounded comparison — attempt02

The retained APK and stock provider stayed constant. Diagnostic source was
`9700e936284d3c6938b606b1599cae6f5d072936`, after an inspected integration
fast-forward, with dirty fingerprint
`c80789a56c58d09348bdf9d6ffcc0dad764853cac212a9169082eaee62e469dd`.
The APK's own source remained `343f1f6312c6371c2cfa865efdbdebcfde2ad00a`;
the diagnostic bundle stayed
`154d29dbf73e93d57fed660b1afdef68ad2307e6b58db5ad343b97fce45e9357`.
Only `detect` and `probe` were assigned; no camera or provider changes occurred.

| Trial                  | Actual observation                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Corrected detect trial | PID 1716 terminated with the same Google manifest/provider-registration fatal stack after `construct-after` and **before** `detect-before`. This is asynchronous construction/provider initialization failure; no actual canvas-detect invocation or decode result is claimed. It demonstrates why constructor return and the prior short observation window cannot establish safety. |
| Probe reproducibility  | PID 2212 emitted the same fatal stack after `probe-before`; no probe result arrived. The PID remained present through the 8-second wait, so the original receipt records `stage-timeout`, not another observed process termination. Fatal provider failure reproduced; subsequent process-death timing remains unobserved.                                                            |

Attempt02 exited 1 on the stage-timeout assertion and retained both raw receipts.
The guest then exited 0 and stopped; all owned forwarding checks were empty,
preexisting forwards were preserved, and original Qt-key absence was restored.
Root independently closed each assignment. Every raw receipt and executed script
remains under `ticket-14-api35-attempt01/` and `ticket-14-api35-attempt02/` in the
durable run evidence directory. These raw outcomes are not rewritten as passes.

The final classifier uses a captured fatal stack independently of PID presence,
and distinguishes an unfinished stage from actual wait expiry. Five original
receipts were replayed through the public CLI: the fatal/PID-present probe,
invalid premature detect, successful software decode and two observed process
terminations. Expected outcomes came from their captured events/PIDs/fatal
stacks. The two red assertions and final green outcomes are retained in
`ticket-14-classifier-*.log/json`; replay is not a new native trial.

## Scoped remedy interpretation and remaining gates

The demonstrated software route is the smallest candidate direction for issue15:
use the existing jsQR decoder on supplied pixels and avoid entering the known
unsafe native provider, including its availability probe. This is a decoder
choice for the implicated candidate; it does not establish real camera support
or a universal Android correction. No production scanner change is made here.
The candidate facts support avoiding native construction as well as the format
probe: asynchronous binding can fail after a constructor has returned and before
any camera or detect call. JavaScript catches cannot recover that native fatal
boundary. The remaining PID timing uncertainty does not turn the fatal stack or
unsettled operation into an availability pass.

A provider/manifest correction remains unselected: no alternative intended
provider, physical environment or corrected-manifest comparison was assigned.
The exception text alone does not justify adding Play Services metadata,
dependencies or an upgrade. Actual camera permission/acquisition and physical
valid/no-QR decoding remain unrun; G18 support claims stay unqualified.

For issue15, execute the public scanner with deferred media/decode and verify
Cancel, abort, Back/background, replacement and late completion stop tracks and
cannot submit Pairing. On any enabled candidate, prove the selected decoder path
is actually consumed without an unsafe provider/probe call. Then separately
qualify assigned real camera valid/no-QR, denial/regrant, user-initiated recovery,
repeated scans, portrait/landscape and safe native bounds. No software pixel,
constructor, feature or JavaScript-catch result substitutes for those gates.
