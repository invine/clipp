# 13 — Reuse and explicitly share Clips

**What to build:** Let users deliberately copy a retained Clip or share the current clipboard as a new Local Clip event without mutating the older Clip or globally changing Auto Sync.

**Blocked by:** 09 — Recover captures after storage failure; 10 — Gossip live Clips across the Device Network; 12 — Control Clip exchange with Auto Sync.

**Status:** ready-for-agent

- [ ] Explicit history reuse serializes the observer and attempts the platform clipboard write before creating a new event.
- [ ] A failed explicit write creates no Clip or network message, leaves the selected record unchanged, and exposes an error.
- [ ] A successful reuse creates a new UUIDv4 with the current Device Identity, current capture time, current sharing setting, and exact selected content.
- [ ] Observer coordination prevents the successful explicit write from producing a second polling or manual capture event.
- [ ] Reuse follows ordinary Auto Sync: with Auto Sync disabled, the new Clip remains local and is not sent.
- [ ] Every Share Now invocation creates a distinct new Local Clip even when the clipboard matches the current observer baseline.
- [ ] Share Now attempts the new Clip's initial live delivery with Auto Sync disabled without enabling Auto Sync, sending older history, or changing future capture behavior.
- [ ] Share Now still obeys persistence-before-send, Active membership, expiration, frame-size, storage-capacity, and suppression rules.
- [ ] A pending Share Now event retains its one-Clip override only in memory; after recovery it may send only if it is the newest recovered event and still matches the current clipboard.
- [ ] Electron, Android, and Chrome expose consistent reuse and Share Now results through their shared UI or runtime bridge.
