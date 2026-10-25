# 02: Verify owned Electron readiness before acceptance

**What to build:** Prove the existing Electron runner operates the exact candidate and an interactive owned window before acceptance begins.

**Blocked by:** None (can start immediately).

**Status:** claimed

- [ ] Candidate/build provenance, process/profile/window ownership and harmless focused interaction are checked before product assertions.
- [ ] Prerequisite, runner, product and unknown failures are distinguishable with retained stage evidence.
- [ ] Initial attempt plus two changed-hypothesis diagnostic attempts within 20 diagnostic minutes is enforced across invocations; unchanged retries fail.
- [ ] Existing memory clipboard and owned-process cleanup remain; deterministic public runner checks and an available native readiness demonstration are recorded.

## Context

The [approved specification](../spec.md) and [decision coverage](../decisions.md) define the complete contract and confirmed public testing seams. Preserve existing product invariants; this ticket changes operational verification only. The coordinator owns claims, integration and resolution.
