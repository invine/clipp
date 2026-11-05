# 04: Retire stale notification results

**What to build:** Give notification availability and action settlement one owner per workspace generation across the three production adapters, so closing or reopening the workspace cannot inherit old permission or settings feedback.

**Blocked by:** [02](02-verify-chrome-workspace-snapshots.md), [03](03-verify-capacitor-workspace-snapshots.md)

**Status:** resolved

- [x] Run the notification cases through the real adapters in Node, Chrome's extension context, and Android WebView without mounting UI. Cover applicable popup and options capabilities.
- [x] A current passive refresh can update availability while one current permission or settings action stays pending. Duplicate intent does not start another native action.
- [x] Stop completes and releases subscriptions with a native action pending. After restart, late success and late failure from the retired action leave the replacement's pending state, error, and publications untouched.
- [x] When the host reports a native change initiated by the former workspace, a current refresh can show that change. An older availability read cannot overwrite a newer one or settle a different action.
- [x] An earlier successful read leaves a newer action error visible. A new action or a successful refresh started after the failure can clear it.
- [x] Native permission and settings effects stay with the host adapters. Existing notification-driven Requests navigation retains its behavior.

## Context

The specification covers this slice in [R2](../spec.md#r2-notification-availability-and-action-lifetime) and [R7](../spec.md#r7-production-adapter-conformance-in-each-runtime). The [decision record](../decisions.md) records the approved scope and dependencies.

## Answer

Implemented and integrated as `551481c7b8e40c0b7036f4add97d30b51eb94410` on `codex/runtime-module-interfaces-integration`. Shared notification availability/action ownership is generation-scoped; Electron, Chrome, and Android production adapter harnesses cover refresh ordering, pending/duplicate actions, stop/restart, late settlements, recovery, and Requests navigation ownership.

Verification: all four TypeScript checks passed; `npm run lint` exited 0 with 1,126 existing warnings and no errors; focused adapter and Requests tests passed; Chrome MV3 popup/options harness passed; Android API 31 WebView instrumentation passed. Final integrated `npm run check` passed all 207 Jest suites/1,679 tests and all 133 candidate checks. Two-axis review against `main` found no Standards or Spec findings.
