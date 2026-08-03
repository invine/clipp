# 12 — Control Clip exchange with Auto Sync

**What to build:** Let users disable and re-enable Clip exchange without stopping local capture or leaving the Device Network, and coordinate immediate history repair without live backlog replay.

**Blocked by:** 11 — Repair missed Clips with full history snapshots.

**Status:** ready-for-agent

- [ ] Auto Sync defaults enabled, persists across restart, and survives Identity Rotation as an identity-independent installation preference.
- [ ] Disabling Auto Sync keeps local capture and Clipboard History active while suppressing outbound live Clips, outbound snapshots, inbound live acceptance, and inbound History Batch acceptance.
- [ ] Disabling Auto Sync does not stop Pairing, Membership Reconciliation, Device Revocation, discovery, reachability, or other non-Clip protocols.
- [ ] Disabling immediately cancels in-progress outbound snapshots and clears their pending-follow-up state without retracting already transmitted Clips.
- [ ] Receive paths recheck Auto Sync before persistence; queued post-commit live side effects recheck it before starting and remain canceled if it was disabled.
- [ ] Enabling Auto Sync sends a full snapshot and one History Request to every currently connected Active Member without waiting for reconnection.
- [ ] A History Request is a separate one-frame control stream, carries no identity or inventory fields, and receives a separate ordinary snapshot only when the recipient currently has Auto Sync enabled.
- [ ] One outbound snapshot may run per target; concurrent triggers coalesce into one pending follow-up after successful EOF, while failure clears follow-up and waits for another ordinary trigger.
- [ ] Re-enabling makes all retained unexpired eligible Clips available through history regardless of capture-time Auto Sync state.
- [ ] Re-enabling never replays retained history through the live protocol or overwrites the current clipboard.
- [ ] Snapshot and request streams enforce the shared progress-based idle timeout and recover only through later ordinary triggers.
- [ ] Runtime state and UI consistently expose the persisted preference and current synchronization behavior.
