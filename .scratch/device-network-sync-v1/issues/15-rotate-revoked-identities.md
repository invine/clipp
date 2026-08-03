# 15 — Rotate revoked Device Identities safely

**What to build:** Automatically replace a revoked local Device Identity with a new singleton identity through a crash-recoverable cleanup transition while keeping local history accessible during recovery.

**Blocked by:** 08 — Enforce local history policy; 09 — Recover captures after storage failure; 14 — Revoke Device Membership network-wide.

**Status:** ready-for-agent

- [ ] Before networking starts, every runtime checks whether its persisted local Peer ID is revoked and enters rotation instead of starting the old identity.
- [ ] Runtime self-revocation starts rotation automatically without confirmation, export, or grace period and keeps all networking disabled throughout recovery.
- [ ] Rotation persists a transition marker or equivalent state and one candidate replacement keypair; interrupted retries reuse that candidate until commit.
- [ ] While rotation persistence is failing, users can access local Clipboard History and local capture continues under the old Peer ID with a persistent recovery error.
- [ ] Rotation commit atomically activates a new Ed25519 identity and singleton Membership View only after deleting the old private key, Membership View, peer store, pending Pairing state, notifications, former-network presentation metadata, and complete Clipboard History and derived state.
- [ ] Complete history cleanup includes Local and Remote Clips, pins, suppression tombstones, local metadata, pending captures, and Clips captured during recovery.
- [ ] Failure of any required cleanup leaves the replacement identity inactive and networking disabled for another retry.
- [ ] Identity-independent theme, relay, polling, Auto Sync, Clip Sharing Lifetime, local retention, capacity, and frame settings survive unchanged.
- [ ] The replacement identity receives the runtime-default Device Name with revision zero and publishes a fresh Pairing Target.
- [ ] Polling runtimes baseline the current clipboard after commit and create no Clip until a later change; Chrome post-rotation capture behavior remains deferred.
- [ ] A best-effort persistent notice explains revocation, local-history deletion, and the need for fresh Pairing without naming an original revoker.
- [ ] Electron, Android, and Chrome adapter tests cover interrupted cleanup, restart recovery, candidate reuse, successful activation, and notice failure.
