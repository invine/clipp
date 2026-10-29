# 04: Enforce durable diagnostic limits through an existing runner

**What to build:** Make the maintained Electron acceptance command stop uninformative retry loops while retaining enough history to resume diagnosis accurately and clean up owned resources safely.

**Blocked by:** None (can start immediately).

**Status:** resolved

**Claim:** ux-delivery-recovery-20261028-04; coordinator `/root`.

**Parent:** [Approved specification](../spec.md).

**External prerequisite:** Reuse the corrected operational-reliability attempt policy once available on main, including the preserved five-attempt amendment. If absent, record that dependency; do not silently copy unmerged or dirty changes.

- [ ] Reconcile the existing policy and its amendment, then demonstrate one initial attempt plus at most four diagnostic attempts through the maintained Electron command.
- [ ] The twenty-minute diagnostic clock starts after the initial failure. Initial setup and ordinary successful matrix work are excluded; diagnostic rebuilding is charged. Each command receives its remaining deadline and cleanup has a separate bounded allowance.
- [ ] History is durable outside disposable worktrees and keyed by effort plus semantic scenario/environment identity. A new chat, output directory or candidate label alone cannot restart an exhausted failed scenario. Explicit budget renewals preserve and reference earlier failures.
- [ ] Every retry records a changed hypothesis/environment and expected distinguishing observation. Unchanged retries, exhausted attempt counts and exhausted time fail before another diagnostic launch.
- [ ] Receipts distinguish prerequisite, runner, product and unknown failures, including their stage, attempted observation and recovery action. A successful assertion cannot suppress a cleanup failure.
- [ ] Through the public runner, controlled tests exercise command deadlines, interrupted history, concurrent access, directory changes, renewed invocations and the initial-build timing boundary. Tests observe runner behavior rather than private helper structure.
- [ ] Controlled owned-child tests demonstrate normal exit, bounded cleanup, PID-reuse protection and truthful uncertainty without touching unrelated processes. Current verified ownership can admit a safe successor; repeated historical-descendant absence assertions are not required.
- [ ] Run a focused owned Electron readiness/interaction demonstration with cleanup under applicable authorization. Preserve unavailable host evidence as unqualified; do not substitute mocked interaction for a native pass.
- [ ] Keep the shared policy reusable by Chrome and Android without requiring their migrations to close this Electron slice. Update maintained instructions and complete applicable checks/review.

**Scope boundary:** Chrome and Android integration is delivered by tickets 06 and 07. This ticket does not add a general-purpose harness or authorize new clipboard, account or system-setting operations.

## Answer

Integrated source `a3705f3ba2b8dd4a42f5b134db8870b30399c72a` through `3c4650e3eda9ce639a64c3a6854f021a56231be8`. The successor adds only canonical03/05/08/run bookkeeping; runner, policy, dependency lockfile and runtime source are byte-identical to the executed source. Both affected source reviews have no remaining findings. Full source hook passed81 suites/779 tests and21 candidate cases. Integrated public runner verification passed33/33 (`ticket-04-integrated-tests.log`); original observations retain their exact source identities.

The maintained public command ran on independently prepared frozen candidate `electron-readiness-20261028-4` at exact clean source `a3705f3`, artifact `b164857784f66698efa878dfe2fc9dca8bd1608b551913173af18104858e1e9f`. Actual Electron43.4.0/macOSarm64 opened its verified owned window, passed native Pinned/All filter interaction and shut down gracefully. Host clipboard was neither used nor changed. Post-run candidate verification passed with the same artifact identity. This qualifies readiness only; relay transfer and the full Pairing matrix remain unrun.

Durable evidence is primary-root `.local/ux-delivery-recovery/evidence/`: `ticket-04-electron-readiness/receipt.json`, `ticket-04-candidate-prepare.log`, `ticket-04-candidate-after-native.log`, `ticket-04-canonical-ownership-hook.log`, `ticket-04-canonical-host-tests.log` and `review-04-{standards,spec}-a3705f3.md`. Canonical semantic history and registry remain in `native-history/` and `native-state/`; candidate/profile/output labels do not reset them. Controlled regressions cover exhausted and interrupted budgets, changed hypotheses, bounded deadlines, uncertainty and current verified ownership. No older SEAL, transfer or detached-descendant absence claim is relabeled passed.
