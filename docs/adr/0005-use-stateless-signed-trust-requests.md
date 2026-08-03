---
status: accepted
---

# Use stateless signed trust requests

Clipp does not persist outgoing Trust Requests. It may retain the latest sent envelope per target in memory while showing a waiting state, but Trust Response authorization never depends on that copy. The initiator signs a request containing its Peer ID, the intended target Peer ID, and an `issuedAt` timestamp. Both Peer IDs are encoded as canonical libp2p multihash bytes rather than text. The target retains the received Trust Request's original encoded envelope bytes, and the Trust Response echoes that envelope byte-for-byte rather than reconstructing it. This allows the initiator to verify that it explicitly authorized Pairing with the authenticated responding Peer ID and that the authorization remains within a bounded validity window without relying on the target's serializer or field ordering.

Trust Request and Trust Response messages use protobuf wire encoding over `/clipp/pairing/1.0.0`; implementations do not negotiate the incompatible legacy JSON `/clipboard/trust/1.0.0` protocol. The Trust Request envelope carries protobuf-encoded `signedPayload` bytes and signature bytes. The initiator signs the exact sequence `"clipp:trust-request:v1\0" || signedPayload`; receivers verify those bytes directly before decoding the payload. The Trust Response protobuf carries the decision, the exact original request-envelope bytes, and the responder's own presentation metadata. The fixed domain separator prevents a signature created for another Clipp message type or protocol version from being accepted as a Trust Request, while exact-byte verification avoids canonicalization and reserialization ambiguity.

Pairing v1 requires Ed25519 Device Identities. Because an Ed25519 public key is embedded in its libp2p Peer ID, a target can revalidate a persisted Trust Request after the original connection or a runtime restart without storing separate initiator public-key material. Supporting non-inline-key Peer IDs is deferred to a future protocol design. On first launch, Clipp durably persists that identity before starting clipboard capture or networking. If generation or persistence fails, neither subsystem starts, Clipp presents a persistent retryable initialization error, and it never substitutes, persists, or advertises a random placeholder Peer ID. Once identity initialization succeeds, clipboard capture remains independent of networking availability.

The request does not carry `expiresAt`. Protobuf represents `issuedAt` as `uint64 issued_at_unix_ms`, measured in UTC milliseconds since the Unix epoch and validated without lossy JavaScript-number coercion. Expiration is derived as `issuedAt + validityWindow`, with the validity window supplied by local configuration so tests can exercise longer or shorter lifetimes. An individual request cannot select or extend its own lifetime.

The production default validity window is 10 minutes. Tests may inject another duration and deployments may override it, but the setting is not exposed to end users.

Pairing also uses an injected clock-skew allowance with a two-minute production default. A request is valid only when `issuedAt <= now + clockSkewAllowance` and `now <= issuedAt + validityWindow + clockSkewAllowance`. Tests may override the allowance, but it is not exposed to end users.

The target validates expiry before presenting a Trust Request for approval, and the initiator validates expiry again when receiving the echoed request in the Trust Response. Each side applies its local validity-window configuration, so a stricter configuration wins when they differ.

Trust Request and Trust Response are independently delivered on short-lived `/clipp/pairing/1.0.0` streams. The target closes the request stream after persisting a pending request and later opens a new stream for its one best-effort response attempt. Approval therefore does not require an incoming stream or connection to remain open and can survive a runtime restart.

The Trust Response relies on the live libp2p connection to authenticate the responder and does not need its own application-level signature. A response is rejected when the echoed request is invalid, expired, targets a different remote Peer ID, names a different local initiator, or refers to a revoked target Peer ID.

## Consequences

The signed Trust Request acts as a target-specific pairing capability until it expires. Deleting the non-authoritative in-memory copy cannot cancel that capability, and the initiator cannot distinguish the first response from a replay for authorization; repeated success is therefore idempotent while the target remains active. Any valid rejection from an authenticated target clears that target's in-memory waiting state without correlating older and newer requests. It does not cancel another unexpired request already delivered, so a later valid acceptance may still establish Device Membership.

Once the target accepts a Trust Request, it durably admits the initiator before making one best-effort attempt to deliver the Trust Response. A delivery failure creates no outgoing response or retry job and does not roll back the initiator's Device Membership. Any later valid Trust Request from an authenticated Peer ID already active in the target's Membership View receives an automatic accepted response without another approval prompt, whether that Admission came from direct Pairing or Membership Reconciliation. This deliberately tolerates temporarily asymmetric Membership Views instead of adding delivery acknowledgements, rollback, or persisted outgoing-request state.
