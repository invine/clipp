# Local Clipp delivery

The `npm run delivery -- help` command is the current interface reference. Planning can read a Git remote and writes an immutable plan. Running a plan prepares an isolated committed checkout, installs its npm dependencies, runs the common local checks declared in `scripts/delivery/profiles/v1.json` and inventories production outputs. The profile lists lint, typecheck, Jest, candidate and delivery tooling, all three production builds and shared UI behavior as separate gates. `electron-package` creates an unsigned local DMG and retains the packaged app. Android targets qualify the frozen acceptance APK pair with native unit and emulator evidence before later package or destination work.

Create a private JSON configuration outside the repository. The run store must also be outside the selected Clipp source checkout:

```json
{
  "schema": 1,
  "runRoot": "/absolute/private/clipp-delivery-runs",
  "destinations": {
    "electronInstallPath": "/Applications/Clipp.app",
    "chromeExtensionDir": "/absolute/stable/unpacked-extension",
    "chromeProfilePath": "/absolute/chrome/profile",
    "chromeExtensionId": "optional-known-extension-id",
    "androidDeviceSerial": "selected-device-serial",
    "playApplicationId": "example.application.id",
    "playTrack": "internal"
  },
  "signing": {
    "androidPackage": "upload",
    "androidLocal": "debug"
  },
  "references": {
    "androidSdkRef": "env:ANDROID_HOME",
    "javaHomeRef": "env:JAVA_HOME",
    "chromeAuthorizationRef": "file:/absolute/private/chrome-authorization.json",
    "chromeDebugUrlRef": "file:/absolute/private/chrome-debug-url.txt",
    "androidSigningRef": "keychain:clipp-upload",
    "playCredentialRef": "file:/absolute/private/play-credential.json"
  }
}
```

Omit destinations and references that do not apply to a selected target. A plan lists missing target prerequisites rather than inventing them. Reference strings identify where a later stage will retrieve a private value; they are not credentials. Keep the configuration file and run store private. The source can be a full committed hash or a named remote branch such as `origin/main`. For a branch, planning observes and fetches the remote branch into a dedicated cache, leaving the caller's checkout and tracking refs alone. A full hash can be planned even when that remote is offline.

`androidPackage` defaults to `upload`; `unsigned-artifact` can be selected for an artifact-only package. `androidLocal` must explicitly be `debug` or `upload`. Internal publication requires upload signing.

For an upload-signed Android package, `androidSigningRef` must resolve to private JSON with `keystorePath` (an absolute path), `keyAlias`, `storePassword`, `keyPassword`, and the expected upload `certificateSha256` (64 hex digits). An environment, private file, or macOS Keychain generic-password reference can hold this JSON. The runner supplies its values only in the Gradle child environment; the plan and receipt retain the reference and verified certificate digest, never the passwords. A missing or wrong identity blocks signed packaging. The explicit `unsigned-artifact` mode builds an unsigned release APK and AAB, labels both as such, and cannot satisfy installation or internal publication. `android-local` with `debug` produces a separately identified debug APK.

The Android package adapter consumes the selected source's already verified web build and ticket-05 native receipt. It runs the declared release APK and AAB Gradle tasks, checks product APK metadata against the frozen application ID with the pinned SDK tools, reads the AAB manifest through pinned bundletool, verifies the exact bundled web inventory (including the declared Capacitor-generated Cordova files) and Capacitor configuration, and checks declared signatures. It copies completed packages to the private run store and verifies their hashes again on replay. Packaging does not install a phone app or contact Play.

```sh
npm run delivery -- plan --repo /absolute/path/to/clipp --config /absolute/private/delivery.json --source origin/main --target electron-package --json
npm run delivery -- run /absolute/private/clipp-delivery-runs/plans/<run-id>/plan.json --json
npm run delivery -- status <run-id> --config /absolute/private/delivery.json --json
npm run delivery -- run <run-id> --config /absolute/private/delivery.json --json
```

The plan stores the selected commit and source tree. A later change to the branch does not alter it. To select another source or profile, create a new plan and point `--supersedes` at the earlier plan. The plan has a separate integrity receipt; edits to saved plan bytes block execution. A plan is data and does not authorize installation or publication.

The v1 profile requires at least 3 GiB free in the candidate store and checks that the output is writable before preparation. This threshold covers the measured roughly 0.94 GiB locked npm installation plus room for the three web builds and temporary output; platform packaging adds its own later capacity checks.

For `electron-package`, the frozen profile pins Electron 43.4.0, electron-builder 26.18.0 and the archive inventory tool. Packaging copies the verified candidate to an owned macOS temporary directory because the builder rebuilds native dependencies; the original candidate remains available for reuse. The run store retains the DMG and app, with digests, source/build identity, resource hashes and explicit local unsigned signing status. Completion requires archive and unpacked bundle inspection, disk-image integrity, WebRTC loading through the packaged app executable and the production-main normal Quit regression. The Quit harness uses the pinned Electron executable with the packaged main and dependencies; the receipt records both executable choices. Packaging does not install the app or establish live network acceptance.

`run` returns `delivery_complete` when every selected target passes, or a nonzero `delivery_incomplete` result when a target remains blocked. It writes atomic `run.json` observations and private command logs below `runRoot/runs/<run-id>`. Repeating the same plan or run ID checks the saved inputs and skips passing work when the isolated checkout, dependency lock and built output inventory still match. A failed common check retains its attempt and can be retried; interruption waits for the prior command process group to stop before recovery. `status` reads the last saved observation without contacting a destination or changing the run. Keep the run root private and retain it across ticket worktree cleanup.

The candidate profile declares the Android startup replay test directories and Playwright's `.last-run.json` as generated check outputs. Their inventories are retained in the run record. Tracked source changes and any other untracked files still fail source validation.

## Chrome local extension

Select the stable unpacked extension directory and the exact Chrome profile path in private configuration. `chrome-local` consumes the already verified production `apps/extension/dist`, runs the frozen extension checks against an immutable marked copy, and measures populated History at 43 rows. The popup checks include 480 px and 320 px widths, a long source label, three standard-width repetitions, and the options view. The profile records its timing and layout limits.

Before replacing the stable directory, create private authorization JSON with `schema: 1`, `scope: "local-chrome-extension"`, the plan's full `sourceRevision`, the exact `destination` and `profilePath`, and a nonempty `authorizedBy`. An optional `buildId` binds authorization to the candidate artifact shown in the run record. Point `chromeAuthorizationRef` at that file. The adapter keeps the previous complete tree under `.clipp-delivery-backups` beside the stable directory and verifies the new full inventory. It never writes Chrome profile databases.

To confirm the loaded build, launch the selected profile with Chrome's supported remote debugging and `--load-extension=<stable directory>`, then put its local endpoint (for example `http://127.0.0.1:9222`) in the private file referenced by `chromeDebugUrlRef`. A dedicated test profile is suitable for this workflow. The adapter reads `chrome://version` for profile and loaded path, discovers the extension ID from its service worker, reads the build marker from the extension popup, and waits for popup readiness. Set `chromeExtensionId` when an existing ID must be preserved. Without a matching live observation, the target remains `blocked` with a resumable load/reload handoff; rerun the same plan after loading the stable copy. A completed replay verifies the destination and does not copy or reload it again.

If replacement was interrupted, inspect the stable directory and retained backup. A retry reconciles a complete matching stable inventory; an uncertain or mixed directory remains blocked for operator recovery. Keep the run store, stable directory, backups, and selected Chrome profile available until confirmation is complete.

## Android native qualification

Android targets use the frozen `androidQualification` allocation in `scripts/delivery/profiles/v1.json`: native unit XML results and the 28 named native matrix cases on each selected API 31, 33, 34, 35 and 36 emulator. The existing Android runner owns its attempt budgets and native receipts. The delivery run records links to those receipts; it does not reset the native history when a run directory or emulator port changes.

Add an `androidAcceptanceEffort` and explicit `androidAcceptanceSerialApi31`, `androidAcceptanceSerialApi33`, `androidAcceptanceSerialApi34`, `androidAcceptanceSerialApi35` and `androidAcceptanceSerialApi36` destination to private configuration. Use separately owned emulator serials for the chosen API images. Add `androidAcceptanceStateRootRef` and `androidAcceptanceAuthorizationRef` under `references`, alongside the JDK and SDK references. The state-root reference resolves to an absolute durable directory outside the candidate checkout. Keep the same effort and state root for retries; a new run store does not create a new native diagnostic budget.

The authorization reference must resolve at execution time to private JSON with `schema: 1`, `scope: "isolated-android-acceptance"`, `authorizationSource`, an ISO `authorizedAt` date, the plan's full `sourceRevision`, the selected `effort`, a `serials` object keyed by API number, `appPackage: "com.clipp.app.acceptance"` and `testPackage: "com.clipp.app.acceptance.test"`. Optional `appSha256` and `testSha256` further bind the frozen acceptance pair. The run receipt records the authorization source, date, scope and digest without copying the full private record. A plan or reference string alone does not authorize installation. Qualification installs only this acceptance pair on an observed emulator after the authorization matches; it never touches the normal `com.clipp.app` package.

The run may finish source checks and a frozen acceptance build while emulator installation waits for authorization or device readiness. On a failed native attempt, inspect the retained private history before retrying. A changed diagnosis uses `run <plan> --native-diagnostic-change <description> --native-expected-observation <description>`; an exhausted batch additionally uses a pre-existing decision file via `--native-renewal <absolute-file>`. The underlying runner enforces its renewal and successor policies. A blocked or uncertain external operation is not retried automatically.
