# 16 — Recover from Identity Loss

**What to build:** Detect actual loss of authoritative identity key material and recover through the same safe cleanup boundary without falsely claiming continuity or revoking the inaccessible identity elsewhere.

**Blocked by:** 15 — Rotate revoked Device Identities safely.

**Status:** resolved

- [x] A valid Ed25519 private key remains authoritative and repairs mismatched stored Peer ID or public-key metadata without deleting identity-scoped state.
- [x] A completely empty installation follows ordinary first launch rather than Identity Loss recovery.
- [x] Missing, unreadable, or invalid private-key material for a persisted identity triggers the crash-recoverable rotation cleanup path and keeps networking disabled until commit.
- [x] Recovery deletes the former Membership View, complete Clipboard History and derived state, peer store, pending Pairing state, and former-network presentation metadata rather than transferring them.
- [x] Identity-independent preferences survive recovery unchanged.
- [x] The replacement identity starts as a new singleton with no authority or continuity claim over the inaccessible Peer ID and requires fresh Pairing.
- [x] Fresh Pairing does not replace or revoke the former Peer ID; other members continue to treat it according to their Membership Views until a user separately revokes it.
- [x] A best-effort persistent notice explains the identity reset, local-history deletion, and fresh-Pairing requirement without blocking successful activation if notice storage fails.
- [x] All runtime adapters pass tests for metadata repair, empty first launch, actual key loss, interrupted recovery, and successful replacement activation.

## Answer

- Valid private keys now repair redundant identity metadata before recovery is considered. A persisted record without a usable key is never mistaken for a first launch.
- Identity Loss uses the existing crash-recoverable rotation transaction with the `identity-loss` reason, preserving installation preferences while deleting the former Device Network state and recording the non-blocking reset notice.
- The runtime lifecycle keeps local recovery offline without loading or creating an identity until cleanup commits. Electron also routes early identity initialization failures through the same recovery boundary.
- Added core and Electron, Android, and Chrome adapter coverage for empty installations, metadata repair, missing/unreadable keys, interrupted recovery, replacement activation, cleanup, preference preservation, and notice persistence failure.
