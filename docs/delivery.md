# Local Clipp delivery

The `npm run delivery -- help` command is the current interface reference. Planning can read a Git remote and writes an immutable plan. Running a plan now prepares an isolated committed checkout, installs its npm dependencies, runs the common local checks declared in `scripts/delivery/profiles/v1.json` and inventories production outputs. The profile lists lint, typecheck, Jest, candidate and delivery tooling, all three production builds and shared UI behavior as separate gates. Platform packaging, installation and publication remain incomplete until their adapters are added.

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

`run` returns a nonzero `delivery_incomplete` result after common checks pass because the selected platform targets still need their adapters. It writes atomic `run.json` observations and private command logs below `runRoot/runs/<run-id>`. Repeating the same plan or run ID checks the saved inputs and skips passing work when the isolated checkout, dependency lock and built output inventory still match. A failed common check retains its attempt and can be retried; interruption waits for the prior command process group to stop before recovery. `status` reads the last saved observation without contacting a destination or changing the run. Keep the run root private and retain it across ticket worktree cleanup.
