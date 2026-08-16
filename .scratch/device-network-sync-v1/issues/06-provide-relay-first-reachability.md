# 06 — Provide durable relay-first reachability

**What to build:** Make Active Members and explicit Pairing targets reachable through verified Circuit Relay v2 records, durable exact discovery, and optional direct upgrades across every runtime.

**Blocked by:** 05 — Converge Device Networks.

**Status:** resolved

- [x] All runtimes ship the same ordered default Circuit Relay v2 list, remove WebRTC-star from production defaults, and attempt reservations on every configured relay.
- [x] Electron retains editable relay configuration; no relay-editing parity is added to Android or Chrome.
- [x] Each runtime durably stores verified Signed Peer Records in the libp2p peer store and does not duplicate raw addresses or envelopes in Membership View storage.
- [x] Membership Reconciliation forwards at most the latest available original Signed Peer Record for each Active Member, and invalid or stale records do not prevent a valid membership merge.
- [x] The interim `/clipp/rendezvous/1.0.0` service accepts only authenticated self-registration of a verified Signed Peer Record and supports exact Peer ID lookup rather than ambient enumeration.
- [x] Rendezvous registration uses finite server-enforced leases and refreshes with jitter only while the corresponding relay reservation remains live.
- [x] Reservation loss publishes a newer record without the invalid circuit address, stops refresh, attempts unregister, and relies on bounded lease expiry if cleanup fails.
- [x] Automatic discovery imports and dials only Active Members; importing a Pairing Target creates the only narrow exact pre-Admission lookup exception.
- [x] An offline Active Member can be rediscovered and reconnect over a Relayed Connection without repeating Pairing.
- [x] Identify Push promptly distributes changed reachability to connected members without granting membership or replacing disconnected-peer discovery.
- [x] Every runtime attempts DCUtR after establishing a Relayed Connection, keeps application traffic working when upgrade fails, and can return to a relay if a Direct Connection later fails.
- [x] Real-network harness coverage verifies relay-first Pairing, offline reconnect, reservation loss, record refresh, and DCUtR fallback.
