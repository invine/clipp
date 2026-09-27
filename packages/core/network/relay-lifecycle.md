# Relay lifecycle boundary

`RelayLifecycle` owns relay dialing, reservation retries, exact Rendezvous
registration and lookup, and relay-only cleanup on the existing libp2p host.
Its internal lifecycle is whole-set `start(host, relayAddresses)` and `stop()`.
Reachability updates trigger a registration pass, while lookup accepts verified
Signed Peer Records through the transport's existing import and revocation
checks. A generation fence prevents a pass from an earlier start from
scheduling work in a later start.

Cleanup tracks new connections returned by relay dials and connections opened
during managed listen or retry attempts, identified by Circuit Relay reservation
connection IDs. It removes the relay-specific keep-alive tag before closing
owned connections so libp2p's reconnect queue does not redial a stopped relay.
Direct connections remain open, including a new direct dial to the same Peer ID
or address after relay connection loss. A ReconnectQueue connection opened
before a managed retry is indistinguishable from an independently dialed direct
connection reused by that retry. Stop conservatively leaves it open while
clearing its relay tag, listener, reservation and Rendezvous work. The remaining
physical connection closes with the host or peer. Reservation listen attempts
are serialized; a late completion closes only listeners and connections
created by that attempt. Closed owned connections are removed from the
ownership set during long-running retry cycles. A failed listener is retried in
place, since closing it would cancel reservations for all relays in stock
Circuit Relay v2.

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

## Historical ticket branch evidence before baseline approval

Environment: Darwin arm64, Node.js v26.10.0, npm 11.19.1. The worktree uses
the existing local `node_modules` dependency tree; no external relay was used.

| Command / scope                                                                                                | Pinned starting commit `44ddde1`           | Isolated ticket branch after review fixes |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ----------------------------------------- |
| `npm test -- --runInBand tests/core/network/engine.test.ts tests/core/network/rendezvous.test.ts --silent`     | 38/38 passed                               | 44/44 passed                              |
| `npm test -- --runInBand --silent tests/core/network/relayLifecycle.test.ts tests/core/network/engine.test.ts` | New controller test file did not exist     | 58/58 passed                              |
| `npm run lint -- --quiet`                                                                                      | Not run                                    | Passed                                    |
| `npm test -- --runInBand --silent`                                                                             | Not run                                    | 456/456 passed; 56/56 suites passed       |
| `node --import tsx tests/harness/pairing-harness.ts` with loopback bind permission                             | Passed in 13 s after import correction     | Passed in 12.8 s after import correction  |
| `npm run check`                                                                                                | No `check` script in pinned `package.json` | Missing script                            |

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

At the historical pinned commit, direct TypeScript checks of root, Electron
main, Android and extension were not green. They included existing errors
outside the lifecycle changes; the root check also reported an incompatible
nested libp2p `Connection` type in `relay/server.ts`. The focused Jest suites
used the shared controller and transport seams with libp2p boundary doubles.
Native runtime runs were not part of this ticket.

## Integration on the approved Clipp baseline

The approved isolated baseline snapshot `abc751a` preserves the original 52
uncommitted changes byte for byte; its `npm run check` passed 439 tests. The
ticket implementation was merged into that baseline as `be506bc`. On the
integrated tree, Node.js v26.10.0 and npm 11.19.1 ran all shared, Electron,
Android and extension type checks through `npm run check`; Jest passed 462/462
tests across 56 suites after the peer-store shutdown regression fix. `npm run
lint` exited 0, and `node --import tsx tests/harness/pairing-harness.ts`
passed using localhost bind permission. The original working checkout was not
changed.

The controller regressions were observed red before the fixes for DNS-to-IP
connection cleanup, a replacement opened by a retry after listening, and
same-address reused direct connections. A direct connection after total relay
connection loss went red before Peer ID-only ownership inference was removed.
The shared reservation store constraint invalidated the earlier selective
reconfiguration tests and API; both were removed before this validation run.
