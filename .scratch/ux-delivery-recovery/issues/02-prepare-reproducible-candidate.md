# 02: Prepare a reproducible acceptance candidate

**What to build:** Prepare one coherent, attributable application build for an acceptance batch, with dependencies resolved from the intended committed source and unrelated work preserved.

**Blocked by:** None (can start immediately).

**Status:** resolved

**Assignee:** `/root/candidate`

**Claim:** ux-delivery-recovery-20261028-02; coordinator `/root`.

**Parent:** [Approved specification](../spec.md).

- [x] The maintained preparation/acceptance entry point selects an explicit committed candidate in a clean, isolated checkout. Intended source is reconciled through normal review and checks; excluded dirty work retains its owner and location.
- [x] Dependency installation uses npm, the supported recorded toolchain and the candidate lockfile. Workspace resolution is checked against the selected checkout; mutable dependency links into another worktree are rejected.
- [x] A bounded candidate record binds source revision, dependency/build inputs, toolchain/runtime versions, built artifact identity and selected scenario/runner version. It describes the selected built runtime rather than an exhaustive dynamic dependency graph.
- [x] Preparation rejects stale source/build mappings and missing declared build inputs. Runtime consumers can compare their loaded or installed artifact with the frozen artifact without reconstructing a new receipt protocol.
- [x] A successful preparation produces a usable frozen build for the selected runtime. Other ticket worktrees can advance without modifying it; a relevant fix creates a successor candidate with an explicit affected-scenario list.
- [x] Public-command fixtures cover wrong-worktree resolution, changed lockfile/build inputs, stale artifacts, candidate mutation and preservation of unrelated files. A valid disposable candidate successfully prepares through the same entry point.
- [x] Keep host-dependent addon loading and installed-target checks with the runtime tickets. Passing generic preparation does not claim native startup, Pairing or Android instrumentation success.
- [x] Wire deterministic checks into an appropriate existing verification profile, preserve existing hooks and CI, and record exact candidate verification. Do not create a duplicate verification framework or require every supported host to complete this foundational slice.

**Scope boundary:** This ticket supplies frozen builds and candidate metadata. Tickets 05–07 prove host-specific loading, installation and interaction. Spec integration starts from main; unavailable required operational-reliability code remains an explicit external prerequisite.

## Answer

Delivered the maintained `npm run acceptance:candidate -- prepare|verify` command, existing-check integration and Electron setup documentation. It selects committed source in an isolated clone, provisions the locked Electron distribution, binds source/build/installed runtime identity and rejects wrong-worktree inputs, stale or mutated artifacts and unsupported distribution overrides. Related fixes were implemented by the same ticket owner; failed attempts remain preserved.

Source commits `1868dd9513d727eea71cd915c747725fa9fab6f6`, `80ca532ebc42266d4f837e1747c3af0e9d1aba69` and `127ad92b92cfc9332f7fe9749bd70b5aac660dff` are integrated by inspected merges at final candidate `127ad92b92cfc9332f7fe9749bd70b5aac660dff`. Merger verified scope and clean containment. Standards/Spec reviews of the assembled slice and affected fixes found no remaining blocking findings.

The real frozen candidate passed isolated npm installation, locked Electron provisioning, full production build and public verification. Its exact checkout passed all typechecks, 76 Jest suites/654 tests and 21 public command fixtures. Node 26.12.1/npm 11.20.0, macOS arm64, Electron 43.4.0; artifact `178e80e70dc9b2e383ed2d41025966bad2c8833669b0531dabed9845c50638be`. Hooks stayed enabled. Focused lint/format/syntax passed. Full lint retains an unchanged main-baseline error; `verify` remains unavailable until the agent-workflow prerequisite reaches main. These limitations are recorded, not passed.

Native addon loading/ABI, startup, interaction, active UX adoption and Pairing remain unrun and owned by later scopes. Coordinator `/root` resolves this foundational preparation slice on 2026-10-28. See [current run](../run.md), [review](../review.md), and durable evidence ID `integration-127ad92-final.json` in the primary-root evidence directory. The frozen candidate remains at the observed source revision after reporting-only tracker edits.
