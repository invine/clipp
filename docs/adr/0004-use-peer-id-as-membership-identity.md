---
status: accepted
---

# Use Peer ID as the Device Membership identifier

Clipp uses a Device Identity's libp2p Peer ID as the identifier for its Device Membership rather than introducing a separate Membership Instance ID. Membership Reconciliation unions each member's Admitted Peer ID and Revoked Peer ID sets, and revocation permanently prevents the targeted Peer ID from becoming active again. Revoked Peer IDs are retained as tombstones even when absent from the local Admitted Peer ID set, so a later stale Membership View cannot activate them. This keeps membership authorization aligned with libp2p's authenticated remote Peer ID and avoids a second identity lifecycle in the Pairing protocol.

For both Trust Request and Trust Response, the Device Identity claimed by the message must exactly match the remote Peer ID authenticated by the live libp2p connection. A missing transport identity or mismatch causes Pairing to fail.

A notified revoked installation performs Identity Rotation, generating a new keypair and Peer ID and becoming a new logical device in a singleton Device Network. It can return only through fresh, explicitly accepted Pairing. The new identity has no continuity with the revoked identity: the rotating installation deletes the revoked private key, its former Membership View, entire local Clipboard History including both Local and Remote Clips, and presentation metadata, and the libp2p runtime must restart around the new identity with an empty persistent peer store. The replacement identity retains no local historical Membership View and starts only with its new singleton view. Other members continue to retain the former Peer ID's revocation tombstone. Clips and historical presentation metadata already retained by other devices remain attributed to the old Peer ID. Pending Trust Requests and notifications addressed to the former Peer ID are deleted rather than transferred, and the new identity publishes a fresh Pairing Target. Identity-independent installation preferences such as theme, relay configuration, clipboard polling settings, and history limits carry over unchanged.

History and old-key cleanup are durable logical deletion from Clipp-visible active storage and derived references. They do not guarantee forensic erasure from database remnants, write-ahead logs, platform backups, or underlying storage media.

The replacement identity runs the normal first-launch naming path and starts `nameRevision` at zero. Device Names default to `Desktop` for Electron, `Mobile` for Android, and `Extension` for Chrome; Clipp does not read hostnames, account names, or hardware models for this purpose. Rotation does not copy the former identity's stored Device Name.

Learning its own valid Device Revocation triggers rotation and irreversible cleanup automatically, without local confirmation, export, or grace period. Since every Active Member has equal unilateral revocation authority, any Active Member can cause this deletion on another installation. Clipp accepts that destructive consequence as part of the owner-device trust model.

The revoking user receives a standard confirmation prompt without a specialized consequence warning. Confirmation immediately persists the remove-wins tombstone, with no undo or cancellation window; returning requires a new Peer ID and fresh Pairing.

After successful rotation, Clipp makes a best-effort attempt to retain a non-blocking user notice until acknowledgement. The notice explains the revocation, local history deletion, and need for fresh Pairing but names no revocation issuer because forwarded membership state preserves no original provenance. Failure to persist or display this optional notice does not fail rotation or block the new identity.

Durably applying its own revocation is also an immediate networking shutdown barrier. The Membership View merge that establishes the revocation completes, after which the installation closes its connections and cancels every other in-flight Pairing, reconciliation, discovery, and Clip operation before rotation.

When clipboard capture restarts after rotation, the runtime uses the platform clipboard's current value only to initialize the watcher's baseline. It does not create a Clip from that value, preventing pre-rotation clipboard content from being implicitly reassigned to the new identity.

Startup checks persisted membership before creating the libp2p node. If the stored local Peer ID is revoked, networking remains disabled until a crash-recoverable, idempotent rotation has durably stored the new identity, singleton Membership View, empty peer store, and deletion of the revoked private key, former Device Network's Membership View, complete local Clipboard History, and presentation metadata. A deletion failure leaves rotation uncommitted and the new identity inactive. An interrupted rotation resumes on the next startup and never temporarily reuses the revoked Peer ID. Once a candidate replacement keypair is durably stored, retries reuse that candidate until commit instead of generating additional Peer IDs.

The same rotation and cleanup path handles Identity Loss, where an installation can no longer load and validate a previously persisted private key. The Ed25519 private key is authoritative: Clipp derives and repairs redundant Peer ID and public-key metadata from a valid key, and metadata mismatch alone is not Identity Loss. Actual Identity Loss automatically creates a new singleton identity and requires fresh Pairing; old identity-scoped state is deleted rather than transferred. A completely empty installation remains an ordinary first launch. Identity Loss is not by itself a network-wide Device Revocation of the inaccessible former Peer ID, and fresh Pairing makes no unverified continuity claim. Other members continue to recognize that Peer ID as a stale Active Member until the user separately revokes it from any current member.

Successful Identity Loss recovery makes the same kind of best-effort, non-blocking persistent notice as revocation-driven rotation, but describes identity reset rather than revocation. Failure to persist or display the notice does not block the replacement identity.
