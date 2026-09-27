# Relay lifecycle boundary

`RelayLifecycle` owns relay dialing, reservation retries, exact Rendezvous
registration and lookup, and relay-only cleanup on the existing libp2p host.
Its internal lifecycle is whole-set `start(host, relayAddresses)` and `stop()`.
Reachability updates trigger a registration pass, while lookup accepts verified
Signed Peer Records through the transport's existing import and revocation
checks. A generation fence prevents a pass from an earlier start from
scheduling work in a later start.

Cleanup tracks new connections returned by relay dials, connections identified
by Circuit Relay reservation records, and a replacement opened after an owned
relay connection is lost. It removes the relay-specific keep-alive tag before
closing owned connections so libp2p's reconnect queue does not redial a stopped
relay. A pre-existing direct connection reused at the configured relay address
or another path to the same Peer ID remains open. Reservation listen attempts
are serialized; a late completion closes only listeners and connections
created by that attempt. A failed listener is retried in place, since closing
it would cancel reservations for all relays in stock Circuit Relay v2.

`Libp2pMessagingTransport` currently calls only `start` and `stop`, retaining
the existing `relayAddresses` option for all runtimes. It disables node startup
reservation listeners so the lifecycle can own every reservation attempt after
host creation. Direct callers of `createClipboardNode` retain its existing
reservation option. Stock Circuit Relay v2 shares one reservation store across
its listeners, and closing one listener cancels all reservations in that store.
Ticket 01 therefore exposes no selective relay update; ticket 12 must provide
a true per-relay mutation boundary without cycling retained relays. Relay
lifecycle cleanup never stops the host or closes connections to Device Network
members.

## Ticket 01 validation evidence

Environment: Darwin arm64, Node.js v26.10.0, npm 11.19.1. The worktree uses
the existing local `node_modules` dependency tree; no external relay was used.

| Command / scope                                                                                                | Starting commit `44ddde1`                  | Ticket branch after review fixes         |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ---------------------------------------- |
| `npm test -- --runInBand tests/core/network/engine.test.ts tests/core/network/rendezvous.test.ts --silent`     | 38/38 passed                               | 44/44 passed                             |
| `npm test -- --runInBand --silent tests/core/network/relayLifecycle.test.ts tests/core/network/engine.test.ts` | New controller test file did not exist     | 55/55 passed                             |
| `npm run lint -- --quiet`                                                                                      | Not run                                    | Passed                                   |
| `npm test -- --runInBand --silent`                                                                             | Not run                                    | 453/453 passed; 56/56 suites passed      |
| `node --import tsx tests/harness/pairing-harness.ts` with loopback bind permission                             | Passed in 13 s after import correction     | Passed in 12.8 s after import correction |
| `npm run check`                                                                                                | No `check` script in pinned `package.json` | Missing script                           |

The local real-network acceptance harness is
`node --import tsx tests/harness/pairing-harness.ts`. It creates a WebSocket
relay bound to `127.0.0.1` and exercises reservation, exact Rendezvous,
pairing, signed records, revocation and clip delivery. The baseline was an
isolated `git archive 44ddde1` snapshot with only its two `FaultTolerance`
imports changed from undeclared `@libp2p/interface-transport` to the already
declared `@libp2p/interface`; the ticket branch applies the same source repair.
Both runs exited 0. The ordinary sandbox denies loopback bind; both passing
runs used the required bind permission. `tsx` through its CLI was also blocked
by sandbox `EPERM` while creating its local IPC pipe; `node --import tsx`
avoids that IPC step.

Direct TypeScript checks of root, Electron main, Android and extension are not
green at this pinned commit. They include existing errors outside the lifecycle
changes; the root check also reports an incompatible nested libp2p `Connection`
type in `relay/server.ts`. The focused Jest suites use the shared controller
and transport seams with libp2p boundary doubles. Native runtime runs were not
part of this ticket.

The controller regressions were observed red before the fixes for DNS-to-IP
connection cleanup, a replacement opened after listening, and same-address
reused direct connections. A second direct connection after loss also went red
before reconnect tracking was limited to peers with no surviving connection.
The shared reservation store constraint invalidated the earlier selective
reconfiguration tests and API; both were removed before this validation run.
