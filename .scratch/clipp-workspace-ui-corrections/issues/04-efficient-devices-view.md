# 04: Efficient Devices view

**Blocked by:** None (can start immediately).

**Source:** [Corrective specification](../spec.md) and [visual review](../review.md).

**What to build:** Users can understand their device and Trusted Devices in aligned content-sized rows, with clear status and the existing management journeys readily available.

**Visual evidence:** [Desktop before](../evidence/implementation-desktop-devices.png) and [approved mockup Devices](../../../mockups/clipp-workspace/index.html) (open Devices from navigation).

**Status:** resolved

**Acceptance:**

- [ ] The Devices view eliminates the oversized nested shell and unused right/bottom space where content does not require it, using aligned responsive rows and practical task actions in both themes.
- [ ] This device and Trusted Devices retain actual identity, accessible long names and Peer IDs, and truthful online/offline/unknown states; offline is never represented as revoked.
- [ ] Existing naming, QR, Pairing, device details, Requests, revoke confirmation and failure/recovery flows remain reachable and retain host-specific availability and existing semantics.
- [ ] Empty, dense, pending and error states, keyboard/touch access, enlarged text, narrow viewport and no horizontal overflow are covered without losing important safety information.
- [ ] Verify rendered shared UI and safe affected application UI using deterministic device-state fixtures; do not run connection or Clip-sending tests.
