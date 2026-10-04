# Electron managed relay acceptance

Build with `npm --workspace apps/electron run build`, then run the actual
Electron runtime with a nonprivate marker that a paired peer will send:

```sh
node scripts/electron-relay-acceptance.mjs \
  --profile /absolute/isolated-test-profile \
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
main-process native clipboard boundary; it does not automate Google or other
runtime UI, receive token strings, or extract stored credentials.

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

The output directory contains a mode-600 receipt and private runtime log. Failed
runs also retain a mode-600 `failure.private.json` with exception details; keep
this file private and inspect it before retrying an unexplained early exit.
The public receipt reports only an allowlisted error class and assertion reason,
including decorated assertion messages. The
receipt records runtime/platform/provider, statuses and boolean path/receipt
evidence, without tokens, Peer IDs, clip content or account identity. Keep logs,
profiles, runner wrappers and screenshots ignored and private. The harness
reports Google authorization as unobserved: record actual browser callback/
exchange separately. Storage failure and rotation tests using deterministic
providers establish only the credential seam, not native provider behavior.

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
