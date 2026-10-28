# 04: Enforce durable diagnostic limits through an existing runner

**What to build:** Make the maintained Electron acceptance command stop uninformative retry loops while retaining enough history to resume diagnosis accurately and clean up owned resources safely.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

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
