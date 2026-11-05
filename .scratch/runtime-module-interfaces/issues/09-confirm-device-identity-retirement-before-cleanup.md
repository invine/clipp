# 09: Confirm Device Identity retirement before cleanup

**What to build:** Make an accepted Device Identity reset wait for confirmed retirement before destructive cleanup, even when startup finishes late or a first stop fails.

**Blocked by:** [08](08-keep-a-stopped-runtime-stopped.md)

**Status:** resolved

- [ ] Shared lifecycle code owns stop, drain, and final stop. Host adapters retain native admission, offscreen shutdown, durable commits, and host-specific cleanup.
- [ ] Hold admitted startup past the first stop. Confirm the late owner closes before destructive cleanup and the superseded runtime cannot publish or revive.
- [ ] Exercise a failed first stop with successful final confirmation, and an unconfirmed final stop. The latter keeps admission fenced, retains the reset phase, and leaves identity-bound data intact until confirmation.
- [ ] Concurrent retries for the same accepted reset join one retirement attempt. A later retry after an unconfirmed attempt settles can resume from the recorded phase.
- [ ] Use production retirement seams to exercise Android's lost native acknowledgement and Chrome's in-flight offscreen startup. Preserve the existing Identity Rotation, Device Revocation, Identity Loss, and durable storage semantics.

## Context

The specification covers this slice in [R5](../spec.md#r5-device-identity-retirement) and [R8](../spec.md#r8-production-runtime-and-domain-verification). The [decision record](../decisions.md) records the approved scope and dependencies.

## Answer

Integrated on `codex/runtime-module-interfaces-integration` at `90e907862180e4a33ac3279478b702f526384cc4` from source `dd31a1478001c2e78b296803661c546da43c9bca`. Shared retirement now attempts stop, drains fenced work, and confirms a final stop before identity cleanup. Android, Electron, and Chrome preserve host-owned cleanup and leave an uncertain reset fenced. Focused retirement coverage passed 50/50 across five suites; all four typechecks and lint passed. Full `npm run check` had 7 host-sensitive failed suites/23 tests and 197 passing suites/1,636 tests, with no ticket 09 failure. Coordinator review confirmed cleanup remains behind confirmed retirement and accepted reset/storage semantics remain intact.
