# 03: Content-first Clip details

**Blocked by:** None (can start immediately).

**Source:** [Corrective specification](../spec.md) and [visual review](../review.md).

**What to build:** Opening a Clip shows its content and supported actions first in a compact accessible dialog, while technical identifiers and all safety/feedback information remain available.

**Visual evidence:** [Desktop details before](../evidence/implementation-desktop-details.png), [phone details before](../evidence/implementation-phone-details.png), [approved mockup](../../../mockups/clipp-workspace/index.html).

**Status:** resolved

**Acceptance:**

- [ ] The Clip's content and meaningful type/identity lead the dialog, with a prominent labeled Copy action and clear supported pin/delete controls. Source, captured time, Peer ID and Clip ID remain accessible in a secondary section or disclosure.
- [ ] Existing current-system-clipboard Send semantics are explained accurately; the dialog never implies it sends the selected Clip. Preserve action pending, error, retry, delete and other feedback states without faking success.
- [ ] Long text and identifiers remain readable and scrollable; wide, phone and short-popup layouts show reachable actions without excess empty modal space, clipping or unsafe truncation.
- [ ] Keyboard focus is contained and restored on Close/Escape, state and selection context are preserved, focus indicators and accessible names remain clear, and dark/light and enlarged-text layouts work.
- [ ] Test UI behavior via existing fixture-backed shared UI and safe affected applications; do not access a real clipboard, connect devices or send Clips.
