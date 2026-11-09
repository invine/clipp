# Proposed Clipp workspace visual-correction tickets

**Draft for review — not published as claimable tickets.** The [corrective specification](spec.md) and [visual review](review.md) remain authoritative. The implementation screenshots are controlled fixture renders, not native application evidence. The [approved interactive mockup](../../mockups/clipp-workspace/index.html) is the visual reference; its sample data and placeholder actions are not product requirements.

All slices preserve real runtime capabilities, the existing shared UI and host action boundary, truthful status and action results, security and recovery, and dark, light and System appearance. Use the existing shared UI and safe application UI test seams with isolated fixtures. **Do not run connection tests or tests that send Clips.** Do not access the real system clipboard or launch a real profile/network unless a safe existing boundary proves it cannot connect or send. Compare at representative wide, tablet, phone and short-popup sizes with enlarged text, keyboard access and reduced motion. Existing project coordination and the two-active-implementer limit apply; independent tickets can still touch shared files, so coordinate claims and integration rather than creating artificial dependency edges.

## 01 — Contextual workspace controls and compact navigation

**Blocked by:** None (can start immediately).

**Delivers:** Users see a compact top area appropriate to their current destination. History search and filters remain accessible in History without taking a separate large row above Devices, Settings or Requests. A clear route back to History and the truthful current-clipboard Send action remain available.

**Visual evidence:** [Phone Settings before](evidence/implementation-phone-settings.png), [desktop Devices before](evidence/implementation-desktop-devices.png), [approved phone History](evidence/reference-phone-history.png).

**Acceptance:**

- [ ] At wide, tablet, phone and short popup widths, the destination has a clear semantic heading and compact header; History-specific search/filter controls no longer occupy a persistent row on other destinations.
- [ ] All, Pinned, Links, search, time/source filters, available ordering, Requests, connection/status information and current-clipboard Send remain discoverable and usable where supported. Labels accurately identify Send as acting on the current system clipboard, not necessarily the selected Clip.
- [ ] Moving between destinations preserves query, filter, drafts and appropriate scroll/focus state; keyboard, native Back and menu open/close follow existing host behavior. A destination change invokes no History action.
- [ ] Empty/loading/error/recovery notices remain visible and accurately describe runtime state; both themes, 200% text, reduced motion, touch targets and no page-level horizontal overflow are covered.
- [ ] Verify observable shared UI and safe affected application UI at the existing seam; collect before/after screenshots and measurements without connection or Clip-sending tests.

## 02 — Compact, readable Clipboard History rows

**Blocked by:** None (can start immediately).

**Delivers:** Users can scan more Clips in a full-width list, with the content leading and useful metadata and actions aligned compactly at desktop, phone and popup sizes.

**Visual evidence:** [Desktop before](evidence/implementation-desktop-history.png), [phone before](evidence/implementation-phone-history.png), [popup before](evidence/implementation-popup-history.png), [approved desktop](evidence/reference-desktop-history.png) and [phone](evidence/reference-phone-history.png).

**Acceptance:**

- [ ] Present a compact row hierarchy with meaningful preview, source, timestamp, type and pin state aligned without the current four-line treatment where space permits; the 130 px implementation versus 70 px reference is comparative evidence, not a rigid height that overrides content or accessibility.
- [ ] Long Clip text and identifiers remain fully inspectable in details; labels remain readable, status is not color-only, and focus and association between each Clip and its actions are clear.
- [ ] Existing copy and pin actions remain available to keyboard and touch users without relying on hover; clicking row copy does not open details or target another Clip. Empty, no-match, loading, failed and retryable states remain truthful.
- [ ] Search and filtering, scroll context, both themes, short popup sizing and enlarged/localized text work without clipped controls or page-level horizontal overflow.
- [ ] Compare populated, empty and error renders and visible behavior at the shared UI and safe affected application seams, using fixture callbacks and no connection or Clip-sending tests.

## 03 — Content-first Clip details

**Blocked by:** None (can start immediately).

**Delivers:** Opening a Clip shows its content and supported actions first in a compact accessible dialog, while technical identifiers and all safety/feedback information remain available.

**Visual evidence:** [Desktop details before](evidence/implementation-desktop-details.png), [phone details before](evidence/implementation-phone-details.png), [approved mockup](../../mockups/clipp-workspace/index.html).

**Acceptance:**

- [ ] The Clip's content and meaningful type/identity lead the dialog, with a prominent labeled Copy action and clear supported pin/delete controls. Source, captured time, Peer ID and Clip ID remain accessible in a secondary section or disclosure.
- [ ] Existing current-system-clipboard Send semantics are explained accurately; the dialog never implies it sends the selected Clip. Preserve action pending, error, retry, delete and other feedback states without faking success.
- [ ] Long text and identifiers remain readable and scrollable; wide, phone and short-popup layouts show reachable actions without excess empty modal space, clipping or unsafe truncation.
- [ ] Keyboard focus is contained and restored on Close/Escape, state and selection context are preserved, focus indicators and accessible names remain clear, and dark/light and enlarged-text layouts work.
- [ ] Test UI behavior via existing fixture-backed shared UI and safe affected applications; do not access a real clipboard, connect devices or send Clips.

## 04 — Efficient Devices view

**Blocked by:** None (can start immediately).

**Delivers:** Users can understand their device and Trusted Devices in aligned content-sized rows, with clear status and the existing management journeys readily available.

**Visual evidence:** [Desktop before](evidence/implementation-desktop-devices.png) and [approved mockup Devices](../../mockups/clipp-workspace/index.html) (open Devices from navigation).

**Acceptance:**

- [ ] The Devices view eliminates the oversized nested shell and unused right/bottom space where content does not require it, using aligned responsive rows and practical task actions in both themes.
- [ ] This device and Trusted Devices retain actual identity, accessible long names and Peer IDs, and truthful online/offline/unknown states; offline is never represented as revoked.
- [ ] Existing naming, QR, Pairing, device details, Requests, revoke confirmation and failure/recovery flows remain reachable and retain host-specific availability and existing semantics.
- [ ] Empty, dense, pending and error states, keyboard/touch access, enlarged text, narrow viewport and no horizontal overflow are covered without losing important safety information.
- [ ] Verify rendered shared UI and safe affected application UI using deterministic device-state fixtures; do not run connection or Clip-sending tests.

## 05 — Compact Settings groups and controls

**Blocked by:** None (can start immediately).

**Delivers:** Users can find and operate actual Settings in an aligned desktop layout and compact stacked phone layout without navigating oversized nested groups.

**Visual evidence:** [Desktop Settings before](evidence/implementation-desktop-settings.png), [phone Settings before](evidence/implementation-phone-settings.png), [approved mockup Settings](../../mockups/clipp-workspace/index.html) (open Settings from navigation).

**Acceptance:**

- [ ] Use clear category navigation, content-sized groups and aligned labels/actions on desktop; stack and scroll naturally on phone and short popup, avoiding unnecessary full-width selects and nested bordered panels.
- [ ] Preserve System/Light/Dark appearance, Auto Sync, notifications, retention, Clip Sharing Lifetime, managed relays, identity, diagnostics, continuity and available host-specific controls. The mockup's sample limit is not introduced as policy.
- [ ] Preserve applied, pending, partial, unavailable and recovery feedback; safety explanations, disabled states and destructive confirmations remain clear and accessible. Disabling Auto Sync does not erase History or stop local capture.
- [ ] Validate both themes, keyboard/touch focus, 200% text, long text and no horizontal overflow; actual runtime state remains authoritative.
- [ ] Exercise observable shared UI and safe affected applications with fixtures and no connection or Clip-sending tests.

## 06 — Integrated visual and application verification

**Blocked by:** 01 — Contextual workspace controls and compact navigation; 02 — Compact, readable Clipboard History rows; 03 — Content-first Clip details; 04 — Efficient Devices view; 05 — Compact Settings groups and controls.

**Delivers:** Users and maintainers can assess the integrated implementation against the approved mockup, with accurate evidence of which application and accessibility states were verified.

**Visual evidence:** [Review findings and measurements](review.md), [approved mockup](../../mockups/clipp-workspace/index.html), and the retained before screenshots linked above.

**Acceptance:**

- [ ] Capture and visually inspect comparable before/after renders at 1400×900, 768×1024, 390×844, 340×600 and applicable short/narrow extremes, in dark and light themes, for History, Clip details, Devices, Settings, Requests and relevant host-specific states.
- [ ] Cover populated, empty, no-match, expanded filters, long content, error/recovery and reduced-motion/enlarged-text cases; check density, header space, semantic headings, contrast, visible focus, accessibility names and action visibility.
- [ ] Resolve observed mismatches against the approved reference or document a concrete product/accessibility reason; investigate the inspector's shadow warning on actual visible elements rather than treating source-lint flags as proof of visible defects.
- [ ] Run appropriate shared UI checks and safe application-level checks for Electron, Android and Chrome. Record revision, build, host, screenshots and native versus simulated evidence; explicitly report unavailable native or real-popup coverage and existing baseline failures.
- [ ] Honor the user test boundary: no connection tests, tests that send Clips, forced transfers or unsafe real clipboard/profile access; use controlled fixtures and do not claim live connectivity verification.

## Dependency rationale

Tickets 01–05 deliver independent, reviewable improvements to existing end-to-end UI paths. None requires another to work correctly; a shared implementation file or the coordinator's concurrency limit is a coordination concern rather than a genuine functional blocker. Ticket 06 requires all five so its integrated comparison tests the complete result. Before any implementation, inspect the current canonical feature checkout and follow repository coordination and baseline rules; this proposal does not select an implementation branch or authorize deployment.
