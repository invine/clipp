# 08 — Enforce local history policy

**What to build:** Give users predictable local deletion, retention, capacity, and pin behavior without allowing reconciliation to undo removal during a Clip's remaining sharing window.

**Blocked by:** 07 — Capture immutable Clips across all runtimes.

**Status:** resolved

- [x] Each history record stores local-only `firstStoredAt`, `liveHandled`, and pin state without mutating the Clip or exchanging that metadata.
- [x] Delete removes a Clip only from the current device and atomically creates a Clip Suppression Tombstone when the Clip remains acceptable during its skew-aware sharing window.
- [x] Clear History atomically removes all durable history and creates every required tombstone before discarding pending in-memory captures.
- [x] Failed deletion or Clear History leaves history and tombstones unchanged and exposes a retryable error.
- [x] Suppression tombstones prevent live and historical restoration, expire after the sharing window, and obey the 100,000-record or 16 MiB production capacity without evicting unexpired tombstones.
- [x] Unpinned retention defaults to 30 days from `firstStoredAt`, has a one-year maximum, applies setting changes immediately, and never restores removed records.
- [x] Unpinned capacity defaults to 10,000 Clips or 100 MiB and evicts by oldest `capturedAt`, then raw UUID bytes.
- [x] New Local and live Clips receive admission priority, while historical imports participate atomically in capacity ranking and can be locally suppressed when outside the retained set.
- [x] Retention or capacity removal atomically creates required suppression; inability to create tombstones leaves affected history intact for later retry.
- [x] Pins remain local, do not extend `shareExpiresAt`, and exempt records from ordinary retention and capacity cleanup.
- [x] Pins persist across Electron and Android restart; no Chrome pin-persistence guarantee is introduced.
- [x] Unpinning immediately reapplies current retention and capacity policy atomically.
