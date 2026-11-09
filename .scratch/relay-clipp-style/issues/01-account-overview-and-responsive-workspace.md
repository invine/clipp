# 01: Account overview and responsive workspace

**What to build:** Deliver the Clipp-aligned portal workspace and a usable Relay Account overview with real allowance and capacity information, dark and light appearances, and compact responsive navigation.

**Blocked by:** None (can start immediately).

**Status:** resolved

- [x] Preserve a durable, reviewable copy of the approved design reference and establish the Relay effort's integration lineage from current repository facts before implementation.
- [x] The served portal presents the approved dark-first design, light-theme choice, recognizable icons and responsive navigation, with a safe usable default if scripts or browser storage are unavailable; changing theme preserves the user's task.
- [x] Owners see their actual account identity and status, authoritative UTC quota window, effective allowance, nonnegative remaining amount and unmodified Recorded Relay Usage, including zero allowance and overrun cases.
- [x] Relay Sessions and Login Grants remain separate, with their independent limits and truthful known-zero or unavailable observations; no device membership or connection health is inferred.
- [x] Pending, Suspended, Denied and Recovery Review Hold states remain understandable, and existing content, actions, administrator authorization and no-script functionality remain available while later tickets are outstanding.
- [ ] Complete browser inspection at the built-service browser seam in both themes and responsive layouts, using fixtures; do not run connection tests or tests that send Clips.

## Answer

Integrated in Relay at `4a12bae080ae14689047223cbeaea42f508adcc9` (source `1fe52d9a64ca5d486029e25962daa63ec10036be`). The visual reference was preserved at `/Users/invine/src/go/clipp-relay/.local/relay-clipp-style/reference/`; lineage and evidence are recorded in that checkout's `.local/relay-clipp-style/run.md`.

Focused `internal/portal` tests, targeted auth portal HTTP tests, JavaScript syntax/format and diff checks passed. The routine profile could not pass sandbox-denied loopback binds in unrelated tests. Built-service browser acceptance was not run because the required local serving/TLS setup was unavailable and the runner includes connection flows. No connection tests or Clip-sending tests were run.
