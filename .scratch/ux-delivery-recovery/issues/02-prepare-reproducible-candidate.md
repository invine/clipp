# 02: Prepare a reproducible acceptance candidate

**What to build:** Prepare one coherent, attributable application build for an acceptance batch, with dependencies resolved from the intended committed source and unrelated work preserved.

**Blocked by:** None (can start immediately).

**Status:** claimed

**Assignee:** `/root/candidate`

**Claim:** ux-delivery-recovery-20261028-02; coordinator `/root`.

**Parent:** [Approved specification](../spec.md).

- [ ] The maintained preparation/acceptance entry point selects an explicit committed candidate in a clean, isolated checkout. Intended source is reconciled through normal review and checks; excluded dirty work retains its owner and location.
- [ ] Dependency installation uses npm, the supported recorded toolchain and the candidate lockfile. Workspace resolution is checked against the selected checkout; mutable dependency links into another worktree are rejected.
- [ ] A bounded candidate record binds source revision, dependency/build inputs, toolchain/runtime versions, built artifact identity and selected scenario/runner version. It describes the selected built runtime rather than an exhaustive dynamic dependency graph.
- [ ] Preparation rejects stale source/build mappings and missing declared build inputs. Runtime consumers can compare their loaded or installed artifact with the frozen artifact without reconstructing a new receipt protocol.
- [ ] A successful preparation produces a usable frozen build for the selected runtime. Other ticket worktrees can advance without modifying it; a relevant fix creates a successor candidate with an explicit affected-scenario list.
- [ ] Public-command fixtures cover wrong-worktree resolution, changed lockfile/build inputs, stale artifacts, candidate mutation and preservation of unrelated files. A valid disposable candidate successfully prepares through the same entry point.
- [ ] Keep host-dependent addon loading and installed-target checks with the runtime tickets. Passing generic preparation does not claim native startup, Pairing or Android instrumentation success.
- [ ] Wire deterministic checks into an appropriate existing verification profile, preserve existing hooks and CI, and record exact candidate verification. Do not create a duplicate verification framework or require every supported host to complete this foundational slice.

**Scope boundary:** This ticket supplies frozen builds and candidate metadata. Tickets 05–07 prove host-specific loading, installation and interaction. Spec integration starts from main; unavailable required operational-reliability code remains an explicit external prerequisite.
