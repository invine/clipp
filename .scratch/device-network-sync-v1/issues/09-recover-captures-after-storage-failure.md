# 09 — Recover captures after storage failure

**What to build:** Preserve Local Clip events in memory during temporary storage failure and recover them without changing their identity, blocking later captures, or replaying stale clipboard updates.

**Blocked by:** 07 — Capture immutable Clips across all runtimes; 08 — Enforce local history policy.

**Status:** resolved

- [x] A non-conflict insert failure retains the same immutable Clip and UUID in an in-memory pending-capture queue and retries with capped backoff while the runtime remains active.
- [x] An inability to admit a Local Clip because a required tombstone slot is unavailable follows the same pending path without partial state.
- [x] The observer advances its exact baseline as soon as the event becomes pending, so unchanged observations do not create more pending Clips.
- [x] Later clipboard changes create independent events and receive independent persistence attempts even while older events continue failing.
- [x] The production queue is bounded to 100 Clips or 10 MiB, with injectable limits and deterministic oldest-first eviction when a new candidate must fit.
- [x] A candidate larger than the entire queue limit is discarded without evicting existing pending Clips and produces a content-free error.
- [x] Pending or evicted events create no suppression tombstone because they were never durably stored or shared.
- [x] No pending event is live-sent or offered through history before durable storage succeeds.
- [x] Recovery stores every recoverable event, retains original presentation ordering, and leaves an expired recovered Clip local-only.
- [x] At most the newest recovered Clip whose exact content is still current may receive a live attempt; older recovered Clips are not replayed as successive clipboard updates.
- [x] The visible storage error remains until no capture requires persistence.
- [x] Restart loses the in-memory queue and follows the ordinary startup-baseline rule without manufacturing replacement events.

## Comments

- Verified against the shared capture-coordinator and runtime-clipboard seams. The existing implementation preserves failed immutable captures in a bounded oldest-first queue, retries them with capped active-runtime backoff, advances the observation baseline before queuing, and emits at most the newest recovered capture whose exact content remains current.
- Recovery now also re-enters the eligible live path when a write committed before its storage call reported failure. A retry then observes the same immutable Clip as an exact duplicate rather than a newly stored record.
- Confirmed with the focused capture/runtime suites and the full Jest suite (43 passing suites, 249 passing tests; 5 skipped).
