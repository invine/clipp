# 01: Contextual workspace controls and compact navigation

**Blocked by:** None (can start immediately).

**Source:** [Corrective specification](../spec.md) and [visual review](../review.md).

**What to build:** Users see a compact top area appropriate to their current destination. History search and filters remain accessible in History without taking a separate large row above Devices, Settings or Requests. A clear route back to History and the truthful current-clipboard Send action remain available.

**Visual evidence:** [Phone Settings before](../evidence/implementation-phone-settings.png), [desktop Devices before](../evidence/implementation-desktop-devices.png), [approved phone History](../evidence/reference-phone-history.png).

**Status:** resolved

**Acceptance:**

- [ ] At wide, tablet, phone and short popup widths, the destination has a clear semantic heading and compact header; History-specific search/filter controls no longer occupy a persistent row on other destinations.
- [ ] All, Pinned, Links, search, time/source filters, available ordering, Requests, connection/status information and current-clipboard Send remain discoverable and usable where supported. Labels accurately identify Send as acting on the current system clipboard, not necessarily the selected Clip.
- [ ] Moving between destinations preserves query, filter, drafts and appropriate scroll/focus state; keyboard, native Back and menu open/close follow existing host behavior. A destination change invokes no History action.
- [ ] Empty/loading/error/recovery notices remain visible and accurately describe runtime state; both themes, 200% text, reduced motion, touch targets and no page-level horizontal overflow are covered.
- [ ] Verify observable shared UI and safe affected application UI at the existing seam; collect before/after screenshots and measurements without connection or Clip-sending tests.
