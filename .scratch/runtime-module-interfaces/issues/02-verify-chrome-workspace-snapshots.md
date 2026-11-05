# 02: Verify Chrome workspace snapshots

**What to build:** Make Chrome's production popup and options adapters publish through the shared snapshot module and pass the common conformance cases in Chrome's extension context.

**Blocked by:** [01](01-stabilize-electron-workspace-snapshots.md)

**Status:** resolved

- [ ] The real adapter runs inside Chrome's extension context for both popup and options without mounting a workspace or React. Tests control bridge messages and host inputs through the production adapter interface.
- [ ] Both surfaces pass the common snapshot identity, retained values, publication ordering, lifecycle, and listener cleanup cases.
- [ ] Controlled messages demonstrate each surface's bridge translation and supported capabilities, including popup-only clipboard capture and established unavailable-capability behavior in options.
- [ ] A delayed observation or callback from a stopped popup cannot affect its replacement or the options document. Independent settings and Clipboard History authority remain observable.

## Context

The specification covers this slice in [R1](../spec.md#r1-adapter-interface-and-snapshot-publication) and [R7](../spec.md#r7-production-adapter-conformance-in-each-runtime). The [decision record](../decisions.md) records the approved scope and dependencies.

## Answer

Integrated on `codex/runtime-module-interfaces-integration` at `6c7accb3098af19870c4dabf7068f908aadef712`. The production Chrome adapter passes the shared conformance cases in popup and options pages inside a real extension context without mounting React. The fixture verifies popup-only clipboard capture, surface capabilities, publication/lifecycle behavior, stale popup reads after stop, options isolation, and separate settings/history revisions. The focused Chrome harness passed, all four workspace typechecks passed, Jest passed 207 suites/1,670 tests, and candidate validation passed 133/133. Coordinator review confirmed the required host context and independent document lifetimes.
