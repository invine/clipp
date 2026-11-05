# 01: Stabilize Electron workspace snapshots

**What to build:** Make the production Electron adapter publish stable, coherent workspace observations through an explicit adapter interface. Establish reusable conformance cases and exercise them through the real adapter in Node with controlled preload and host inputs.

**Blocked by:** None (external prerequisite below).

**Status:** resolved

**External prerequisite:** The UI behavior effort's production adapters and shared workspace must reach local `main`. The prerequisite source is `codex/ui-behavior-integration` at `2957bfa30be2ce809f87be9f61393cae43a3826f`. It was absent from local `main` at ticket publication. Recheck the required source and update this integration branch from `main` before dispatch.

- [ ] The adapter module explicitly defines observations, actions, and capabilities. The workspace consumes that interface, and existing runtime callers retain compatible behavior.
- [ ] Repeated reads between publications return the same snapshot reference. Subscribers read the new snapshot during publication, and retained snapshots keep their previous observation values.
- [ ] The shared publication module owns the snapshot. Runtime, settings, and Clipboard History retain their own ordering and authority, and a delayed read cannot overwrite an accepted newer publication.
- [ ] The real Electron adapter starts and stops in Node without a workspace or React mount. Controlled preload and host inputs demonstrate bridge translation, capability behavior, listener disposal, and rejection of retired observation callbacks.
- [ ] Reusable conformance cases drive public reads, subscriptions, actions, start, and stop. They can run in Chrome and Android WebView through host-specific fixtures.

## Context

The specification covers this slice in [R1](../spec.md#r1-adapter-interface-and-snapshot-publication) and [R7](../spec.md#r7-production-adapter-conformance-in-each-runtime). The [decision record](../decisions.md) records the approved scope and dependencies.

## Answer

Integrated on `codex/runtime-module-interfaces-integration` at `02ebb1d5f04af93a6f958c4f2e1760c5379aa7e6`. Source commits are `e66e8804dc00434a9df739fd0c9d201f03e4cc48` and conformance follow-up `ec3bf1dbfb9e2fc3c0ed4d88bc0c71e85f82145f`. The shared adapter contract now exposes stable observations, actions, and capabilities; the store clones retained plain observation values and publishes before notifying subscribers. The reusable host case covers start, stable reads, a public action, publication order, stop, and ignored retired observations. Focused Electron adapter tests pass 5/5 and all four typechecks pass. Coordinator review confirmed the requested R1 interface and Electron Node seam; the full check on the integrated code before the test-only follow-up passed.
