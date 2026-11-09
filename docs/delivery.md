# Local Clipp delivery planning

The `npm run delivery -- help` command is the current interface reference. This first implementation provides `plan`; execution and status are added by later tickets. Planning can read a Git remote and writes an immutable plan, but does not install dependencies, build, install an application or publish a release.

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
```

The plan stores the selected commit and source tree. A later change to the branch does not alter it. To select another source or profile, create a new plan and point `--supersedes` at the earlier plan. A plan is data and does not authorize installation or publication.
