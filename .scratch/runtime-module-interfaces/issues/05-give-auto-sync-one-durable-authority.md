# 05: Give Auto Sync one durable authority

**What to build:** Make competing Auto Sync actions converge on one durable value across Electron, Android, and Chrome while callers retain their established feedback for confirmed, partial, and unconfirmed outcomes.

**Blocked by:** None (can start immediately).

**Status:** resolved

- [ ] One settings authority orders writes. Exercise Electron's dedicated toggle and generic settings write, Android's workspace toggle and notification Pause or Resume, and Chrome popup and options writes through their production runtime entry points.
- [ ] Overlapping writes converge on the durable value after reopen and agree in both settings and runtime observations. Live Clip exchange and Clipboard History Reconciliation adopt the same confirmed value.
- [ ] Test failed persistence, lost acknowledgement followed by successful read-back, and failed publication after confirmed persistence as distinct outcomes. Each caller retains its established feedback.
- [ ] With acknowledgement and read-back both unavailable, check both attempted directions. Exchange follows the last confirmed value until recovery, and the action reports uncertainty.
- [ ] Local capture, Clipboard History, the one-Clip Share Now override, and Android's native Background Continuity acknowledgement behavior remain observable.

## Context

The specification covers this slice in [R3](../spec.md#r3-auto-sync-authority-and-feedback) and [R8](../spec.md#r8-production-runtime-and-domain-verification). The [decision record](../decisions.md) records the approved scope and dependencies.

## Answer

Integrated on `codex/runtime-module-interfaces-integration` at `64e866d64670330e6c3d3112654c669c824e0e87` from source `93bb81f1528240002c98e57c7bca80b540bd68ab`. Electron's dedicated Auto Sync action now shares the serialized settings handler used by generic writes; Android preserves confirmed publication warnings in Background Continuity feedback, while Chrome popup/options continue through their one background authority. Focused Auto Sync/settings coverage passed 56 tests across four suites, all typechecks and lint passed, and the later elevated integration check passed. Coordinator review confirmed uncertainty retains the last confirmed policy and caller feedback remains distinct.
