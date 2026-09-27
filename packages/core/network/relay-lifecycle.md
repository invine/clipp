# Relay lifecycle boundary

`RelayLifecycle` owns relay dialing, reservation retries, exact Rendezvous
registration and lookup, and relay-only cleanup on the existing libp2p host.
Its internal lifecycle is `start(host, relayAddresses)`, `stop()`, and
`reconfigure(host, relayAddresses)`. Reachability updates trigger a registration
pass, while lookup accepts verified Signed Peer Records through the transport's
existing import and revocation checks. A generation fence prevents a pass from
an earlier start from scheduling work in a later start.

`Libp2pMessagingTransport` currently calls only `start` and `stop`, retaining
the existing `relayAddresses` option for all runtimes. `createClipboardNode`
still installs its configured circuit listeners at host creation for startup
compatibility; the lifecycle retries missing reservations and closes its relay
listeners and connections when stopped. A later configuration integration can
wire `reconfigure` after replacing that startup adapter. Relay lifecycle
cleanup never stops the host or closes connections to Device Network members.
