# 02: Verify owned Electron readiness before acceptance

**What to build:** Prove the existing Electron runner operates the exact candidate and an interactive owned window before acceptance begins.

**Blocked by:** None (can start immediately).

**Status:** resolved

- [x] Candidate/build provenance, process/profile/window ownership and harmless focused interaction are checked before product assertions.
- [x] Prerequisite, runner, product and unknown failures are distinguishable with retained stage evidence.
- [x] Initial attempt plus two changed-hypothesis diagnostic attempts within 20 diagnostic minutes is enforced across invocations; initial build and normal matrix execution stay outside the diagnostic budget.
- [x] Existing memory clipboard and owned-process cleanup remain; deterministic public runner checks and an available native readiness demonstration are recorded.

## Context

The [approved specification](../spec.md) and [decision coverage](../decisions.md) define the complete contract and confirmed public testing seams. Preserve existing product invariants; this ticket changes operational verification only. The coordinator owns claims, integration and resolution.

## Answer

Implemented and integrated on the client branch. The runner binds build provenance to the owned process/profile/window and harmless focused interaction, classifies failures, retains bounded attempts and enforces cleanup. The initial build and normal acceptance are outside the diagnostic clock; a failing initial attempt starts the clock when its receipt is recorded, and subsequent diagnostic rebuilds use the remaining budget. The regression test failed before the change and passed after it; focused Electron readiness tests passed 12/12, and the exact integration tree passed `npm run check` (81 suites, 726 tests). Standards and Spec reviews passed. The prior owned Electron readiness demonstration remains recorded for the clean candidate `c33ade629da2c85479ff6eb91a06efe8ff20d6d9`; no new native attempt was run after this runner-only timing correction. This does not claim live relay transfer or provider-login qualification.

## Comments

Reopened after final Spec review found that the initial Electron candidate build was charged against the 20-minute diagnostic clock, contrary to the accepted specification. The integration fix excludes the initial build while diagnostic rebuilds remain charged.
