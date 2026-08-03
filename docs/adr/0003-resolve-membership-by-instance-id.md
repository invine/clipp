---
status: superseded by ADR-0004
---

# Resolve membership by instance ID

Creating a Device Identity in its singleton Device Network or resetting a notified revoked device into a new singleton Device Network creates an opaque, unique Membership Instance ID. Pairing, Device Reinstatement, and other Device Network merges preserve uninterrupted instance IDs. A Device Revocation names the exact Membership Instance ID it removes: revocation is remove-wins for that instance regardless of delivery order, while a late revocation for an older instance cannot affect the fresh singleton instance.

Pairing is idempotent while membership remains active and preserves the existing Membership Instance ID.

A Device Identity may have multiple active Membership Instance IDs after independent admissions in partitioned Device Networks. The identity remains trusted while any instance is active, although the UI presents it once. Removing the identity revokes every active instance observed by the remover; a concurrent unobserved admission survives.

Members reconcile by unioning their sets of known and revoked Membership Instance IDs; an instance is active when it is known and not revoked. This makes reconciliation independent of delivery order. Compaction is deferred while Device Networks remain small, and revocation state must not be discarded by an optimization that could allow an old instance to return.

After a notified revoked device resets into its new singleton Device Network, its active reconciliation state contains only the fresh self-membership. Former network state may be retained as local history but is not advertised, preventing a later Pairing from unintentionally importing members of the former network.

Wall-clock timestamps remain metadata and do not determine authority. This avoids clock skew or a far-future timestamp permanently overriding a legitimate Device Reinstatement.
