# 07: Preserve pending Share Now across transport replacement

**What to build:** Retire old Clip exchange callbacks when transport is replaced within a Device Identity, and let an eligible pending Share Now Clip survive an ambiguous offer.

**Blocked by:** [06](06-activate-clip-exchange-when-transport-is-ready.md)

**Status:** resolved

- [ ] The exchange module owns one current transport attachment. Replace the transport during a held send and inbound callback while local capture continues.
- [ ] A callback from the retired transport cannot write to the system clipboard or settle work owned by the replacement.
- [ ] With Auto Sync off, let a receiver store a Share Now Clip before the old offer result is lost. The replacement can offer the still-eligible pending Clip with the same Clip ID, and the receiver retains one Clip.
- [ ] A confirmed offer on the current transport clears pending. Expired or locally suppressed Clips remain subject to the existing rules, and the protocol keeps its existing offer semantics without a wire acknowledgement.
- [ ] The production exchange seam demonstrates transport replacement for the runtime adapters, including the Chrome background and offscreen ownership split.

## Context

The specification covers this slice in [R4](../spec.md#r4-clip-exchange-and-transport-replacement) and [R8](../spec.md#r8-production-runtime-and-domain-verification). The [decision record](../decisions.md) records the approved scope and dependencies.

## Answer

Integrated on `codex/runtime-module-interfaces-integration` at `178a23efbe04643455654784983a5d4ed7e66a2f` from source `dcdc7608bf792f641d052ab3c9aefb7fe470b5c7`. Live callbacks and Share Now settlement are tied to their current exchange attachment. Retired inbound work cannot write to the clipboard; failed or retired sends keep the pending record until a confirmed offer on a current transport, preserving the Clip ID. Core and Chrome background/offscreen tests passed 30/30; all typechecks passed; elevated full verification passed 206 suites/1,668 tests and 133/133 candidate tests. Coordinator review confirmed same-ID retry and existing protocol semantics.
