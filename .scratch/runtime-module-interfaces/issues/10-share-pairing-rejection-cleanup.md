# 10: Share Pairing rejection cleanup

**What to build:** Use the same rejection cleanup decision in outgoing and pending Pairing on all three runtimes, so eligible disconnects are authorized by current membership and transport ownership.

**Blocked by:** None (can start immediately).

**Status:** resolved

- [ ] Exercise outgoing and pending Pairing through the production runtime seams. Reject a confirmed non-Active Member on the current transport and observe disconnect. Reject an Active Member and observe that its connection survives.
- [ ] At the application rejection seam, missing authenticated peer identity, a failed Membership View lookup, or a retired transport results in no peer disconnect request. Admission while lookup is pending protects the peer when the current result identifies an Active Member.
- [ ] Disconnect failure is contained. Overlapping eligible disconnect requests for the same peer and transport coalesce.
- [ ] Exhaust the diagnostic allowance and verify that eligible disconnect still runs. The logging allowance controls diagnostics independently of cleanup.
- [ ] Preserve low-level malformed-frame rejection, stateless signed Trust Requests, Signed Peer Record semantics, and separate Membership Reconciliation.

## Context

The specification covers this slice in [R6](../spec.md#r6-pairing-rejection-policy) and [R8](../spec.md#r8-production-runtime-and-domain-verification). The [decision record](../decisions.md) records the approved scope and dependencies.

## Answer

Integrated on `codex/runtime-module-interfaces-integration` at `22f4c0ef3c9dd32f5df4635a88237a1c2d60f5ba`. Shared Pairing rejection cleanup now carries the exact transport owner through outgoing and pending paths, checks that owner both before and after the Membership View read, and coalesces by peer plus owner. Electron and Android pass their captured transport objects; Chrome carries a separate offscreen transport generation through protocol messages and disconnect requests. Focused Pairing/runtime tests passed 51/51, all four typechecks and scoped lint passed, and coordinator review confirmed Active/unknown peers and retired owners are not disconnected. Final integration check remains scheduled.
