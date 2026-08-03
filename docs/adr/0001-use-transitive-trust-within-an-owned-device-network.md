# Use transitive trust within an owned-device network

Clipp treats trusted devices as Active Members of one Device Network belonging to the same owner. A newly created Device Identity begins in a singleton Device Network. Pairing and Membership Reconciliation propagate Device Membership so that, once Membership Views converge, every Active Member mutually trusts every other Active Member. This avoids pairing each new device separately with every device already owned. Pairing devices that belong to larger Device Networks likewise merges their Membership Views and produces mutual trust across the combined network.

## Consequences

Every Trusted Device has equal, unilateral authority to introduce another device, merge another network, or revoke any other member without additional approval. Compromise of any member can therefore expand or disrupt the trusted network.

Admission may temporarily be asymmetric. Once a Pairing target accepts a Trust Request, its durable Admission may propagate throughout its Device Network even if the Trust Response is lost and the initiator still considers itself a singleton. Clipp does not roll back that authority; a later user-initiated retry receives automatic acceptance and completes mutual trust.

Removing a Trusted Device is a durable, network-wide Device Revocation. The revocation propagates to every member, including members that reconnect with stale Membership Views, so that transitive membership propagation cannot silently restore the removed device. A notified revoked installation relinquishes its Device Membership, stops treating the former members as trusted, rotates to a new Device Identity and Peer ID, then forms a new singleton Device Network. The remaining members continue enforcing revocation even if a compromised client refuses to cooperate.

A revoked Device Identity cannot be reinstated. The same installation can return only after Identity Rotation makes it a new logical device and a current member explicitly accepts fresh Pairing. Passive membership propagation cannot override a revocation.

Device Revocation is remove-wins under concurrent changes. If two members validly revoke each other while partitioned, both revocations take effect when the network reconciles. Once revocation state has been accepted from an authenticated current member, later revocation of that member does not undo the accepted state; a current member forwarding the state reasserts it under its own authority.
