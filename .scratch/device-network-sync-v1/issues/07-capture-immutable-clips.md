# 07 — Capture immutable Clips across all runtimes

**What to build:** Route every clipboard input through one shared capture coordinator that creates an immutable v1 Clip and atomically retains it before any future network delivery.

**Blocked by:** 02 — Initialize Device Identities across all runtimes.

**Status:** resolved

- [x] The shared Clip model contains a valid 16-byte UUIDv4, canonical `originPeerId`, precise `capturedAt`, finite `shareExpiresAt`, and exactly one text or HTTP(S) URL content alternative.
- [x] Text preserves the exact non-empty clipboard value; URL classification requires the entire untrimmed value to parse as HTTP(S) and stores the original string without canonicalization.
- [x] The origin applies a 24-hour default Clip Sharing Lifetime with a 30-day production maximum and two-minute clock-skew allowance; settings affect only future Clips.
- [x] The capture coordinator alone classifies content, chooses immutable fields, performs atomic insert, updates observer state, and initiates any later live behavior.
- [x] Polling, Android capture, Chrome popup input, explicit user capture entry points, and future Share Now calls do not independently mint, persist, or broadcast Clips.
- [x] History storage atomically checks suppression, compares immutable fields, and reports newly stored, exact duplicate, immutable conflict, or locally suppressed.
- [x] Candidate UUID conflicts retry up to three times without changing other immutable fields; exhaustion abandons the event and emits only content-free diagnostics.
- [x] Electron and Android baseline the current clipboard at startup without capturing it, update baseline for an empty clipboard without a Clip, and compare exact values rather than content hashes.
- [x] Remote clipboard writes serialize with observation and use read-back where available so platform transformations do not create a Local Clip echo.
- [x] Chrome explicit input follows the same event and storage rules despite lacking background polling.
- [x] Local or Remote classification is derived from `originPeerId`; history does not persist a mutable `isLocal` flag.
- [x] A successful local capture is durable before it becomes eligible for any network send.

## Comments

- Atomic acceptance and suppression are implemented by each persistence backend transaction, with one shared immutable-Clip decision function.
- Failed local writes retain their original Clip in the bounded active-runtime queue and retry with capped exponential backoff; only the newest recovered Clip that still matches the current clipboard re-enters the live pipeline.
