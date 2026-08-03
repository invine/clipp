# 14 — Revoke Device Membership network-wide

**What to build:** Let any Active Member permanently revoke another Peer ID, propagate remove-wins state throughout the Device Network, and immediately enforce that loss of authority.

**Blocked by:** 06 — Provide durable relay-first reachability; 10 — Gossip live Clips across the Device Network; 12 — Control Clip exchange with Auto Sync.

**Status:** ready-for-agent

- [ ] The shared UI requires a standard confirmation before initiating Device Revocation and offers no undo after confirmation.
- [ ] Local revocation atomically persists the tombstone before UI publication, connection closure, reachability deletion, or propagation.
- [ ] Persistence failure leaves the target Active, performs no revocation side effects, and exposes a retryable error.
- [ ] After commit, the target leaves Active presentation, its connections close, and its Signed Peer Records and cached reachability are removed and cannot be re-imported.
- [ ] The persisted full Membership View is the durable propagation source; failed sends retry with backoff while connected and every reconnection sends the view again.
- [ ] Revocation is remove-wins for the exact Peer ID regardless of message order and cannot be reversed by stale Admission or Transitive Trust.
- [ ] Unknown and revoked peers cannot use Pairing, Membership Reconciliation, Clip, history, revocation, or other application protocols.
- [ ] A current member may send one complete Membership View to an authenticated revoked remote identity, accept nothing from it, and then close the connection.
- [ ] Incoming Clip and history paths recheck sender membership before persistence; already committed historical Clips remain valid without a revoked-source badge.
- [ ] Applying the local identity's revocation completes only the triggering Membership View merge, then closes connections and cancels every other in-flight network operation.
- [ ] The UI never claims network-wide convergence and exposes no dedicated revoked-device management list.
- [ ] Tests cover concurrent revocations, mutually revoked peers, authorized in-flight merges, offline recipients, and attempts to resurrect a revoked Peer ID.
