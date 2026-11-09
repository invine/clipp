# 05: Quota Plan management

**What to build:** Present existing Relay Quota Plan discovery and administration in the approved design without changing assigned allowances or plan policy.

**Blocked by:** 01 — Account overview and responsive workspace.

**Status:** resolved

- [x] Authorized administrators can view the bounded plan library with real plan names, weekly allowances, Relay Session limits, availability and existing assignment information.
- [x] Existing create and archive operations retain validation, reasons, authorization, operation identity and safe handling of conflicts or uncertain outcomes.
- [x] Archiving prevents new assignments without changing existing assignments; assigned plan allowances remain immutable and the UI does not introduce self-selection or in-place plan editing.
- [x] Both themes, responsive and keyboard operation, and essential no-script forms remain usable.
- [ ] Verify observable behavior through the established production portal HTTP and built-service browser seams with disposable fixtures; do not run connection tests or tests that send Clips.

## Answer

Integrated in Relay at `73b5c4155e1d4fc52ea2cd5a5c64fe1e5486d856` (source feature commit `e90a42f`, branch merge `60bd087`). The plan library now shows actual assigned Relay Account counts, including for archived plans, from the bounded plan reads. Existing create/archive operations and immutable assignment policy remain unchanged.

`go test ./internal/portal` and diff checks passed. The focused HTTP plan-library test compiled but skipped because `CLIPP_TEST_SERVING_CONFIG` is absent. Built-service browser acceptance was unavailable. No connection or Clip-sending tests ran; full responsive and theme inspection remains for ticket 07.
