# 17 — Remove legacy paths and verify v1 conformance

**What to build:** Finish the transition by removing legacy protocol and trusted-list behavior, proving all three runtimes conform to Device Network Sync v1, and validating the complete relay-first experience.

**Blocked by:** 06 — Provide durable relay-first reachability; 12 — Control Clip exchange with Auto Sync; 13 — Reuse and explicitly share Clips; 16 — Recover from Identity Loss.

**Status:** resolved

- [x] Remove legacy JSON Clip, trust, trusted-peers, and history protocol registration, codecs, fallback paths, and runtime message routing.
- [x] Remove the legacy mutable trusted-device repository and any authorization that depends on payload-supplied sender identity instead of authenticated Active membership.
- [x] Remove legacy Pairing Target version 1 parsing, timestamp semantics, raw address/public-key fields, and fallback behavior.
- [x] Remove obsolete content-shaped Clip fields, mutable Local/Remote persistence, content-hash echo detection, and check-then-insert duplicate suppression once no callers remain.
- [x] Remove WebRTC-star from target production configuration and eliminate obsolete runtime branches that are no longer used.
- [x] Confirm that clean transition may discard legacy identity, membership, Clip, history, and application data without implementing migration or wire interoperability.
- [x] Run the shared orchestrator conformance suite and runtime-adapter contract suite across Electron, Android, and Chrome with only the documented platform exceptions.
- [x] Run focused protocol, framing, transactional persistence, race, resource-bound, privacy-log, and security regression suites.
- [x] Build all three runtimes and run repository lint and test commands successfully.
- [x] Verify through the real-network harness that cross-runtime Pairing works over Circuit Relay v2, Active Members reconnect after offline periods, live Clips gossip, history repairs missed delivery, revocation converges, and failed DCUtR leaves relayed traffic usable.
- [x] Confirm private keys, Clip content, raw Pairing envelopes, signatures, and unbounded attacker-controlled presentation data do not appear in logs or diagnostics.
- [x] Confirm no deferred feature was accidentally introduced, including history inventories/deltas, network-wide Clip deletion, image/file transfer, secure-key migration, or broader discovery redesign.

## Answer

- Removed the final exported JSON protocol helpers and payload-supplied sender fallback, plus stale CLI/probe state, generated JavaScript, and an obsolete lockfile snapshot. Local runtime and diagnostic artifacts are now ignored.
- Restricted the public Clip alternative set to v1 text and URL events, removed compatibility-only normalizer helpers, and removed clipboard-content previews from runtime diagnostics.
- Pairing Target generation in Electron and Android now depends directly on the transport's Signed Peer Record without raw-address availability or persisted-address fallback branches, matching the Chrome runtime.
- The shared conformance, protocol/framing, persistence, race, resource-bound, privacy, and security suites pass. Repository lint completes with warnings only, and Electron, Android, and Chrome-extension production builds succeed.
- The real-network harness passes relay-first Pairing across all three runtime adapters, live Clip gossip, offline history repair, remove-wins revocation, reservation/lease loss, Signed Peer Record refresh and reconnect, and failed-DCUtR relayed operation.
