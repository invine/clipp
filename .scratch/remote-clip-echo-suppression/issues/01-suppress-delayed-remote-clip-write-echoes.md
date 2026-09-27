# 01 — Suppress delayed Remote Clip write echoes

**What to build:** When a Remote Clip is applied to a polling runtime and the platform clipboard exposes that write only later, the later observation must not become a newly authored Local Clip or be shared back as a Remote Clip from that runtime. The behavior applies through the shared clipboard service, covering Android and Electron without altering existing Clipboard History.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] After a successful Remote Clip write, retain one in-memory expected echo for 10 seconds. Suppress only the first exact text match; an immediate matching read-back clears that expectation.
- [ ] Keep only the most recently written Remote Clip as the expected echo. Do not use content normalization or history-wide content deduplication.
- [ ] If a different clipboard value is observed first, cancel the expectation and capture that value as a Local Clip. Once the expectation expires or the process restarts, capture normally.
- [ ] Preserve the existing event model: a deliberate copy of the same text after an intervening value remains a distinct Local Clip. Do not delete or merge existing Clipboard History records.
- [ ] Add deterministic regression coverage for delayed write visibility, an immediate read-back, expiry, interruption by another clipboard value, and rapid inbound Remote Clip writes; include a sync-level assertion that the echo is not forwarded back as a new runtime-originated Clip.
