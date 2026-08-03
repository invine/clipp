---
status: accepted
---

# Separate Pairing from membership reconciliation

Clipp uses Trust Request and Trust Response to perform direct Admission between their participants: the target admits the initiator when accepting the request, and the initiator admits the target when validating the accepted response. These admissions produce mutual trust without separately stored trust state. Clipp then performs Membership Reconciliation over the separate protobuf `/clipp/membership/1.0.0` protocol rather than embedding complete Membership Views in `/clipp/pairing/1.0.0` messages. The incompatible legacy JSON `trusted-peers` message is not negotiated.

## Consequences

A participant receives full Active Member capabilities immediately when it recognizes the other's Device Membership, including Clip synchronization and authority to send Admission or revocation state. Initial reconciliation does not gate those capabilities.

A Trust Response can be accepted before the participants have exchanged their full Membership Views. Merging Device Networks is therefore eventually consistent rather than atomic with Pairing, but reconciliation can retry independently without repeating user approval or enlarging the signed Trust Request.

If a Trust Response is lost, the target retains the initiator's Device Membership while the initiator may remain unaware of the target's Admission. A later valid Trust Request retries the response idempotently and restores mutual recognition without rolling back a Membership View already propagated by the target.

Every authenticated connection or reconnection between Active Members triggers a full Membership Reconciliation. Reconciliation is a symmetric push: each side independently sends its complete Membership View on a short-lived stream without leader election, request/response coordination, or acknowledgement. A local Admission or Device Revocation also triggers full reconciliation with every connected Active Member. Merging a received view propagates the new complete view only when local state changes, so idempotent duplicate messages terminate naturally. This uses one set-based convergence mechanism for immediate propagation and recovery, without a separate incremental membership-change protocol.

The protobuf carries canonical Peer ID bytes for the Admitted and Revoked Peer ID sets, the immediate sender's own Device Name and revision, and optional peer-reachability entries containing original Signed Peer Record envelopes. It carries no network identifier, original issuer, membership timestamp, application signature, or Local Device Alias. Sender presentation metadata can update only the authenticated sender, while reachability records remain subordinate to membership authorization.

A current member also uses the same complete Membership View to notify a connected revoked remote device of its own revocation before closing the connection. The initial implementation accepts disclosure of the current view and reachability records to that former member; a reduced notice, separate protocol, and disclosure hardening are deferred.

Membership-set validation is atomic: a malformed Peer ID rejects the complete view without partial changes. Duplicate valid IDs are deduplicated, and an ID present in both sets remains revoked under remove-wins semantics.

Senders serialize deterministic snapshots by deduplicating and lexicographically sorting canonical Peer ID bytes and including at most the latest available Signed Peer Record for each Active Member. Receivers remain order-insensitive so ordering is not an authorization condition.

A merge persists the complete resulting Admitted and Revoked Peer ID sets atomically before publishing the new Membership View or performing connection, reachability, and propagation side effects. A storage failure leaves the prior view active and relies on later reconciliation to retry.

The v1 protocol IDs retain fixed authorization, merge, and sequencing semantics. Protobuf unknown fields may add compatible metadata, but changes to signatures, identity binding, membership authority, merge behavior, or message sequencing require new negotiated protocol IDs.
