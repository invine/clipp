# 02: Verify owned Electron readiness before acceptance

**What to build:** Prove the existing Electron runner operates the exact candidate and an interactive owned window before acceptance begins.

**Blocked by:** None (can start immediately).

**Status:** resolved

- [x] Candidate/build provenance, process/profile/window ownership and harmless focused interaction are checked before product assertions.
- [x] Prerequisite, runner, product and unknown failures are distinguishable with retained stage evidence.
- [x] Initial attempt plus two changed-hypothesis diagnostic attempts within 20 diagnostic minutes is enforced across invocations; unchanged retries fail.
- [x] Existing memory clipboard and owned-process cleanup remain; deterministic public runner checks and an available native readiness demonstration are recorded.

## Context

The [approved specification](../spec.md) and [decision coverage](../decisions.md) define the complete contract and confirmed public testing seams. Preserve existing product invariants; this ticket changes operational verification only. The coordinator owns claims, integration and resolution.

## Answer

Implemented on the client integration branch. The runner binds build provenance to the owned process/profile/window and harmless focused interaction, classifies failures, retains bounded attempts and enforces cleanup. The exact current integration candidate's readiness receipt is recorded in the local run ledger. This does not claim live relay transfer or provider-login qualification.
