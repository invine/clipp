# libp2p peer discovery for transitive Clipp membership

## Recommendation

Clipp cannot currently make transitive membership messages `PeerId`-only without making another discovery service mandatory. None of the configured libp2p facilities reliably maps an arbitrary trusted member's `PeerId` to a current, dialable address across Electron, Android, and the MV3 extension.

The smallest robust change is to separate:

- **membership:** Clipp's authoritative statement that a `PeerId` belongs to the Device Network; and
- **reachability:** the member's latest **libp2p signed `PeerRecord` envelope**.

When B introduces A to C, B should forward A's original envelope unchanged. C should verify and import it with `peerStore.consumePeerRecord(envelope, { expectedPeer: A })`, then dial A by `PeerId`. Only A creates replacements for A's reachability record; intermediaries only relay the opaque signed envelope. Add `identifyPush()` so already-connected peers receive address changes, and persist or reacquire current envelopes across restarts.

This does not make the peer record an authorization record. Clipp membership and revocation remain authoritative; the peer record only gives end-to-end provenance and freshness ordering to networking addresses.

The current Clipp-specific Rendezvous implementation is retained only as a scope-limiting placeholder for the present change. Its retention is not a recommendation for the eventual peer-discovery architecture; selecting that architecture remains a separate follow-up research task.

## What the built-ins provide

| Mechanism | Provides | Does not provide |
|---|---|---|
| Identify | A connected peer's own addresses, protocols, public key, and optional signed peer record. | Initial discovery or third-party introduction: C cannot Identify A until C can already connect to A. Identify Push updates already-connected peers only. ([Identify spec](https://github.com/libp2p/specs/blob/master/identify/README.md)) |
| Peer store | A local address book of known peers, addresses, metadata, and certified peer-record envelopes. | Discovery, membership synchronization, or durable storage by itself. The default js-libp2p datastore is memory-backed, and Clipp supplies no persistent datastore. ([js-libp2p configuration](https://github.com/libp2p/js-libp2p/blob/main/doc/CONFIGURATION.md), [PeerStore API](https://libp2p.github.io/js-libp2p/interfaces/_libp2p_interface.PeerStore.html)) |
| Signed `PeerRecord` | A peer-authored `PeerId`, public listen addresses, and monotonic sequence number in a signed envelope designed to be forwarded through untrusted intermediaries. | Clipp membership, proof that an address is reachable, or proof that the signer controls every claimed endpoint. ([routing-record RFC](https://github.com/libp2p/specs/blob/master/RFC/0003-routing-records.md), [signed-envelope RFC](https://github.com/libp2p/specs/blob/master/RFC/0002-signed-envelopes.md)) |
| mDNS | Opportunistic discovery of peers and addresses on the same LAN. | WAN discovery, authorization, or browser support. It depends on UDP multicast and is a Node-oriented js-libp2p module. ([js-libp2p mDNS](https://libp2p.github.io/js-libp2p/modules/_libp2p_mdns.html)) |
| Bootstrap | Static seed addresses that enter the peer store/discovery flow and can seed routing. | A member directory or arbitrary `PeerId` resolution. ([js-libp2p bootstrap](https://libp2p.github.io/js-libp2p/modules/_libp2p_bootstrap.html)) |
| Kademlia DHT / peer routing | `findPeer(PeerId)` and peer/address records after joining and bootstrapping a DHT. | Private-network membership or reliable discoverability of browser/client-only nodes. DHT peer records carry raw addresses, and public DHT results are not Clipp-authorized. ([Kad-DHT spec](https://github.com/libp2p/specs/blob/master/kad-dht/README.md), [PeerRouting API](https://libp2p.github.io/js-libp2p/interfaces/_libp2p_interface.PeerRouting.html)) |
| Rendezvous | Self-registration under an application namespace and discovery of signed peer records. | Authorization: namespaces are susceptible to spam/Sybil registration and must be filtered against Clipp membership. The official protocol is protobuf-based `/rendezvous/1.0.0`; the current js-libp2p module index has no standard Rendezvous implementation. ([Rendezvous spec](https://github.com/libp2p/specs/blob/master/rendezvous/README.md), [js-libp2p modules](https://libp2p.github.io/js-libp2p/modules.html)) |
| Circuit Relay v2 | Reachability through a relay after the target holds a live reservation; transport remains end-to-end encrypted. | Target discovery. The dialer must first learn the target's full circuit multiaddr through DHT, Rendezvous, or another mechanism. Reservations expire. ([Circuit Relay v2 spec](https://github.com/libp2p/specs/blob/master/relay/circuit-v2.md), [circuit relay concept](https://docs.libp2p.io/concepts/circuit-relay/)) |
| WebRTC / DCUtR | Browser-capable connectivity and, after a relayed connection exists, possible upgrade to a direct path. | Discovery. The initiating browser still needs the listener's current relayed/WebRTC address. ([js-libp2p WebRTC](https://libp2p.github.io/js-libp2p/modules/_libp2p_webrtc.html)) |

## Current Clipp reality

- [`createClipboardNode`](../../packages/core/network/node.ts) enables `identify()` but not `identifyPush()`. It configures mDNS only outside browser documents, so it can help Electron on a LAN but not Android/Capacitor or the extension offscreen document.
- Bootstrap is conditional on a non-empty list, and no runtime supplies one. `kadDHT()` therefore has no configured entry point and cannot be relied on to find an arbitrary Device Network member.
- Clipp does not pass a datastore to `createLibp2p`, so the libp2p peer store is not a durable cross-restart source of addresses.
- [`pairedConnections.ts`](../../packages/core/network/pairedConnections.ts) reconnects from each trusted device's persisted `multiaddrs` before falling back to `PeerId`. Removing those addresses today would make post-restart reconnection depend on unavailable routing.
- Electron defaults to no relay addresses. Android and the extension default to WebRTC-star addresses, while [`relayDialAddresses`](../../packages/core/network/engine.ts) excludes WebRTC-star addresses from Circuit Relay reservation and Rendezvous handling. Therefore the present defaults do not create a common Rendezvous plane.
- Clipp's [`rendezvous.ts`](../../packages/core/network/rendezvous.ts) claims the official `/rendezvous/1.0.0` protocol ID but exchanges custom JSON with client-supplied raw addresses. It is wire-incompatible with the official protobuf protocol, which registers a signed peer record. The engine also discovers the public `clipp` topic and dials every result without first checking Device Network membership.
- Identify is post-connect. Circuit Relay and DCUtR solve connectivity after discovery; they do not remove the need to distribute or look up a target's current address.

The practical runtime consequence is strongest for Android and MV3: neither has mDNS, neither has a configured DHT bootstrap path, their in-memory peer store may disappear with runtime lifecycle, and an inbound browser peer commonly needs a current relay reservation address.

## Why signed records are preferable to raw multiaddrs

Without the target's signature, a forwarding member can replace or replay that target's addresses. Noise still authenticates the `PeerId` once a connection succeeds, so address substitution should not let an attacker impersonate the target, but it can redirect connection attempts to useless endpoints and deny availability. A signed peer record lets the receiver verify that the named peer authored the address set and reject an older sequence number.

The remaining limitations are deliberate:

- a valid signed record can still be stale in real time, even if it is the newest record observed;
- the signer can advertise an unreachable or third-party address;
- the record is public reachability metadata, not proof of Device Network membership; and
- relay reservation changes require the owning peer to issue and propagate a newer record.

## Two viable designs

### 1. Signed peer records in membership reconciliation — recommended now

Transmit `{ membership record, peerRecordEnvelope? }`. Verify membership with Clipp's rules and verify the envelope independently against the member `PeerId`. Ingest certified addresses into the libp2p peer store, persist the envelope for later forwarding/restart, and dial by `PeerId`.

This is the smallest change because it preserves Clipp's decentralized, member-to-member propagation and replaces the existing raw `multiaddrs` payload with libp2p's standard transferable reachability object.

### 2. `PeerId`-only membership plus mandatory Rendezvous

Run a reachable, spec-compatible Rendezvous service; require every online member to refresh a signed registration; use a per-network namespace where practical; import discovered peer records; and dial only records whose `PeerId` is currently trusted.

This cleanly removes addresses from membership reconciliation, but adds service availability, registration renewal, privacy, deployment, and implementation obligations. It is larger than forwarding signed peer records, particularly because no standard Rendezvous package is installed and Clipp's current JSON protocol is not compatible with the libp2p spec.

## Follow-up implementation constraints

1. Add `identifyPush()` alongside `identify()`; do not expect it to introduce disconnected third parties.
2. Expose verified peer-record ingestion/retrieval at the transport boundary instead of letting trust code manipulate raw peer-store internals.
3. Store the original envelope bytes so intermediaries forward the owner's signature unchanged.
4. Treat `PeerId` membership as the authorization gate before dialing discovery results.
5. Either implement the official Rendezvous wire protocol or rename the current custom protocol (for example, `/clipp/rendezvous/1.0.0`) to avoid a standards collision. Do not auto-dial an unfiltered public namespace.
6. Keep mDNS as an opportunistic LAN hint and Circuit Relay/DCUtR as connectivity mechanisms. Do not treat them as the Device Network directory.
