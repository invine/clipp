# 14 — Revoke Device Membership network-wide

**What to build:** Let any Active Member permanently revoke another Peer ID, propagate remove-wins state throughout the Device Network, and immediately enforce that loss of authority.

**Blocked by:** 06 — Provide durable relay-first reachability; 10 — Gossip live Clips across the Device Network; 12 — Control Clip exchange with Auto Sync.

**Status:** resolved

- [x] The shared UI requires a standard confirmation before initiating Device Revocation and offers no undo after confirmation.
- [x] Local revocation atomically persists the tombstone before UI publication, connection closure, reachability deletion, or propagation.
- [x] Persistence failure leaves the target Active, performs no revocation side effects, and exposes a retryable error.
- [x] After commit, the target leaves Active presentation, its connections close, and its Signed Peer Records and cached reachability are removed and cannot be re-imported.
- [x] The persisted full Membership View is the durable propagation source; failed sends retry with backoff while connected and every reconnection sends the view again.
- [x] Revocation is remove-wins for the exact Peer ID regardless of message order and cannot be reversed by stale Admission or Transitive Trust.
- [x] Unknown and revoked peers cannot use Pairing, Membership Reconciliation, Clip, history, revocation, or other application protocols.
- [x] A current member may send one complete Membership View to an authenticated revoked remote identity, accept nothing from it, and then close the connection.
- [x] Incoming Clip and history paths recheck sender membership before persistence; already committed historical Clips remain valid without a revoked-source badge.
- [x] Applying the local identity's revocation completes only the triggering Membership View merge, then closes connections and cancels every other in-flight network operation.
- [x] The UI never claims network-wide convergence and exposes no dedicated revoked-device management list.
- [x] Tests cover concurrent revocations, mutually revoked peers, authorized in-flight merges, offline recipients, and attempts to resurrect a revoked Peer ID.

## Answer

- Device Revocation is exposed through the shared UI with confirmation and a retryable persistence error. Membership publication occurs only after the complete remove-wins view commits.
- The shared reconciler propagates the persisted full Membership View, retries failed connected sends with exponential backoff, sends one final view to a connected revoked identity, and then disconnects and removes its reachability.
- Authenticated protocol boundaries reject non-Active senders, while live Clip and Clipboard History receive paths recheck membership immediately before persistence. A local self-revocation completes its authorized merge before the runtime shutdown and Identity Rotation barrier runs.
- Focused coverage verifies persistence failure, stale Admission, concurrent and mutual revocations, authorized in-flight merges, offline repair, final-view delivery, cleanup retry, local shutdown, and resurrection attempts.
