# 06: Integrated visual and application verification

**Blocked by:** 01 — Contextual workspace controls and compact navigation; 02 — Compact, readable Clipboard History rows; 03 — Content-first Clip details; 04 — Efficient Devices view; 05 — Compact Settings groups and controls.

**Source:** [Corrective specification](../spec.md) and [visual review](../review.md).

**What to build:** Users and maintainers can assess the integrated implementation against the approved mockup, with accurate evidence of which application and accessibility states were verified.

**Visual evidence:** [Review findings and measurements](../review.md), [approved mockup](../../../mockups/clipp-workspace/index.html), and the retained before screenshots linked above.

**Status:** resolved

**Acceptance:**

- [ ] Capture and visually inspect comparable before/after renders at 1400×900, 768×1024, 390×844, 340×600 and applicable short/narrow extremes, in dark and light themes, for History, Clip details, Devices, Settings, Requests and relevant host-specific states.
- [ ] Cover populated, empty, no-match, expanded filters, long content, error/recovery and reduced-motion/enlarged-text cases; check density, header space, semantic headings, contrast, visible focus, accessibility names and action visibility.
- [ ] Resolve observed mismatches against the approved reference or document a concrete product/accessibility reason; investigate the inspector's shadow warning on actual visible elements rather than treating source-lint flags as proof of visible defects.
- [ ] Run appropriate shared UI checks and safe application-level checks for Electron, Android and Chrome. Record revision, build, host, screenshots and native versus simulated evidence; explicitly report unavailable native or real-popup coverage and existing baseline failures.
- [ ] Honor the user test boundary: no connection tests, tests that send Clips, forced transfers or unsafe real clipboard/profile access; use controlled fixtures and do not claim live connectivity verification.
