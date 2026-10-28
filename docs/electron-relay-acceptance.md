# Electron managed relay acceptance

The runner rebuilds the actual Electron candidate before launch. Run it with a
nonprivate marker that a paired peer will send:

```sh
node scripts/electron-relay-acceptance.mjs \
  --profile /absolute/isolated-test-profile \
  --effort approved-effort-id \
  --history-root /absolute/durable-private-evidence/native-history \
  --transport wss \
  --discovery https://approved-relay.example/v1/relay \
  --output /absolute/private-evidence-directory \
  --expect-clip clipp-relay-test-unique-nonce
```

Use `tcp`, `wss`, or `webrtc-direct`, one run at a time. The profile must be
explicit and outside both the current Electron profile tree and the entire
native application-data tree, including physical symlink aliases. The latter
protects every ordinary production profile regardless of the runner app name.
The test opt-in works
only in a development build and is process environment configuration, never a
renderer query or saved user preference. The runner prevents concurrent copies
of itself from using one profile. Before using an existing test profile, stop
its runtime normally and make a private recovery snapshot; preserve its original
app name (the runner defaults to `Clipp Relay Test`, or use `--app-name`); do not clone an
existing Device Identity into concurrent processes. Retain the profile across
runs to exercise renewal through main-process protected storage.

The normal application opens visibly. Add a managed relay and sign in through
the UI if necessary. Complete Google authorization with the system browser.
Pair through the normal Pairing Target and approval actions if this profile
has no paired peer. Send the exact marker from that peer after the runner says
it is ready. The runner observes the application's public preload bridge and
main-process native clipboard boundary; it performs the harmless readiness interaction below but does not automate
Google, receive token strings, or extract stored credentials.

Only the Electron clipboard boundary is replaced with memory so the operator's
system clipboard is neither read nor changed. A pass requires a new Remote Clip
in public Clipboard History, application to that memory clipboard, a circuit
connection to its originating Device Identity through a Ready managed relay,
and a connection to that relay over the selected transport. Ready means the
controller completed authentication, reservation and Rendezvous registration.
Direct device dials, incoming direct device connections, direct listeners,
mDNS/bootstrap discovery, DCUtR and circuit-signalled WebRTC are disabled for
this opt-in. Relay-server connections remain direct and must use the selected
transport. The runtime candidate filter requires canonical discovery addresses
with a terminal Peer ID; the receipt separately classifies transport components
in the actual upgraded connection address. This independent observation avoids
inferring a transport pass from the configured filter alone. A timeout, degraded
state, plaintext fallback, direct peer path or
absence of clip receipt cannot produce a pass.

## Readiness and diagnostic evidence

Use a fresh, isolated profile to check native readiness without a relay, provider
login, paired peer or host clipboard access:

```sh
node scripts/electron-relay-acceptance.mjs \
  --profile /absolute/isolated-readiness-profile \
  --effort approved-effort-id \
  --history-root /absolute/durable-private-evidence/native-history \
  --transport wss \
  --output /absolute/durable-private-evidence/electron-readiness \
  --preflight-only
```

Every invocation removes the candidate's generated `apps/electron/dist`, runs
`npm --workspace apps/electron run build` with a three-minute limit, and records
Git revision, dirty state, a source fingerprint, and hashes of every generated
artifact. The source must remain unchanged during the build and preflight, and
built artifacts must remain unchanged through the interaction. A successful
no-op build cannot reuse stale output. Tracked symbolic links contribute their
link identity to the source fingerprint; installed dependency binaries are not
claimed to be source files. The observed Electron executable path and runtime
versions are recorded separately.

Before relay assertions, the runner verifies the launched PID, launch argument,
canonical profile, owned BrowserWindow/webContents IDs, renderer PID and exact
built renderer URL. It activates only its owned app and window, waits at most
five seconds for native focus, and checks native and renderer focus before and
after native mouse input toggles History **Pinned**, then **All**. The normal
renderer must show the resulting active filter. This is a harmless filter
change; DOM/bridge availability alone cannot pass readiness. A readiness-only
pass does not qualify relay transfer, provider login, native toolbar popups or
any larger UX matrix.

Select a stable `--effort` from the owning run record and one durable
`--history-root` outside disposable worktrees. The semantic key combines that
effort, readiness or transport/discovery scenario, hostname, OS and architecture.
Candidate revisions, output directories, profiles and the optional human
`--environment` label do not change that key. A per-user registry anchors its history location across linked worktrees and
independent frozen candidate clones. Its default location follows the existing
Acceptance convention: macOS `~/Library/Application Support/Clipp/Acceptance/native`,
Windows `~/AppData/Local/Clipp/Acceptance/native`, or Linux
`~/.local/state/clipp/acceptance/native`. An owning run may explicitly configure
one canonical `CLIPP_ACCEPTANCE_STATE_ROOT` outside all checkouts. Keep that state
location fixed across continuations and candidates; changing it requires explicit
reconciliation of its registry and histories, not a new output label. Changing a
registered history directory is refused. Preserve the registry with the evidence.

`--output` receives `history.json` (the canonical history pointer), links to
`attempts.json` and the current `attempt-N` directory, and a latest `receipt.json`.
Canonical failed receipts and private artifacts remain under the history root.
Exclusive admission and active-worker locks prevent concurrent diagnostic workers.
If an active worker disappears, its unfinished attempt becomes an `unknown`
interruption receipt; it still consumes an attempt. Live or unobservable ownership
is refused. An interrupted admission transition requires operator reconciliation
of its short-lived `.admission.lock`, preserving all existing history.

Existing version-1 histories keep their original timing and attempt semantics.
For the same semantic case, import earlier failures explicitly with one or more
`--import-history /absolute/old/attempts.json` arguments on first registration.
The runner copies their artifacts, retains each original history/attempt reference,
adds their attempt counts, and preserves the earliest diagnostic start. It refuses
active or incompatible histories and implicit replacement of a legacy output.
An exhausted import remains exhausted. Keep the original failed evidence.

A budget renewal requires an explicit authorized decision under the owning run's
policy. Write a private JSON decision containing `previousHistory` (the canonical
path in `history.json`), `authorizedBy` (the actual decision source) and `reason`.
Use `--renewal /absolute/decision.json` together with a changed diagnosis and
expected observation. The runner references the failed prior history and creates
a separate budget generation whose first rebuild is diagnostic and charged; it never replaces the old failure. The decision
file records authorization; creating it does not itself grant authorization.

After a passed scenario, a genuinely changed committed candidate may receive a
new ordinary qualification batch. Supply `--successor /absolute/successor.json`
with `previousHistory` (the current canonical history), `candidateRevision`
(the new full committed revision), `affectedScenarios` (including
`electron-readiness` or `electron-<transport>`) and `reason`. The runner requires
a passed predecessor, binds the initial successor attempt to that clean revision,
and retains the predecessor history/receipt. This first ordinary build has the
initial-setup timing exemption. A failed scenario cannot use this path; subsequent
diagnostics retain their existing attempt/time budget across candidate fixes.

One initial attempt and at most four diagnostic attempts are allowed (five
attempts total). After a
failure, a retry requires both `--diagnostic-change` (changed hypothesis or
environment) and `--expected-observation` (what will distinguish the diagnosis).
An absent or repeated change is refused. A 20-minute diagnostic clock starts
when the initial failure is recorded; diagnostic builds consume that clock.
Initial builds and normal acceptance are outside it. Commands receive the
remaining budget and retain their individual bounded limits. Native observations
have a default 30-second command deadline (`--command-timeout-ms` may shorten
it); cleanup has its own default ten-second total allowance (`--cleanup-timeout-ms`
may shorten it), outside the diagnostic clock. Graceful close, ownership inspection,
forced-exit observation, log draining and profile-handle cleanup share that one
allowance. Rejected signals or signals without an observed exit retain uncertain
shutdown and the profile ownership record. Failed readiness withholds the relay scenario; unrelated
eligible work can continue.

Receipts retain the failure stage and classification: `prerequisite` for
candidate/build setup, `runner` for target/focus/interaction, diagnostic limits or
cleanup, `product` for observed relay invariant violations after readiness, and
`unknown` for transfer timeout or unexplained transfer failures. A cleanup
failure cannot produce a pass and is retained separately when there was already
a primary failure. Only the launched ChildProcess may be terminated, after its current parent,
process group, start/command identity and unique launcher marker match the recorded ownership.
An exited handle or mismatched/reused PID is never signalled. Missing process
visibility preserves cleanup uncertainty and the profile ownership record. A
successor checks current recorded ownership; it may proceed after the old owned
child exited or the PID demonstrably belongs to another command. It does not
claim every historical detached descendant was absent. Profile and log cleanup
failures are failures too.

All artifacts are private (files mode 600, directories mode 700); receipts now
contain exact local target paths and must be reviewed/redacted before sharing.
Only allowlisted error classes and reasons enter the receipt; exception details
and diagnostic prose stay in private evidence. No tokens, Peer IDs, clip content
or provider account identity are added to receipts. The clipboard metadata
explicitly reports `hostUsed: false`, `hostChanged: false`, and restoration
`not-requested`: the existing memory fixture remains in place. Google
authorization remains unobserved by this runner; record actual browser
callback/exchange separately. Deterministic command fixtures qualify only the
runner gates, never actual native readiness or provider behavior.

The normal Electron adapter currently prefers WSS to avoid libp2p joining a
stalled private TCP dial for the same relay Peer ID. The specification requires
TCP, WSS, then WebRTC Direct. This acceptance tool preserves existing production
ordering while measuring each public transport independently; a TCP-only pass
alone does not prove bounded mixed-address fallback or settle that discrepancy.

This test uses the approved relay/account allowance. It changes no server
configuration or grants beyond normal explicit login and renewal, and does not
authorize deployment, publication or load testing.

## Recorded qualification

On 2026-10-05, `npm run check` passed all runtime typechecks and 73 suites /
599 tests; lint and the Electron build passed. New focused tests first failed
for direct listeners under relay isolation, unselected relay transport dials,
and a symlink alias of normal profile storage, then passed after their fixes.

A 120-second trial used the exclusive preserved test profile and its existing
app name on macOS 26.4.1 arm64, actual Electron 43.4.0 / embedded Node 24.18.1.
Main-process safeStorage reported encryption available; no provider name was
exposed. The UI remained `login_needed`; the runner timed out, returned failure,
and closed its own Electron process. Forced WSS connection and Remote Clip
receipt therefore remain unverified. The earlier restricted-process launch
failed before bootstrap; permitted native execution opened the actual runtime.
Private logs and receipt remain in ignored local artifacts.

Real Google login/callback, authenticated reservation/Rendezvous and forced
TCP/WSS/WebRTC Direct receipts, native restart/rotation/save-failure behavior,
and discovery/blocked/quota/reconnect lifecycle remain acceptance gates. Existing
deterministic credential/controller tests cover their agreed seams only.

## Post-crash WSS qualification

On 2026-10-05, the preserved test profile restarted and reached `ready` without
another interactive login. A fresh marker from the paired peer passed the
actual Electron runner: a new Remote Clip was received and applied to the
isolated memory clipboard, its source used the expected managed circuit, the
relay-server connection used WSS, and no direct device connection was present.
The private receipt is under
`.local/managed-relay/artifacts/frontier-20261004/electron/live-wss-after-crash`.
This establishes WSS transfer and authenticated reservation/Rendezvous for this
run; the runner did not observe the original Google browser flow.

A read-only comparison with the pre-test recovery snapshot confirmed unchanged
Device Identity, key material, creation time and Membership View. Only advertised
multiaddrs changed. The same actual macOS/Electron versions above were used;
OS encryption remained available. Full rotation, save-failure and provider
invalidation behavior still require their own native evidence.

On integrated local `main`, Node 24.16.0/npm 11.13.0 passed `npm run check`
(73 suites, 600 tests and all runtime typechecks) and the Electron build.
TCP, WebRTC Direct and bounded mixed-address fallback remain unverified.

The runner gives cleanup a ten-second total allowance, reserving part for
current ownership and exit observation. If runtime shutdown hangs, it verifies current ownership before terminating that launched process, records
`owned_test_shutdown_timeout`, and exits unsuccessfully. A received clip cannot
turn this shutdown failure into a passed receipt. A nonzero or signaled process
exit also fails acceptance; graceful shutdown requires exit code zero and no
signal. The private profile remains
available for inspection; other Electron processes are unaffected.

## Prepare a frozen candidate

From the maintained source checkout, select an explicit committed revision and a
tracked file defining the selected scenario. Preserve excluded dirty work in its
original checkout with its owner recorded in the run record. Preparation reads
committed source and never cleans that checkout.

```sh
npm run acceptance:candidate -- prepare \
  --source /absolute/source-checkout \
  --revision FULL_COMMITTED_REVISION \
  --destination /absolute/new-acceptance-checkout \
  --scenario electron-relay-wss \
  --scenario-input docs/electron-relay-acceptance.md
npm run acceptance:candidate -- verify \
  --record /absolute/new-acceptance-checkout.candidate.json
```

Use Node.js 22.22.1 or newer and npm. Preparation creates a detached independent
Git clone, runs `npm ci` with the selected lockfile and normal lifecycle scripts,
explicitly provisions the installed locked Electron package through its
`install-electron` entry using Node, then runs the existing Electron workspace
build. This is the installed-package equivalent of offline `npm exec --no --
install-electron`; it cannot fetch a replacement CLI. Electron's installer may
fetch the pinned distribution using its normal download/checksum handling. It refuses existing
destinations; failures preserve the partial checkout for diagnosis. Choose a new
destination after correcting a failure. No shared dependency installation or
manual native-module copying is supported.

Unset `ELECTRON_OVERRIDE_DIST_PATH`: preparation rejects it before cloning or
running installation, so user distributions cannot become installation targets.
Cross-platform/architecture installer overrides are also rejected unless they
match the selected host. The downloaded distribution stays in the candidate's
installed Electron package. Provisioning files does not launch Electron or load
its native addons.

The mode-600 sibling candidate record binds the committed revision, all tracked
input hashes (at most 20,000 files), Node/npm/platform/architecture, resolved
installed Electron version, scenario definition and runner inputs, npm installation
lock identity, preparation command version and built `dist` file hashes.
Tracked source symlinks bind their link text; internal generated targets may be
absent before installation. Declared package, runner and scenario inputs still
require regular files. Dependency checks reject external links in root and workspace installations;
they do not certify every optional dependency or load native addons. Source and
build changes during preparation fail before publication of the record.

The main/preload build commands emit esbuild metadata alongside their bundles.
Preparation uses those current build outputs to select external package inputs,
with Node built-ins supplied by the bound Electron distribution. It requires
Electron's installed `path.txt` contract and the declared executable, and binds
installed package/distribution bytes, internal symlink identities and executable
permission bits. It also binds each package actually emitted as an external
import, resolved with the corresponding require/import condition. Packages only
listed in build configuration are not prerequisites when the build does not emit
them. Nested `node_modules` are excluded from these package snapshots; this is
an explicit build-boundary snapshot, not transitive import certification.

The selected installed-runtime snapshot allows at most 32 packages, 50,000
aggregate filesystem entries and 2 GiB aggregate file bytes, with a 512 MiB
single-file limit. Each build metadata file is limited to 4 MiB. Missing selected
packages or the Electron executable fail preparation. The returned artifact
identity combines application and installed-runtime snapshots. Checking file
presence and identity does not load native modules or prove their ABI/startup.

Keep this record and its checkout together outside disposable ticket worktrees.
Before runtime acceptance, run `verify` using the same preparation command and
toolchain. It fails for source mutation, moved checkouts, changed inputs,
installation lock changes, external dependency links, changed Electron versions,
changed runtime bytes or execution permissions, and missing or stale artifacts. The JSON result supplies the frozen artifact
identity for runtime receipts. Launch the acceptance runner from the verified
candidate checkout so its relative build and dependency paths select that build.
Runtime adapters must compare their loaded or installed artifact with this record;
verification alone does not establish what a running process has loaded.

A relevant fix gets a new destination and record. Pass
`--previous /absolute/previous.candidate.json --affected scenario-id,other-id`
to bind the successor to a verified predecessor and explicitly name the affected
scenarios. This records impact scope; it never invents reusable passing evidence.
Leave the original frozen candidate intact. If it was mutated, preserve it as
failed evidence and reconcile it before creating a successor through this path.

`npm run check:candidate` runs disposable real-Git command fixtures as part of
`npm run check`. These deterministic fixtures prove preparation control behavior.
A real isolated install/build is still required for the selected application
candidate. Actual native addon loading/ABI, startup, owned-window interaction,
Pairing, and installed Android/Chrome artifact checks remain separate runtime
qualification. The unmerged operational verification/status tools remain an
external prerequisite; this command does not replace them.
