# 15 — Rotate revoked Device Identities safely

**What to build:** Automatically replace a revoked local Device Identity with a new singleton identity through a crash-recoverable cleanup transition while keeping local history accessible during recovery.

**Blocked by:** 08 — Enforce local history policy; 09 — Recover captures after storage failure; 14 — Revoke Device Membership network-wide.

**Status:** resolved

- [x] Before networking starts, every runtime checks whether its persisted local Peer ID is revoked and enters rotation instead of starting the old identity.
- [x] Runtime self-revocation starts rotation automatically without confirmation, export, or grace period and keeps all networking disabled throughout recovery.
- [x] Rotation persists a transition marker or equivalent state and one candidate replacement keypair; interrupted retries reuse that candidate until commit.
- [x] While rotation persistence is failing, users can access local Clipboard History and local capture continues under the old Peer ID with a persistent recovery error.
- [x] Rotation commit atomically activates a new Ed25519 identity and singleton Membership View only after deleting the old private key, Membership View, peer store, pending Pairing state, notifications, former-network presentation metadata, and complete Clipboard History and derived state.
- [x] Complete history cleanup includes Local and Remote Clips, pins, suppression tombstones, local metadata, pending captures, and Clips captured during recovery.
- [x] Failure of any required cleanup leaves the replacement identity inactive and networking disabled for another retry.
- [x] Identity-independent theme, relay, polling, Auto Sync, Clip Sharing Lifetime, local retention, capacity, and frame settings survive unchanged.
- [x] The replacement identity receives the runtime-default Device Name with revision zero and publishes a fresh Pairing Target.
- [x] Polling runtimes baseline the current clipboard after commit and create no Clip until a later change; Chrome post-rotation capture behavior remains deferred.
- [x] A best-effort persistent notice explains revocation, local-history deletion, and the need for fresh Pairing without naming an original revoker.
- [x] Electron, Android, and Chrome adapter tests cover interrupted cleanup, restart recovery, candidate reuse, successful activation, and notice failure.

## Answer

- Startup and self-revocation route through a shared Identity Rotation lifecycle before networking. Recovery retains the old identity and local-only Clipboard History/capture while exposing a persistent recovery state; networking remains disabled until replacement activation and restart.
- Rotation stages one durable Ed25519 candidate, rolls interrupted cleanup back to the old active storage generation, and reuses the candidate on retry. SQLite commits cleanup and activation transactionally; IndexedDB and composed runtime storage use recoverable generation/checkpoint backups. After activation, any retained transition marker is replaced with a non-sensitive committed record before deletion becomes best effort.
- Successful cleanup removes the old identity and Membership View, peer records, pending Pairing and runtime state, notifications, presentation metadata, Local and Remote Clips, pins, suppression tombstones, and recovery captures while preserving identity-independent installation preferences.
- The replacement is a runtime-named revision-zero singleton. Polling services establish a fresh clipboard baseline after restart, Chrome retains its documented deferred behavior, and the non-blocking persistent notice requires fresh Pairing without attributing a revoker. Its revocation/reset reason survives until the user acknowledges it.
- Cross-runtime adapter tests now exercise revoked-identity marker persistence, marker removal and activation failures, local-only recovery, restart recovery, candidate reuse, successful activation, runtime-default naming, networking re-enable, and notice failure on Electron, Android, and Chrome.
