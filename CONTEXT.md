# Clipp

Clipp is the clipboard-sharing context for coordinating clipboard content among a person's devices. Its language distinguishes the content being shared, the devices involved, replicated Device Membership, and the trust derived from that membership.

## Language

**Clip**:
One clipboard capture event that Clipp records and can share between devices. A Clip's identity represents the event, not only its content. Re-observing the same event through polling, restart recovery, transport retry, or remote-write echo does not create another Clip; deliberately copying identical content again after an intervening clipboard value creates a distinct Clip.
_Avoid_: Clipboard item, entry

**Clip ID**:
The immutable UUIDv4 event identity assigned by the originating Device Identity and preserved across live forwarding, persistence, and Clipboard History Reconciliation. Clip IDs, rather than content equality, provide duplicate suppression.
_Avoid_: Content ID, content hash

**Local Clip**:
A Clip whose immutable `originPeerId` equals the current Device Identity's Peer ID. Explicitly reusing earlier content creates a new Local Clip even when the selected history entry was Remote.
_Avoid_: Outgoing Clip

**Remote Clip**:
A Clip whose immutable `originPeerId` differs from the current Device Identity's Peer ID, regardless of which Active Member most recently forwarded or re-exported it.
_Avoid_: Incoming Clip

**Clipboard History**:
The collection of Clips retained on a device for later viewing or reuse.
_Avoid_: History store, history messenger

**Clip Sharing Lifetime**:
The finite period during which a Clip may be sent live, forwarded, or offered during history reconciliation. The originating Device Identity fixes the lifetime as the Clip's immutable `shareExpiresAt`; expiration stops further sharing but does not itself delete an existing local history record.

**Clipboard History Reconciliation**:
The idempotent exchange of complete eligible Clip snapshots between Active Members. It repairs missed live delivery without applying imported historical Clips to the current system clipboard.

**Auto Sync**:
The persisted device preference controlling inbound and outbound Clip exchange. Disabling Auto Sync does not stop local capture or erase Clipboard History; `Share Now` is the sole one-Clip outbound override.

**Android Background Continuity**:
An opt-in, best-effort Android capability that attempts to keep Clipp connected to its Device Network when Clipp is not foregrounded. It does not permit background clipboard capture or guarantee continuous connectivity or Clip delivery.
_Avoid_: Background Clipboard Sync

**Clip Suppression Tombstone**:
A local, expiring marker keyed by Clip ID that prevents a removed or capacity-rejected Clip from being restored by live delivery or Clipboard History Reconciliation during its remaining sharing window. It is not propagated to other devices.
_Avoid_: Device Revocation

**Device Identity**:
The cryptographic identity represented by one libp2p Peer ID during one uninterrupted network lifetime. Device Revocation permanently ends that Device Identity.
_Avoid_: Account, user

**Device Name**:
Self-chosen presentation metadata that a device reports for its own Device Identity. A Device Name update is accepted only from the Device Identity it describes. It is bound to that identity's Peer ID, is not identity proof, and does not replace the Peer ID.
_Avoid_: Local Device Alias

**Local Device Alias**:
An optional presentation label chosen on one device for a remote Device Identity. It is local-only, is never propagated, and takes display precedence over that identity's self-reported Device Name. It remains bound to that identity's Peer ID and does not transfer through Identity Rotation.
_Avoid_: Device Name

**Device Network**:
The logical owner-scoped group represented by its devices' converging local Membership Views. A Device Network has no separate network identifier or central membership object. A newly created Device Identity begins in a singleton Device Network; Pairing and Membership Reconciliation can merge Device Networks.
_Avoid_: Trust graph

**Membership View**:
A device's local replicated membership state, consisting of an Admitted Peer ID set and a Revoked Peer ID set. Membership Views can temporarily differ and converge through Membership Reconciliation.

**Admission**:
The addition of a Device Identity's Peer ID to the local Admitted Peer ID set. Admission has no effect when that Peer ID is already in the Revoked Peer ID set.

**Device Membership**:
The active inclusion of a Device Identity in a Device Network, as recognized by a device's local Membership View. Device Membership begins through Admission, grants the authority associated with trust, and permanently ends for that Peer ID through Device Revocation.
_Avoid_: Revoked membership

**Active Member**:
A Device Identity whose Peer ID is admitted and not revoked in the local Membership View.

**Trusted Device**:
The user-facing term for a remote Active Member.
_Avoid_: Peer

**Trust**:
The authority derived from recognizing a Device Identity as an Active Member, including Clip exchange, Admission, Membership Reconciliation, and Device Revocation. Trust is not stored separately from membership and remains recognized while a member is offline; a live libp2p connection authenticates the Device Identity when it interacts.

**Mutual Trust**:
The derived relationship in which each of two devices recognizes the other as an Active Member. Mutual trust among every Active Member is the converged Device Network invariant, although Membership Views can be temporarily asymmetric.
_Avoid_: Trust Relationship

**Transitive Trust**:
The rule that a device accepts a Membership View reasserted by an authenticated Active Member, allowing Device Membership to propagate through the Device Network. It is not a stored chain of pairwise trust edges.

**Pairing**:
The process in which two devices exchange a Trust Request and Trust Response. Accepting each message directly admits its authenticated sender, producing mutual trust once both admissions are recognized. When the devices belong to different Device Networks, Pairing triggers a separate Membership Reconciliation that eventually merges them.
_Avoid_: Login, sign-in

**Pairing Target**:
A public, shareable bootstrap payload containing a target Device Identity's Peer ID and Signed Peer Record. It supplies reachability for starting Pairing but is neither a secret nor proof of authorization.
_Avoid_: Pairing Contact, Pairing Contract, Invitation

**Trust Request**:
The opening, time-limited message in Pairing through which one Device Identity asks a specific target Device Identity for Admission. It carries the initiator's self-reported Device Name as presentation metadata, but the authenticated Peer ID remains authoritative.

**Trust Response**:
The answer to a Trust Request, indicating whether the requested Admission is accepted.
_Avoid_: Trust Ack

**Membership Reconciliation**:
The retryable exchange through which authenticated Active Members merge their Admitted Peer ID and Revoked Peer ID sets. It occurs separately from Pairing, so Membership Views and Device Network merges are eventually consistent rather than atomic with acceptance of a Trust Response.

**Signed Peer Record**:
A libp2p-signed statement of a Device Identity's advertised network addresses. It is forwarded unchanged as replaceable reachability information and does not grant Device Membership.

**Relayed Connection**:
An authenticated peer connection carried through a libp2p Circuit Relay when the devices cannot yet connect directly.

**Direct Connection**:
An authenticated peer connection that does not carry application traffic through a relay. A Relayed Connection may be upgraded to a Direct Connection through libp2p DCUtR.

**Device Revocation**:
The durable, network-wide termination of a Device Identity's Device Membership, identified by its Peer ID. That Peer ID cannot rejoin; its revocation tombstone remains in the Revoked Peer ID set. When notified, the revoked installation rotates its identity and resets into a singleton Device Network as a new logical device.
_Avoid_: Local removal, delete device

**Identity Rotation**:
The replacement of a Device Identity with a newly generated keypair and Peer ID. The rotated identity is a new logical device with no membership continuity from the former identity.
_Avoid_: Device Reinstatement

**Identity Loss**:
The condition in which an installation can no longer load and validate the authoritative private key for its persisted Device Identity. A mismatch in redundant Peer ID or public-key metadata is repaired from a valid private key and is not Identity Loss. Identity Loss causes automatic Identity Rotation and requires fresh Pairing; it is not itself Device Revocation, and another current member must separately revoke the inaccessible former Peer ID.

**Pinned Clip**:
A Clip marked so it can be found through the pinned view.
_Avoid_: Favorite
