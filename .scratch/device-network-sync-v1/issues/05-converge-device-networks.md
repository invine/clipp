# 05 — Converge Device Networks

**What to build:** Reconcile complete Membership Views independently of Pairing so separate Device Networks merge, offline members catch up, revocation remains remove-wins, and device presentation converges safely.

**Blocked by:** 04 — Complete Pairing with mutual Admission.

**Status:** resolved

- [x] Membership Reconciliation uses `/clipp/membership/1.0.0` with one bounded length-prefixed protobuf Membership View per short-lived stream and no legacy trusted-peers fallback.
- [x] Every authenticated connection or reconnection between Active Members triggers symmetric full-view pushes; local Admission or Device Revocation also triggers a push to connected Active Members.
- [x] The view contains canonical Admitted and Revoked Peer ID sets, only the immediate sender's Device Name and revision, and optional Signed Peer Record envelopes for Active Members.
- [x] The receiver validates all authoritative membership entries before applying anything, unions both sets atomically, and treats an identity in both sets as revoked.
- [x] Sender authorization is rechecked against the receiver's pre-merge Active membership immediately before persistence; payload-claimed identities provide no authority.
- [x] The merged Membership View is durably committed before publication, connection changes, reachability import, or propagation.
- [x] Persistence failure leaves the prior view active and performs no message-derived side effects; a later reconciliation can retry.
- [x] A state-changing merge propagates the new full view, while an idempotent membership merge produces no further reconciliation wave.
- [x] Pairing with any Active Member eventually introduces the new identity to the entire Device Network, and Pairing between two networks preserves every non-revoked Peer ID.
- [x] Device Names use validated monotonic revisions and can update only from the authenticated identity they describe; invalid names do not invalidate membership.
- [x] Local Device Aliases remain local-only and displayed labels resolve as alias, latest valid Device Name, then shortened Peer ID.
- [x] Multi-device integration tests prove convergence, message-order independence, replay idempotence, and remove-wins behavior.
