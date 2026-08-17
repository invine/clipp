# 07 — Capture immutable Clips across all runtimes

**What to build:** Route every clipboard input through one shared capture coordinator that creates an immutable v1 Clip and atomically retains it before any future network delivery.

**Blocked by:** 02 — Initialize Device Identities across all runtimes.

**Status:** claimed

- [ ] The shared Clip model contains a valid 16-byte UUIDv4, canonical `originPeerId`, precise `capturedAt`, finite `shareExpiresAt`, and exactly one text or HTTP(S) URL content alternative.
- [ ] Text preserves the exact non-empty clipboard value; URL classification requires the entire untrimmed value to parse as HTTP(S) and stores the original string without canonicalization.
- [ ] The origin applies a 24-hour default Clip Sharing Lifetime with a 30-day production maximum and two-minute clock-skew allowance; settings affect only future Clips.
- [ ] The capture coordinator alone classifies content, chooses immutable fields, performs atomic insert, updates observer state, and initiates any later live behavior.
- [ ] Polling, Android capture, Chrome popup input, explicit user capture entry points, and future Share Now calls do not independently mint, persist, or broadcast Clips.
- [ ] History storage atomically checks suppression, compares immutable fields, and reports newly stored, exact duplicate, immutable conflict, or locally suppressed.
- [ ] Candidate UUID conflicts retry up to three times without changing other immutable fields; exhaustion abandons the event and emits only content-free diagnostics.
- [ ] Electron and Android baseline the current clipboard at startup without capturing it, update baseline for an empty clipboard without a Clip, and compare exact values rather than content hashes.
- [ ] Remote clipboard writes serialize with observation and use read-back where available so platform transformations do not create a Local Clip echo.
- [ ] Chrome explicit input follows the same event and storage rules despite lacking background polling.
- [ ] Local or Remote classification is derived from `originPeerId`; history does not persist a mutable `isLocal` flag.
- [ ] A successful local capture is durable before it becomes eligible for any network send.
