# 09 — Recover captures after storage failure

**What to build:** Preserve Local Clip events in memory during temporary storage failure and recover them without changing their identity, blocking later captures, or replaying stale clipboard updates.

**Blocked by:** 07 — Capture immutable Clips across all runtimes; 08 — Enforce local history policy.

**Status:** ready-for-agent

- [ ] A non-conflict insert failure retains the same immutable Clip and UUID in an in-memory pending-capture queue and retries with capped backoff while the runtime remains active.
- [ ] An inability to admit a Local Clip because a required tombstone slot is unavailable follows the same pending path without partial state.
- [ ] The observer advances its exact baseline as soon as the event becomes pending, so unchanged observations do not create more pending Clips.
- [ ] Later clipboard changes create independent events and receive independent persistence attempts even while older events continue failing.
- [ ] The production queue is bounded to 100 Clips or 10 MiB, with injectable limits and deterministic oldest-first eviction when a new candidate must fit.
- [ ] A candidate larger than the entire queue limit is discarded without evicting existing pending Clips and produces a content-free error.
- [ ] Pending or evicted events create no suppression tombstone because they were never durably stored or shared.
- [ ] No pending event is live-sent or offered through history before durable storage succeeds.
- [ ] Recovery stores every recoverable event, retains original presentation ordering, and leaves an expired recovered Clip local-only.
- [ ] At most the newest recovered Clip whose exact content is still current may receive a live attempt; older recovered Clips are not replayed as successive clipboard updates.
- [ ] The visible storage error remains until no capture requires persistence.
- [ ] Restart loses the in-memory queue and follows the ordinary startup-baseline rule without manufacturing replacement events.
