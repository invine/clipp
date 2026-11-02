# 05: Cross-application design verification

**What to build:** Verify the integrated approved workspace across Clipp applications and representative layouts, with clear evidence of what was exercised and any remaining limitations.

**Blocked by:** 02 — Clip details dialog; 03 — Devices view; 04 — Settings view.

**Status:** ready-for-agent

- [ ] Exercise the integrated shared UI and the Electron, extension and Android applications for the affected navigation, Clip details, device and settings interactions, using the established relevant application acceptance procedures.
- [ ] Compare real rendered views with the approved reference at representative desktop, tablet, phone and extension-popup sizes in both themes, including empty, error, keyboard, accessible-name and focus states.
- [ ] Use controlled fixtures for connection and sharing presentation; do not run connection tests or tests that send Clips.
- [ ] Run applicable verification within the agreed test boundary, record the revision, environment and results, and identify unavailable or unexecuted application checks without treating them as passes.
- [ ] Resolve or explicitly report design regressions and coordination conflicts with the existing UX effort; do not claim native or release acceptance from a browser mockup alone.
