# 16 — Recover from Identity Loss

**What to build:** Detect actual loss of authoritative identity key material and recover through the same safe cleanup boundary without falsely claiming continuity or revoking the inaccessible identity elsewhere.

**Blocked by:** 15 — Rotate revoked Device Identities safely.

**Status:** ready-for-agent

- [ ] A valid Ed25519 private key remains authoritative and repairs mismatched stored Peer ID or public-key metadata without deleting identity-scoped state.
- [ ] A completely empty installation follows ordinary first launch rather than Identity Loss recovery.
- [ ] Missing, unreadable, or invalid private-key material for a persisted identity triggers the crash-recoverable rotation cleanup path and keeps networking disabled until commit.
- [ ] Recovery deletes the former Membership View, complete Clipboard History and derived state, peer store, pending Pairing state, and former-network presentation metadata rather than transferring them.
- [ ] Identity-independent preferences survive recovery unchanged.
- [ ] The replacement identity starts as a new singleton with no authority or continuity claim over the inaccessible Peer ID and requires fresh Pairing.
- [ ] Fresh Pairing does not replace or revoke the former Peer ID; other members continue to treat it according to their Membership Views until a user separately revokes it.
- [ ] A best-effort persistent notice explains the identity reset, local-history deletion, and fresh-Pairing requirement without blocking successful activation if notice storage fails.
- [ ] All runtime adapters pass tests for metadata repair, empty first launch, actual key loss, interrupted recovery, and successful replacement activation.
