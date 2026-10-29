# 05: Replace Electron's exhaustive preparation gate

**What to build:** Reach the real Electron behavior under test through a finite candidate-bound preflight instead of an exhaustive dependency-graph SEAL requirement.

**Blocked by:** [02 — Prepare a reproducible acceptance candidate](02-prepare-reproducible-candidate.md), [04 — Enforce durable diagnostic limits through an existing runner](04-enforce-diagnostic-limits.md).

**Status:** resolved

**Claim:** ux-delivery-recovery-20261028-05; coordinator `/root`.

**Parent:** [Approved specification](../spec.md).

- [ ] Extend the maintained Electron acceptance path to consume the frozen candidate and durable diagnostic policy. Reuse existing owned-profile and clipboard fixtures where they meet the scenario's requirements.
- [ ] Verify the owning runtime's required native modules and ABI, then start the actual product entry in a disposable profile. A standalone SQLite query or successful compilation is not startup proof.
- [ ] Required missing modules, ABI failures, stale build identity and unusable windows fail at the correct preflight stage. Unused optional/tooling branches do not require universal dependency proof before the selected scenario runs.
- [ ] Verify the owned application window and a harmless observable interaction, then execute a focused behavioral scenario through the same runner and record its exact candidate and limits.
- [ ] Replace obsolete SEAL prerequisites and their callers/instructions together, preserving old failed attempts as historical evidence. No replacement receipt claims an old SEAL succeeded.
- [ ] Keep normal dependency provenance, lockfile checks, transport policy and one-retained-Relay-Session fallback. Fix reproducible installation at its setup boundary rather than patching successive runtime copies manually.
- [ ] Cleanup uses recorded owned handles/groups and current identity checks, protects against PID reuse and preserves uncertain outcomes. It does not require proof of every historical detached descendant or signal unrelated processes.
- [ ] Public-command regression checks cover the rejected preparation cases and successful selected path. A real supported-host startup/interaction demonstration substantiates the native claims; unavailable required native evidence stays open.
- [ ] Complete applicable project checks and source/evidence review. State which Pairing prerequisites are ready without claiming the complete rejection/acceptance/restart/exchange matrix.

**Scope boundary:** Ticket 10 demonstrates the actual two-runtime Pairing path during adoption. This ticket completes the Electron preparation and focused runtime slice independently of Android or Chrome availability. Required operational-reliability source must be available through main.

## Concrete setup regression retained for this ticket

The03 exact-path audit found the same `.trim()` pattern in `prepare-acceptance-candidate.mjs`: `tracked()` reads `git ls-files -z` through `run()`, which trims the first path. A valid leading-whitespace tracked filename can be misidentified or omitted from the input manifest. Preserve the exact NUL-delimited path stream and add a public candidate-command regression at this existing setup seam. This is a concrete source/input mapping defect, not a new product scenario or broad dependency-audit gate. The03 impact-assessment instance is fixed in its own scope; this preparation-instance correction belongs here.

Native preparation notes are preserved at primary-root `.local/ux-delivery-recovery/evidence/native-preparation-notes.md`. Locked better-sqlite3 has a bundled arm64 N-API prebuild; absent `build/Release` is not proof of a missing addon. Verify actual loading/product startup rather than inventing a rebuild prerequisite.

## Review correction

Source382134a passed checks and Standards review. Spec requires launch failures with missing/unreadable native probe observations to remain launch runner/unknown, rather than asserting an unobserved native prerequisite or prescribing loader rebuilding. The original owner applies the narrow public-command correction before native qualification. The prepared candidate remains historical/unrun; no native attempt has been reset.

## Answer

Integrated reviewed source `9f33c3a5dc2b53f629c80da4250d3a0b3154c599` (feature382134a, classification35e1430, awaited-state9f33c3a). The maintained Electron command consumes a verified frozen candidate without rebuilding, checks finite required native modules in its owning Electron process, then starts the actual product entry and observes the owned window and native interaction. Setup now preserves exact NUL-delimited Git paths. The last enabled hook passed81 suites/792 tests plus36 candidate cases; all source and affected reviews are clear.

Actual frozen candidate `electron-history-20261028-7`, artifact `5ab0154d274e9c8e601439e1549290eba6baf6ffd7bd18fec5991a4b7a83ff4c`, passed SQLite/wrtc loading in Electron43.4.0 (ABI148/N-API10), real main/window/bridge startup, native Pinned/All readiness, a newly captured memory-only Local Clip, native Pin, visible Pinned filter and persisted public pin state. Cleanup was graceful and host clipboard was neither read nor changed. Post-run candidate verification passed unchanged.

The first native attempt failed its capture assertion; supplemental diagnosis identified the async Playwright predicate race rather than an established product defect. Its original receipt/classification remains intact. The corrected successor passed attempt2 in the same budget0, effort, history, output and profile, with changed hypothesis/expected observation. Diagnostic rebuilding used the original remaining deadline; no budget renewal or label reset occurred. Source/archive and recovery snapshot are preserved outside disposable worktrees.

Primary-root `.local/ux-delivery-recovery/evidence/` holds `ticket-05-electron-history/receipt.json`, immutable `native-history/b8c1426b279396495b9de5e964f80bb65fc142a27323a7f398a7554f214415d0/budget-0/attempt-{1,2}/`, `ticket-05-native-failure-diagnosis.json`, source/affected review reports, hook/toolchain receipts, `ticket-05-diagnostic-rebuild-ownership.json` and `ticket-05-candidate-after-native.log`. The source handoff owns exact command structure. This completes the finite Electron slice, not Pairing/relay transfer or old SEAL claims. Ticket10 owns active UX caller adoption and the actual two-runtime Pairing demonstration.
