# Electron managed relay acceptance

The selected scenario consumes a frozen candidate prepared by the maintained
candidate command below. Run from that candidate checkout with its record and a
nonprivate marker that a paired peer will send:

```sh
node scripts/electron-relay-acceptance.mjs \
  --candidate-record /absolute/frozen.candidate.json \
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
  --candidate-record /absolute/frozen.candidate.json \
  --profile /absolute/isolated-readiness-profile \
  --effort approved-effort-id \
  --history-root /absolute/durable-private-evidence/native-history \
  --transport wss \
  --output /absolute/durable-private-evidence/electron-readiness \
  --preflight-only
```

With `--candidate-record`, the runner calls the maintained candidate `verify`
command within its remaining deadline. It requires the record's checkout to be
the executing runner's source root, its committed revision to match clean source,
and its scenario to match the selected observation. Verification checks the
existing source, lockfile, installation, build and selected-runtime identities.
The runner launches the record's verified Electron executable and leaves the
frozen build unchanged. It performs no installation or rebuilding during this
path. Stale application/native bytes or a wrong checkout/scenario fail at the
`frozen-candidate` prerequisite stage.

The owning Electron process then loads exactly the required startup dependencies:
construct/close an in-memory `better-sqlite3` Database and load `@koush/wrtc`.
The loader chooses the installed supported prebuild; absence of an old
`build/Release` path is not a missing-addon finding. Native observations record
Electron/Node, module ABI, Node-API, OS/architecture and resolved package entry
paths. Missing selected loaders, actual ABI/load failures and wrong-runtime
observations fail at `required-native`, separately from actual product startup.
The wrapper then requires the real `main.cjs`; an owned usable product window and
public bridge remain necessary. A successful native probe alone cannot pass.
Unselected optional/tooling branches need no universal loading proof.

For existing readiness/control callers, `--preflight-only` without a candidate
record retains the earlier bounded local build behavior: remove generated dist,
build with a three-minute limit, and record source/build identities. Its result
is scoped readiness evidence, not frozen-candidate consumption or ticket05
qualification. Selected local behavior and relay qualification require a record.

Before relay assertions, the runner verifies the launched PID, launch argument,
canonical profile, owned BrowserWindow/webContents IDs, renderer PID and exact
built renderer URL. It activates only its owned app and window, waits at most
five seconds for native focus, and checks native and renderer focus before and
after native mouse input toggles History **Pinned**, then **All**. The normal
renderer must show the resulting active filter. This is a harmless filter
change; DOM/bridge availability alone cannot pass readiness. A readiness-only
pass does not qualify relay transfer, provider login, native toolbar popups or
any larger UX matrix.

### Focused local History behavior

Prepare with scenario ID `electron-clipboard-history`, then run from that frozen
checkout:

```sh
node scripts/electron-relay-acceptance.mjs \
  --candidate-record /absolute/frozen.candidate.json \
  --effort approved-effort-id \
  --history-root /absolute/durable-private-evidence/native-history \
  --profile /absolute/isolated-history-profile \
  --transport wss \
  --output /absolute/durable-private-evidence/electron-history \
  --scenario clipboard-history
```

After readiness, the runner writes a fresh synthetic marker only to its memory
clipboard boundary, observes the product capture a new Local Clip through its
public bridge, clicks that Clip's **Pin** control with native mouse input, opens
**Pinned**, and verifies the visible Clip and persisted public pinned state.
The profile remains disposable and owned. This proves the selected local capture
and pinning behavior; it does not qualify Pairing, provider login, restart, remote
exchange or the complete UX matrix. Native startup/interaction remains an actual
supported-host gate; public command fixtures establish control behavior only.

Candidate scenario IDs are `electron-readiness` for `--preflight-only`,
`electron-clipboard-history` for the focused local case, or `electron-tcp`,
`electron-wss`, `electron-webrtc-direct` for selected relay transfer. Keep the
same approved effort/state/history across successor candidates for a scenario.

This maintained frozen preflight replaces the selected Electron preparation
SEAL/dependency-graph prerequisite. Earlier failed SEAL attempts remain historical
failures and receive no new passing label. UX ticket10 owns adoption of this
boundary in its existing private Pairing harness and the two-runtime journey;
this guide does not migrate or close that owner's outstanding matrix.

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
An exited handle or mismatched/reused PID is never signalled. Launch intent and
unresolved target ownership are retained with the canonical semantic case across
all output directories and profiles. Intent is saved before calling the launcher;
the returned child PID is saved before process-identity inspection. Finishing an
uncertain attempt retains that ownership record. A continuation checks the prior
target before admission, even when it selects a fresh profile. If interruption
left the child identity unknown, admission stays refused while the unique launch
marker is currently present or process visibility is unavailable. After its old
worker is gone, a bounded current marker observation can establish isolation;
this makes no claim about every possible historical detached descendant. Missing process
visibility preserves cleanup uncertainty and the profile ownership record. A
successor checks current recorded ownership; it may proceed after the old owned
child exited or the PID demonstrably belongs to a replacement process. Profile and log cleanup
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
  --scenario electron-wss \
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
Tracked paths preserve the exact NUL-delimited Git listing, including leading
whitespace and embedded newlines. Source symlinks bind their link text; internal generated targets may be
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
The Electron runner consumes this record and records its selected native loader,
actual executable and product startup observations; verification alone does not
establish what a running process has loaded.

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
qualification. The shared diagnostic policy and runtime commands remain separate from
preparation; this command does not replace their actual native observations.

## Joint Chrome–Electron relay Accept case

`--scenario relay-pairing --pairing-record /absolute/private/pairing.json`
uses this Electron runner and the maintained Chrome toolbar runner in one bounded
case. It consumes a frozen `electron-relay-pairing` candidate and the normal
production main process. It does not use the direct-only protocol counterpart
entry. The adopted product must expose Devices → Pair this device, Requests,
Show my QR, Copy pairing text, Paste pairing text and Submit pairing text. Missing
native controls fail the case; this command does not synthesize product actions.

The private JSON record has `version: 1`, `registeredExtensionId` (the real
registered Chrome ID), and `chromeArguments`, the existing toolbar CLI arguments
with `--scenario toolbar-relay-pairing`, the same `--effort`, `--discovery`, and
`--candidate-record` as Electron, plus `--registered-extension-id`. Include the
existing absolute `--history-root`, `--output`, and `--extension-record` paths.
Electron scalar options are unique; only `--import-history` may repeat. Companion
cleanup confirmation uses each caller's remaining existing cleanup allowance.
An optional `--extension-directory` is the raw registered load path; it is read
only. The extension sidecar retains the existing candidate/browser/artifact
fields plus `registeredExtensionId`, `stagedExtensionPath`, `rawLoadPath` and
`realLoadPath`, `relayAcceptanceTransport: "wss"` and
`acceptanceMemoryClipboard: true`. Stage the build in the frozen checkout and bind both actual and
staged bytes to that sidecar. The actual CDP install acknowledgement must equal
the registered ID, followed by the existing enabled/path inventory check.
A path string or a successful callback HTTP response does not establish that ID.

Any approved physical-path setup, byte backup or alias restoration is a separate
operator prerequisite. This command neither replaces a registered bundle nor
copies a Chrome profile, Device Identity, credential or login token. Before the
bounded Pairing case, run the explicit normal account-preparation phase below
with its own named setup history. It creates an owned profile under the canonical
host acceptance root. Within one setup attempt and deadline it first launches plain
owned Chrome at `chrome://extensions/`, without a debugger or automation flags.
The user enables Developer mode, uses **Load unpacked** with the exact printed
approved path, checks the printed registered ID, and opens the normal extension
options. In Settings / Connections the user adds only the approved relay if
absent, uses **Log in**, completes Google authorization, then quits that owned
Chrome. Do not open DevTools or use an ordinary profile. The frozen build's early
memory boundary applies without debugger injection; this is a source guarantee,
not a runtime observation of the human phase.

Only after positive owned closure is recorded does setup relaunch the same profile
for controlled verification. It requires the already normally installed, enabled,
unique matching ID/path; it never silently installs or logs in under the debugger.
It independently observes early memory isolation, actual offscreen WSS/memory,
approved relay Ready and the public Device Identity before final verified shutdown
and immutable preparation proof. Human readiness claims alone cannot pass. Missing
installation or login-needed state fails as a prerequisite; uncertain closure
retains ownership and prevents the next launch. This is account setup, not native
Pairing qualification. CDP-loaded extensions are session installations and cannot
substitute for normal persistent Load unpacked. Pairing reuses that same normal
installation rather than reinstalling it.

The Pairing manifest's Chrome arguments must include `--profile-root` and
`--profile-record`. The allowed profile root is exactly
`<canonical nativeAcceptanceStateRoot()>/owned-chrome-profiles`; it cannot select
an ordinary Chrome profile. Both phases use the same private record, frozen
source/browser/registered-ID/raw-real-path/bundle binding and normal public Device
Identity. A missing proof, alias, active or uncertain owner, Chrome SingletonLock,
changed binding or exclusive-lock conflict refuses reuse. The helper never reads,
hashes or copies account/profile data. Only its own ownership and debugger-endpoint
metadata are inspected. Uncertainty retains ownership rather than deleting data.

Normal login happens before the feature attempt. The case rechecks both own
sessions automatically, refuses login-needed states and retains its existing
attempt/time history across profile/output choices. A Ready Electron cannot
substitute for Chrome's own Ready session. The ordinary `toolbar-history` command
keeps its fresh temporary profile and removal behavior.

Both existing semantic attempt ledgers admit before native launch. Electron's
native Local Clip/Pin preflight completes before Chrome takes focus; Chrome's
actual-toolbar Local Clip/Pin preflight also remains required. The case copies
the real public signed target through Electron's process-memory clipboard, types
it into the actual Chrome popup, observes the matching incoming request, clicks
Electron Accept through native input, then checks reciprocal public Membership,
Devices and Chrome's acceptance response. Product decoding and networking verify
the signed target. Both device connections must traverse the selected relay with
no direct device path. The target, names and auth payloads are never written to
the public receipt. Both immutable runtime receipts require both positive owned
cleanup outcomes; uncertainty or one companion failure prevents either pass.

This observation qualifies one relay Accept case and the two preflights. It does
not qualify rejection, restart or clip exchange, debugger-free Chrome worker
lifecycle, or a different application revision. Preserve the native receipt's
actual candidate revision when adopting it into another effort.

For this joint case, build Chrome with the existing maintained forced-relay mode
inside the frozen candidate, preserving the registered ID's actual value:

```sh
CLIPP_RELAY_ACCEPTANCE_TRANSPORT=wss \
CLIPP_RELAY_ACCEPTANCE_MEMORY_CLIPBOARD=1 \
VITE_CLIPP_REGISTERED_EXTENSION_ID="$CLIPP_REGISTERED_EXTENSION_ID" \
npm --workspace apps/extension run build:relay-acceptance
```

The staged artifact root is
`apps/extension/.local/relay-acceptance/wss`, not the ordinary `dist` build.
The sidecar must bind that root, `relayAcceptanceTransport: "wss"` and
`acceptanceMemoryClipboard: true` in addition
to source revision, base record/artifact, browser identity, raw/real registered
load paths, expected ID and every bundle file hash. Before any Pairing action the
runner reads the existing owning offscreen `getStatus` and requires its compiled
`relayAcceptanceTransport` to be `wss` and `acceptanceMemoryClipboard` to be true;
metadata labels alone cannot qualify an
ordinary build. Electron uses its normal compiled main and the existing runner's
`CLIPP_RELAY_ACCEPTANCE_TRANSPORT=wss`/isolated profile environment. Both paths use
the existing shared connection gate to reject direct device dials, inbound
connections and WebRTC upgrades while retaining normal managed login/session and
signed Pairing. Actual selected-relay route observations remain required too.
No TLS, authentication or Pairing-signature bypass is enabled.

The separate memory flag defaults to false, rejects enabling in ordinary builds,
and does not alter transport-only native clipboard acceptance. When explicitly
enabled it installs before application startup in every relevant extension world,
suppresses content-script copy-event capture, isolates navigator read/write in
per-context memory, and blocks legacy `execCommand` copy/cut/paste from reaching
the OS. Offscreen app-owned writes use the working private-memory adapter. This
mode makes no native Clipboard Exchange claim.

From the frozen checkout, normal Chrome account setup uses:

```sh
node apps/extension/scripts/verify-clipboard-io.mjs \
  --scenario toolbar-relay-account-preparation \
  --effort approved-effort-id \
  --history-root /absolute/durable-native-history \
  --output /absolute/private-account-setup-evidence \
  --candidate-record /absolute/frozen-case.candidate.json \
  --extension-record /absolute/private-extension-sidecar.json \
  --extension-directory /absolute/approved-registered-load-path \
  --registered-extension-id "$CLIPP_REGISTERED_EXTENSION_ID" \
  --discovery https://approved-relay.example/v1/relay \
  --profile-root /absolute/canonical-native-state/owned-chrome-profiles \
  --profile-record /absolute/canonical-native-state/owned-chrome-profiles/pairing.json \
  --timeout-seconds 600
```

If normal sign-in and owned closure completed but preparation failed before Ready,
the maintained tooling may retry only verification using the same arguments plus
`--verification-only`, a changed diagnosis and its expected observation. This uses
the same semantic scenario and budget; it grants no new attempt or time allowance.
It requires an existing closed-unprepared or prepared owned record, matching
marker/nonce and exact candidate/route/browser/bundle binding, positive closure of
the last target, and no SingletonLock. Ordinary preparation reuse and Pairing keep
their existing proof barriers. Missing or expired login fails without starting
human authentication, configuration changes, OAuth or extension installation.

For this mode only, invoke the reviewed maintained tooling while leaving the app
candidate frozen: its physical application checkout is read from the existing
candidate record. Before execution, the bounded regular frozen verifier must hash
identically to both that record's preparer and the maintained trusted preparer.
The verifier and staged extension use the validated application root; evidence
stays outside both checkouts. Freeze/build is forbidden. The receipt records the
maintained tooling script hashes separately from the app revision and artifacts.
Only current exact installation inventory, early memory/WSS runtime proof, public
Ready/identity and positive final closure produce a preparation proof. This mode
never qualifies Pairing itself or retroactively verifies the earlier human phase.
Pre-admission ownership refusals keep their existing fixed codes and create no
attempt merely for logging; post-admission verification failures retain only an
allowlisted guard code in private diagnostics, without raw exception details.

The user enters credentials only in normal Google UI. Setup records only the
selected status/public identity and filtered ownership metadata; OAuth URLs,
callback code/state, cookies and credential payloads are not dumped even in
private operation diagnostics. Put the same profile arguments into
`pairing.json`'s Chrome arguments before running the joint Electron command.
The Electron owning profile must already have its own normal login; preserve its
existing `--app-name` (for the selected UX profile, `Clipp UX Pairing Relay`).
Retained Chrome history preflights use a fresh marker and exact new captured/pinned
Clip ID, preserving prior clips/pins rather than resetting the profile.
