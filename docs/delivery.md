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
    "androidSigningRef": "keychain:clipp-upload",
    "playCredentialRef": "file:/absolute/private/play-credential.json"
  }
}
```

Omit destinations and references that do not apply to a selected target. A plan lists missing target prerequisites rather than inventing them. Reference strings identify where a later stage will retrieve a private value; they are not credentials. Keep the configuration file and run store private. The source can be a full committed hash or a named remote branch such as `origin/main`. For a branch, planning observes and fetches the remote branch into a dedicated cache, leaving the caller's checkout and tracking refs alone. A full hash can be planned even when that remote is offline.

`androidPackage` defaults to `upload`; `unsigned-artifact` can be selected for an artifact-only package. `androidLocal` must explicitly be `debug` or `upload`. Internal publication requires upload signing.

```sh
npm run delivery -- plan --repo /absolute/path/to/clipp --config /absolute/private/delivery.json --source origin/main --target electron-package --json
npm run delivery -- run /absolute/private/clipp-delivery-runs/plans/<run-id>/plan.json --json
npm run delivery -- status <run-id> --config /absolute/private/delivery.json --json
npm run delivery -- run <run-id> --config /absolute/private/delivery.json --json
```

The plan stores the selected commit and source tree. A later change to the branch does not alter it. To select another source or profile, create a new plan and point `--supersedes` at the earlier plan. The plan has a separate integrity receipt; edits to saved plan bytes block execution. A plan is data and does not authorize installation or publication.

The v1 profile requires at least 3 GiB free in the candidate store and checks that the output is writable before preparation. This threshold covers the measured roughly 0.94 GiB locked npm installation plus room for the three web builds and temporary output; platform packaging adds its own later capacity checks.

For `electron-package`, the frozen profile pins Electron 43.4.0, electron-builder 26.18.0 and the archive inventory tool. Packaging copies the verified candidate to an owned macOS temporary directory because the builder rebuilds native dependencies; the original candidate remains available for reuse. The run store retains the DMG and app, with digests, source/build identity, resource hashes and explicit local unsigned signing status. Completion requires archive and resource inspection, disk-image integrity, packaged WebRTC loading and the production-main normal Quit regression. It does not install the app or establish live network acceptance.

`run` returns `delivery_complete` when every selected target passes, or a nonzero `delivery_incomplete` result when a target remains blocked. It writes atomic `run.json` observations and private command logs below `runRoot/runs/<run-id>`. Repeating the same plan or run ID checks the saved inputs and skips passing work when the isolated checkout, dependency lock and built output inventory still match. A failed common check retains its attempt and can be retried; interruption waits for the prior command process group to stop before recovery. `status` reads the last saved observation without contacting a destination or changing the run. Keep the run root private and retain it across ticket worktree cleanup.

The candidate profile declares the Android startup replay test directories and Playwright's `.last-run.json` as generated check outputs. Their inventories are retained in the run record. Tracked source changes and any other untracked files still fail source validation.

## Android native qualification

Android targets use the frozen `androidQualification` allocation in `scripts/delivery/profiles/v1.json`: native unit XML results and the 28 named native matrix cases on each selected API 31, 33, 34, 35 and 36 emulator. The existing Android runner owns its attempt budgets and native receipts. The delivery run records links to those receipts; it does not reset the native history when a run directory or emulator port changes.

Add an `androidAcceptanceEffort` and explicit `androidAcceptanceSerialApi31`, `androidAcceptanceSerialApi33`, `androidAcceptanceSerialApi34`, `androidAcceptanceSerialApi35` and `androidAcceptanceSerialApi36` destination to private configuration. Use separately owned emulator serials for the chosen API images. Add `androidAcceptanceStateRootRef` and `androidAcceptanceAuthorizationRef` under `references`, alongside the JDK and SDK references. The state-root reference resolves to an absolute durable directory outside the candidate checkout. Keep the same effort and state root for retries; a new run store does not create a new native diagnostic budget.

The authorization reference must resolve at execution time to private JSON with `schema: 1`, `scope: "isolated-android-acceptance"`, the plan's full `sourceRevision`, the selected `effort`, a `serials` object keyed by API number, `appPackage: "com.clipp.app.acceptance"` and `testPackage: "com.clipp.app.acceptance.test"`. Optional `appSha256` and `testSha256` further bind the frozen acceptance pair. A plan or reference string alone does not authorize installation. Qualification installs only this acceptance pair on an observed emulator after the authorization matches; it never touches the normal `com.clipp.app` package.

The run may finish source checks and a frozen acceptance build while emulator installation waits for authorization or device readiness. On a failed native attempt, inspect the retained private history before retrying. A changed diagnosis uses `run <plan> --native-diagnostic-change <description> --native-expected-observation <description>`; an exhausted batch additionally uses a pre-existing decision file via `--native-renewal <absolute-file>`. The underlying runner enforces its renewal and successor policies. A blocked or uncertain external operation is not retried automatically.
