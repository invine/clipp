# 03: Verify Capacitor workspace snapshots

**What to build:** Make the production Capacitor adapter pass shared snapshot and lifecycle conformance inside Android WebView, with stable retained observations and controllable host events.

**Blocked by:** [01](01-stabilize-electron-workspace-snapshots.md)

**Status:** resolved

- [ ] The real production adapter starts, publishes, and stops inside an Android WebView without a workspace or React mount.
- [ ] It passes the common snapshot and ordering cases. In particular, a later notification availability publication leaves the nested values in a retained snapshot intact.
- [ ] Controlled focus, visibility, notification, and client inputs demonstrate production translation and subscription cleanup through start, stop, and restart.
- [ ] A delayed callback from a retired adapter generation cannot publish into a replacement. Android capabilities and separate settings and Clipboard History ordering remain observable.

## Context

The specification covers this slice in [R1](../spec.md#r1-adapter-interface-and-snapshot-publication) and [R7](../spec.md#r7-production-adapter-conformance-in-each-runtime). The [decision record](../decisions.md) records the approved scope and dependencies.

## Answer

Integrated on `codex/runtime-module-interfaces-integration` at `9b0671140719f87756b4148ea13fec58996b967c` from source `8278bcbf89f7bfa6b83c272f2a14fa4caf539ec9`. The production Android adapter now runs inside the real API 31 Capacitor WebView through an instrumentation test without mounting React. It exercises the shared snapshot/lifecycle helper, focus and visibility inputs, notification translation/actions, capability reporting, nested retained values, listener cleanup/restart, and retired callback rejection. The instrumentation test passed, all typechecks passed, elevated Jest passed 207 suites/1,674 tests, and candidate validation passed 133/133. Coordinator review confirmed host-specific ownership and separate settings/history ordering.
