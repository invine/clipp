# 06: Activate Clip exchange when transport is ready

**What to build:** Keep local capture available during network startup and let shared core activate Clip exchange once each production runtime supplies ready transport.

**Blocked by:** None (can start immediately).

**Status:** resolved

- [ ] Electron, Android, and Chrome use the shared exchange assembly for production startup. Verify through that assembly with controlled runtime adapters and transport.
- [ ] While transport readiness is held, local capture continues into Clipboard History and network exchange waits. Once ready, eligible live exchange and Clipboard History Reconciliation proceed through their independent protocols.
- [ ] Disabling Auto Sync gates both exchanges, and re-enabling allows fresh exchange. Share Now retains its one-Clip override and historical imports produce no system clipboard write.
- [ ] Preserve Active Member authorization, Clip Sharing Lifetime, Clip Suppression Tombstones, Android's bounded live clipboard recovery, and Chrome's background and offscreen responsibilities.

## Context

The specification covers this slice in [R4](../spec.md#r4-clip-exchange-and-transport-replacement) and [R8](../spec.md#r8-production-runtime-and-domain-verification). The [decision record](../decisions.md) records the approved scope and dependencies.

## Answer

Integrated on `codex/runtime-module-interfaces-integration` at `6ffeb6f1feebac70cc37c50c73066706581a3f68` from source `dce13acc7a31c976bbb1deebbabd9d98652f77be`. Shared exchange assembly now starts network exchange only after ready transport while local capture remains available, gates live/history exchange through Auto Sync, and retires network exchange without stopping capture. Targeted runtime suites passed 80 tests, post-merge exchange tests passed 21 tests, and all four typechecks passed. The elevated full Jest phase passed 205 suites/1,664 tests; `check:candidate` separately passed 133 tests. Coordinator review confirmed independent live and history paths and preserved local capture semantics.
