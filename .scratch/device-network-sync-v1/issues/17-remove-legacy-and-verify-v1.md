# 17 — Remove legacy paths and verify v1 conformance

**What to build:** Finish the transition by removing legacy protocol and trusted-list behavior, proving all three runtimes conform to Device Network Sync v1, and validating the complete relay-first experience.

**Blocked by:** 06 — Provide durable relay-first reachability; 12 — Control Clip exchange with Auto Sync; 13 — Reuse and explicitly share Clips; 16 — Recover from Identity Loss.

**Status:** ready-for-agent

- [ ] Remove legacy JSON Clip, trust, trusted-peers, and history protocol registration, codecs, fallback paths, and runtime message routing.
- [ ] Remove the legacy mutable trusted-device repository and any authorization that depends on payload-supplied sender identity instead of authenticated Active membership.
- [ ] Remove legacy Pairing Target version 1 parsing, timestamp semantics, raw address/public-key fields, and fallback behavior.
- [ ] Remove obsolete content-shaped Clip fields, mutable Local/Remote persistence, content-hash echo detection, and check-then-insert duplicate suppression once no callers remain.
- [ ] Remove WebRTC-star from target production configuration and eliminate obsolete runtime branches that are no longer used.
- [ ] Confirm that clean transition may discard legacy identity, membership, Clip, history, and application data without implementing migration or wire interoperability.
- [ ] Run the shared orchestrator conformance suite and runtime-adapter contract suite across Electron, Android, and Chrome with only the documented platform exceptions.
- [ ] Run focused protocol, framing, transactional persistence, race, resource-bound, privacy-log, and security regression suites.
- [ ] Build all three runtimes and run repository lint and test commands successfully.
- [ ] Verify through the real-network harness that cross-runtime Pairing works over Circuit Relay v2, Active Members reconnect after offline periods, live Clips gossip, history repairs missed delivery, revocation converges, and failed DCUtR leaves relayed traffic usable.
- [ ] Confirm private keys, Clip content, raw Pairing envelopes, signatures, and unbounded attacker-controlled presentation data do not appear in logs or diagnostics.
- [ ] Confirm no deferred feature was accidentally introduced, including history inventories/deltas, network-wide Clip deletion, image/file transfer, secure-key migration, or broader discovery redesign.
