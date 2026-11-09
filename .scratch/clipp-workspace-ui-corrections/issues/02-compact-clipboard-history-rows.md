# 02: Compact, readable Clipboard History rows

**Blocked by:** None (can start immediately).

**Source:** [Corrective specification](../spec.md) and [visual review](../review.md).

**What to build:** Users can scan more Clips in a full-width list, with the content leading and useful metadata and actions aligned compactly at desktop, phone and popup sizes.

**Visual evidence:** [Desktop before](../evidence/implementation-desktop-history.png), [phone before](../evidence/implementation-phone-history.png), [popup before](../evidence/implementation-popup-history.png), [approved desktop](../evidence/reference-desktop-history.png) and [phone](../evidence/reference-phone-history.png).

**Status:** resolved

**Acceptance:**

- [ ] Present a compact row hierarchy with meaningful preview, source, timestamp, type and pin state aligned without the current four-line treatment where space permits; the 130 px implementation versus 70 px reference is comparative evidence, not a rigid height that overrides content or accessibility.
- [ ] Long Clip text and identifiers remain fully inspectable in details; labels remain readable, status is not color-only, and focus and association between each Clip and its actions are clear.
- [ ] Existing copy and pin actions remain available to keyboard and touch users without relying on hover; clicking row copy does not open details or target another Clip. Empty, no-match, loading, failed and retryable states remain truthful.
- [ ] Search and filtering, scroll context, both themes, short popup sizing and enlarged/localized text work without clipped controls or page-level horizontal overflow.
- [ ] Compare populated, empty and error renders and visible behavior at the shared UI and safe affected application seams, using fixture callbacks and no connection or Clip-sending tests.
