# Routine Clipp verification

From the selected Clipp repository root:

```sh
npm ci
npm run verify
```

Use Node.js 22.22.1 or newer. The checked-in `.node-version` pins Node 24.16.0
for repeatable local and CI setup; its bundled npm is compatible with the lockfile.
Use npm workspaces, not another package manager. Dependency installation may
fetch packages and native binaries, but verification requires no publication
credentials, cluster access or live OAuth account.

`verify` runs the existing commands sequentially and stops on failure:

| Check                           | Existing command                           | Coverage                                                                   |
| ------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------- |
| ESLint                          | `npm run lint`                             | Shared code, all runtimes and tests                                        |
| Typechecks and Jest             | `npm run check`                            | Shared code, scripts, tests and all runtime TypeScript projects; Jest once |
| Electron production compilation | `npm --workspace apps/electron run build`  | Main/preload CommonJS bundles and renderer assets                          |
| Android web compilation         | `npm --workspace apps/android run build`   | Capacitor web assets                                                       |
| Chrome production compilation   | `npm --workspace apps/extension run build` | Regular extension assets                                                   |

The command prints Node/npm versions, names each check and returns nonzero for
failed checks or missing prerequisites. Missing Node prevents npm's command
launcher from starting; missing npm, ESLint, TypeScript, Jest or build tools is a
failure, not a skipped gate. Existing lint warnings remain visible; ESLint errors
fail verification. A pass is meaningful only for the exact candidate tested.
Record the Git revision and dirty state alongside the command result and tool
versions; after code changes, run verification again.

The [pre-commit hook](../../.husky/pre-commit) keeps lint-staged formatting,
then runs ESLint and `check`. `npm ci`/`npm install` activates Husky. Linked
worktrees sharing `node_modules` still need their own hook installation; run
`npm run check` explicitly before code commits if the hook is unavailable.
Production builds run under `verify`, not on every commit.

The [verification workflow](../../.github/workflows/verify.yml) installs the
pinned Node runtime and dependencies, then invokes the same `npm run verify`
command for pull requests and changes to `main`. Repository permissions are
read-only. Preparing this workflow locally does not execute hosted CI; under a
local-only request, record hosted execution as **not run**, until a separately
authorized push provides that evidence.

## Separate acceptance

Routine compilation does not establish native Android packaging, signed
installation, browser login, native credential protection, device
instrumentation or forced live relay transfer. These remain separate procedures:

- [Electron runtime and forced transport acceptance](../electron-relay-acceptance.md).
- [Android native fixtures and acceptance](../android-managed-relay-native-acceptance.md), including its opt-in package and device gates.
- [Chrome browser fixtures, login and forced relay acceptance](../../apps/extension/README-managed-relays.md).

No live acceptance, signed release, publication or deployment is implied by a
routine pass. Preserve existing unresolved runtime acceptance tickets and record
unexecuted procedures as **not run**.
