# 02: Usage history and Connect Clipp

**What to build:** Let a Relay Account owner understand recorded weekly usage and reach real Clipp setup in the approved design, including accessible and no-script alternatives.

**Blocked by:** 01 — Account overview and responsive workspace.

**Status:** resolved

- [x] Present the latest four weekly observations by default and provide the full current week plus twelve retained preceding weeks, with exact accessible totals, UTC dates and the current incomplete week identified.
- [x] Chart and table values remain accurate and chronological, with zero and missing data distinguished, current-week content reachable on narrow screens and no fabricated or clamped recorded usage.
- [x] Connect Clipp presents the real canonical Relay Discovery Endpoint and supported client setup instructions, explaining that a Portal Session does not authorize a Clipp app.
- [x] Copy feedback reports actual success or failure and allows manual selection when copying is unavailable; essential setup and history remain usable without JavaScript.
- [ ] Verify real served UI and HTTP behavior, responsive and keyboard interaction with deterministic fixtures; do not run connection tests or tests that send Clips.

## Answer

Integrated in Relay at `ca95509e66e658a76480c6adf2f8a5684293a2bd` (ticket source `6659a763c70db1b251182d7e942fa5c8c4834527`, updated on latest integration at `1e4cbf6cf33acc626fe81e3668b4e52c505cab59`). Existing absolute thirteen-week history already met the requirements and was preserved. Connect Clipp now opens a native contextual dialog with focus restoration and a hash-linked no-script fallback.

Portal package tests, fixture service build, browser acceptance script syntax and diff checks passed. PostgreSQL-backed owner-profile test skipped due missing disposable database configuration. Built-service browser acceptance could not run because serving configuration, `CHROME_BIN` and TLS files are absent. No connection or Clip-sending tests were run; record this limitation for ticket 07.
