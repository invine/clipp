# Relay lifecycle boundary

`RelayLifecycle` owns relay dialing, reservation retries, exact Rendezvous
registration and lookup, and relay-only cleanup on the existing libp2p host.
Its internal lifecycle is `start(host, relayAddresses)`, `stop()`, and
`reconfigure(host, relayAddresses)`. Reachability updates trigger a registration
pass, while lookup accepts verified Signed Peer Records through the transport's
existing import and revocation checks. A generation fence prevents a pass from
an earlier start from scheduling work in a later start.

`reconfigure` changes only added and removed relay entries: unchanged
connections and listeners remain live, and their registrations are refreshed
with the current Signed Peer Record when self addresses change. Configuration
mutations and reservation listen attempts are serialized so a late completion
cannot clean up a newer attempt. Cleanup tracks connections returned by relay
dials, including DNS addresses resolved to IPs; an exact configured-address
match also covers relay connections established by startup listeners. A
pre-existing direct connection with the relay's Peer ID remains open.

`Libp2pMessagingTransport` currently calls only `start` and `stop`, retaining
the existing `relayAddresses` option for all runtimes. `createClipboardNode`
still installs its configured circuit listeners at host creation for startup
compatibility; the lifecycle retries missing reservations and closes its relay
listeners and connections when stopped. A later configuration integration can
wire `reconfigure` after replacing that startup adapter. Relay lifecycle
cleanup never stops the host or closes connections to Device Network members.

## Ticket 01 validation evidence

Environment: Darwin arm64, Node.js v26.10.0, npm 11.19.1. The worktree uses
the existing local `node_modules` dependency tree; no external relay was used.

| Command / scope                                                                                                                                      | Starting commit `44ddde1`                  | Ticket branch after review fixes                                                                                                                                                                       |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm test -- --runInBand tests/core/network/engine.test.ts tests/core/network/rendezvous.test.ts --silent`                                           | 38/38 passed                               | 44/44 passed                                                                                                                                                                                           |
| `npm test -- --runInBand tests/core/network/relayLifecycle.test.ts tests/core/network/engine.test.ts tests/core/network/rendezvous.test.ts --silent` | New controller test file did not exist     | 55/55 passed                                                                                                                                                                                           |
| `npm run lint -- --quiet`                                                                                                                            | Not run                                    | Passed                                                                                                                                                                                                 |
| `npm test -- --runInBand --silent`                                                                                                                   | Not run                                    | 447 tests passed; 55 suites passed, one suite failed to compile (`tests/core/network/nodeAddressConfig.test.ts`) because `packages/core/network/node.ts` imports missing `@libp2p/interface-transport` |
| `npm run check`                                                                                                                                      | No `check` script in pinned `package.json` | Missing script                                                                                                                                                                                         |

The local real-network acceptance harness is
`node --import tsx tests/harness/pairing-harness.ts`. It creates a WebSocket
relay bound to `127.0.0.1` and exercises reservation, exact Rendezvous,
pairing, signed records, revocation and clip delivery. The ticket branch run
failed before startup with `ERR_MODULE_NOT_FOUND` for
`@libp2p/interface-transport`; `44ddde1` has the same import and no declared
dependency, so a before/after real-network comparison was not run. This is a
missing prerequisite, not passing harness evidence. `tsx` through its CLI was
also blocked by sandbox `EPERM` while creating its local IPC pipe; the
`node --import tsx` invocation avoids that IPC step.

Direct TypeScript checks of root, Electron main, Android and extension are not
green at this pinned commit. They include the missing transport module and
other existing errors outside the changed files; none reference
`relayLifecycle.ts`, `engine.ts`, or their tests. The focused Jest suites use
the shared controller and transport seams with libp2p boundary doubles; they
do not substitute for the blocked real-network harness or native runtime runs.

The controller regressions were observed red before the fixes for concurrent
reconfiguration, stale reservation completion, DNS-to-IP connection cleanup,
and retained-relay Signed Peer Record refresh. A shutdown-during-removal test
also went red before pending relay resources were included in stop cleanup.
