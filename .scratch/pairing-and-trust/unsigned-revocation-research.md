# Unsigned Device Revocation

## Conclusion

Clipp's live libp2p stream already authenticates the **immediate peer** and protects the bytes in transit. An unsigned Device Revocation received directly from a current member can therefore be safe as a one-hop command, provided Clipp rejects streams without an authenticated `remotePeer` and checks that peer's current membership.

That guarantee does not travel with the message. Once a revocation is stored or forwarded by another device, a later receiver can authenticate only the forwarder, not the original issuer. This conflicts with the settled requirements that revocation is durable, reaches devices that were offline, survives later revocation of its issuer, and is judged according to whether its issuer was a member when it was issued. For those semantics, the revocation should be an issuer-signed application record.

A signature is necessary for transferable authorship and integrity, but is not sufficient for the whole design. Replay, ordering, reinstatement, and membership-at-issuance need separate protocol rules and persisted state.

## What the current stack authenticates

Clipp configures Noise as its libp2p connection encrypter and sends application messages on protocol streams, not through pubsub ([node configuration](../../packages/core/network/node.ts#L300), [stream send path](../../packages/core/network/engine.ts#L179)). The official [libp2p Noise specification](https://github.com/libp2p/specs/blob/master/noise/README.md#static-key-authentication) says that Noise authenticates its static key with the libp2p identity key and that the XX handshake provides mutual authentication and encryption. Post-handshake traffic is protected as AEAD ciphertext with authentication data ([Encryption and I/O](https://github.com/libp2p/specs/blob/master/noise/README.md#encryption-and-io)). Circuit Relay does not weaken this property: the endpoint connection is end-to-end encrypted, so the relay cannot read or alter its traffic ([official Circuit Relay documentation](https://docs.libp2p.io/concepts/circuit-relay/)).

For an incoming stream, Clipp obtains `from` from `connection.remotePeer`, and trust-message decoding replaces the untrusted outer JSON `from` with that transport identity ([engine attribution](../../packages/core/network/engine.ts#L662), [trust decoder](../../packages/core/protocols/clipTrust.ts#L48)). Thus, under the normal libp2p handler path:

- a network observer or circuit relay cannot forge or modify a revocation in transit;
- the receiver knows which Peer ID sent the message on this connection;
- Noise does **not** sign the application payload with that peer's identity key.

The last distinction matters. Noise's identity signature covers the Noise static key, not arbitrary application data, and its later message protection uses session keys. It proves a live hop from A to B; it does not create a portable artifact that C can later verify as authored by A. This is why libp2p's own [signed-envelope RFC](https://github.com/libp2p/specs/blob/master/RFC/0002-signed-envelopes.md#problem-statement) uses identity-key signatures and domain separation for records stored or relayed through intermediaries.

There is one hardening issue: when `remotePeer` is unavailable, Clipp currently falls back to the payload's claimed `from` ([fallback](../../packages/core/network/engine.ts#L708)). A security-sensitive revocation handler must reject that case; otherwise the claimed sender is spoofable.

## Who can send what today

The trust protocol handler is registered for every libp2p connection, and `createTrustMessenger` is not wrapped with `withTrustedPeers` as the clip and history messengers are ([channels](../../packages/core/messaging/channels.ts#L23), [generic messenger](../../packages/core/messaging/protocolMessenger.ts#L16)). Consequently, any connected peer can originate a structurally decodable trust message. The current `trusted-peers` handler compensates by checking that the immediate sender is trusted before importing membership ([trust manager](../../packages/core/trust/trustManager.ts#L396)). A revocation handler needs at least the same membership check.

Under the agreed domain rule, every current member already has unilateral revocation authority ([ADR](../../docs/adr/0001-use-transitive-trust-within-an-owned-device-network.md#L7)). Therefore, signing does not stop a compromised current member from revoking another device: it already has permission to do so. Signing instead answers a different question—who created this durable record, and were its fields changed after creation?

## Drawbacks of leaving revocations unsigned

1. **Original authorship disappears after one application hop.** If A sends a revocation to B and B later forwards it to offline C, C's Noise connection authenticates B. An embedded `issuer: A` is only B's assertion and can be changed or invented.

2. **Forwarding silently changes the authorization model.** An unsigned design can be coherent only if B is considered to issue a fresh revocation under B's own current authority. It is not evidence of A's earlier action. If B has since been revoked, C cannot safely accept B's delivery even when A's original revocation was valid.

3. **Historical validity cannot be checked from the record.** The ADR says revoking an issuer must not retroactively invalidate a revocation it validly issued while still a member ([ADR](../../docs/adr/0001-use-transitive-trust-within-an-owned-device-network.md#L13)). Without A's signature, a late receiver cannot distinguish that case from a forwarder fabricating A's name or chronology.

4. **A forwarding member can alter the target, issuer, timestamp, or other conflict metadata undetectably.** This does not give an already-authorized current member more immediate removal power, but it destroys reliable attribution and can bypass future or historical authorization rules.

5. **Stored state has no independently verifiable integrity.** Database corruption, a buggy migration, backup manipulation, or import from another device cannot be distinguished from a genuine issuer-authored record. A transport-authenticated receipt log can show what one device observed, but other devices cannot verify it without trusting that device.

6. **Security auditing and recovery become ambiguous.** When a removal was erroneous or malicious, devices cannot establish which identity originated it. This becomes particularly difficult after network partitions, concurrent mutual revocations, or later reinstatement.

Unsigned propagation is defensible only with an explicit, narrower model: accept revocation state solely from the authenticated immediate Peer ID; require that sender to be a current member; treat every forward as that sender's fresh re-authorization; and make no claim about an original issuer. That model is simpler, but it does not implement the historical event semantics already recorded for Clipp.

## What signatures do not solve

- **Application replay.** Noise's replay resistance is scoped to its handshake/session. Replaying captured ciphertext into that session is not a valid fresh message, but a legitimate endpoint can send the same old plaintext on a new authenticated stream. An old signed revocation is still correctly signed.
- **Reinstatement ordering.** After a fresh Pairing reinstates a device, an old revocation must not remove it again merely because it arrives late. Receivers need a deterministic generation/epoch or causal ordering rule.
- **Membership at issuance.** A signature proves control of the issuer's key; it does not prove that the issuer was a Device Network member at that moment. Verification also needs membership history or a cryptographically linked membership generation.
- **Compromised members.** A compromised current member can sign a malicious revocation because unilateral revocation is an intentional authority of membership.
- **Implementation complexity.** The protocol needs canonical signing bytes, domain separation and versioning, key-to-Device-Identity binding, signature verification on every ingest path, and durable storage of accepted records.

Clipp already contains much of the cryptographic machinery: Trust Requests are signed over canonical bytes, and tests show that changing signed fields fails verification ([implementation](../../packages/core/protocols/clipTrust.ts#L242), [tests](../../tests/core/protocols/clipTrust.test.ts#L25)). However, the current runtime does **not** actually verify those Trust Request signatures: generic validation only checks that `sig` is a string, and the binder's verification call is commented out ([structural validation](../../packages/core/protocols/clipTrust.ts#L371), [disabled verification](../../packages/core/messaging/trustBinder.ts#L106)). Revocation must not repeat that gap.

## Recommended protocol direction

Represent Device Revocation as an immutable issuer-signed event. The signed content should at least include a domain separator and protocol version, issuer Device Identity, target Device Identity, unique event identifier, and the ordering or membership-generation fields chosen by the conflict-resolution design. Receivers should:

1. obtain the immediate sender only from authenticated `remotePeer`;
2. verify the event signature against the issuer's paired identity key;
3. establish that the issuer was authorized in the relevant membership generation;
4. apply explicit replay, ordering, remove-wins, and reinstatement rules;
5. retain the signed event as the durable tombstone and forward it unchanged.

This preserves Noise's strong hop authentication while adding the end-to-end, store-and-forward evidence required by Clipp's durable offline revocation semantics.
