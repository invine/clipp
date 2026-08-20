# 13 — Reuse and explicitly share Clips

**What to build:** Let users deliberately copy a retained Clip or share the current clipboard as a new Local Clip event without mutating the older Clip or globally changing Auto Sync.

**Blocked by:** 09 — Recover captures after storage failure; 10 — Gossip live Clips across the Device Network; 12 — Control Clip exchange with Auto Sync.

**Status:** resolved

- [x] Explicit history reuse serializes the observer and attempts the platform clipboard write before creating a new event.
- [x] A failed explicit write creates no Clip or network message, leaves the selected record unchanged, and exposes an error.
- [x] A successful reuse creates a new UUIDv4 with the current Device Identity, current capture time, current sharing setting, and exact selected content.
- [x] Observer coordination prevents the successful explicit write from producing a second polling or manual capture event.
- [x] Reuse follows ordinary Auto Sync: with Auto Sync disabled, the new Clip remains local and is not sent.
- [x] Every Share Now invocation creates a distinct new Local Clip even when the clipboard matches the current observer baseline.
- [x] Share Now attempts the new Clip's initial live delivery with Auto Sync disabled without enabling Auto Sync, sending older history, or changing future capture behavior.
- [x] Share Now still obeys persistence-before-send, Active membership, expiration, frame-size, storage-capacity, and suppression rules.
- [x] A pending Share Now event retains its one-Clip override only in memory; after recovery it may send only if it is the newest recovered event and still matches the current clipboard.
- [x] Electron, Android, and Chrome expose consistent reuse and Share Now results through their shared UI or runtime bridge.

## Answer

- Added serialized retained-Clip reuse to the shared capture coordinator and clipboard service. The platform write completes before a new immutable Local Clip is persisted and published; write failures propagate to the shared UI without changing history.
- Made ordinary Chrome manual inputs observer-aware so reuse echoes are suppressed, while every Share Now action remains an explicit new capture with an in-memory one-Clip Auto Sync override.
- Exposed Copy/reuse and Share Now through the shared UI and the Electron, Android, and Chrome runtime bridges; Chrome performs clipboard I/O in its offscreen document rather than the MV3 service worker.
- Verified focused capture, clipboard-service, sync, runtime-conformance, and Chrome bridge tests; all three runtime builds; lint; and the full Jest suite (49 passing suites, 310 passing tests; 1 suite and 6 tests skipped).
