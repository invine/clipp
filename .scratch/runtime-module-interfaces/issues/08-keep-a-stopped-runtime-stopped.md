# 08: Keep a stopped runtime stopped

**What to build:** Ensure that stopping the shared runtime while startup is pending prevents a late startup result from reviving that runtime or publishing state.

**Blocked by:** None (can start immediately).

**Status:** resolved

- [ ] Hold startup through the shared runtime interface, complete stop, then release startup successfully. Observe that status stays stopped and that startup produces no publication.
- [ ] Reject a superseded startup in a separate case. Status stays stopped, and the startup error remains observable without a secondary lifecycle error.
- [ ] Ordinary startup, publication, and stop remain observable through the same interface, including shutdown subscription release.

## Context

The specification covers this slice in [R5](../spec.md#r5-device-identity-retirement) and [R8](../spec.md#r8-production-runtime-and-domain-verification). The [decision record](../decisions.md) records the approved scope and dependencies.

## Answer

Integrated on `codex/runtime-module-interfaces-integration` at `e63a0b66e543432669f3e3f5ff2fa81883d5301b` from source `c867f425af7c572bcfae2c88b6714c9352903300`. The shared runtime now fences late startup success and failure after stop. The focused runtime suite passed 12/12 and all four workspace typechecks passed. Full `npm run check` reported host-level process ownership, Android Chromium launch, and loopback failures; no ticket 08 failure was observed. Coordinator review confirmed the change matches R5 and preserves ordinary start, stop, and subscription release behavior. See the implementation run record for verification details.
