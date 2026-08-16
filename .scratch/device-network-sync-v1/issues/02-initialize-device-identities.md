# 02 — Initialize Device Identities across all runtimes

**What to build:** Make every runtime establish a durable Ed25519 Device Identity and singleton Membership View before clipboard capture or networking, with safe failure handling and consistent initial presentation.

**Blocked by:** 01 — Establish the shared runtime seam.

**Status:** resolved

- [x] A fresh Electron, Android, or Chrome installation generates an Ed25519 keypair and atomically persists the Device Identity and singleton Membership View before starting capture or networking.
- [x] The singleton Membership View admits only the new local Peer ID and begins with no revoked Peer IDs.
- [x] Initial Device Names are exactly `Desktop`, `Mobile`, and `Extension`, with `nameRevision` zero and no hostname, account-name, or hardware-model derivation.
- [x] Key generation or initial persistence failure starts neither clipboard capture nor networking, persists no placeholder Peer ID, and exposes a persistent retryable initialization error.
- [x] The private key is authoritative on load; valid key material repairs mismatched redundant Peer ID or public-key metadata.
- [x] Private keys never appear in logs, diagnostics, exports, protocol messages, UI state, or test snapshots.
- [x] Once identity initialization succeeds, local clipboard capture can start independently of relay, discovery, or networking success.
- [x] Shared conformance tests prove identical initialization and failure behavior through all three runtime adapters.

## Comments

- Implemented durable v1 identity initialization, singleton membership state, platform defaults, metadata repair, and failure-safe runtime startup sequencing.
- Reopened after the Ticket 02/03 two-axis code review found that:
  - runtimes publish the complete Device Identity into public UI state, including private key material;
  - the persisted initialization-error marker has no production reader, user-visible retry state, or retry action; and
  - the conformance suite covers successful adapter persistence, but failure behavior only through the identity manager rather than all three runtime adapters.
- Resolved the review findings: public identity projections omit private keys, each runtime exposes an initialization-retry path, extension offscreen initialization reads its private key from durable storage rather than a runtime message, and adapter conformance covers fail-then-retry startup sequencing for Electron, Android, and Chrome.
