# 01: Responsive workspace and Clipboard History

**What to build:** Deliver the approved Clipp workspace for browsing and reusing real Clipboard History. Give history the available width, use recognizable icons and the approved dark and light presentation, and provide labeled desktop navigation and compact narrow navigation across supported applications.

**Blocked by:** None (can start immediately).

**Status:** claimed
Assignee: workspace-01
Claim: clipp-approved-workspace-01
Branch: `codex/clipp-workspace-01-history`
Baseline: `e172e004132e40626b874bbfcc22c51e14ad2659`

- [x] Reconcile the proposed wide navigation with the earlier accepted UX contract and coordinate with that effort's canonical integration checkout before changing conflicting behavior; D2/D3 record the user's explicit 2026-11-02 approval of compact navigation and dialog details. Current `main` (`e172e004`) includes the UX recovery adoption; the separate dirty UX integration checkout is left untouched.
- [ ] The shared workspace presents the approved design in dark and light themes and preserves the existing system appearance preference, destinations and host-specific tasks.
- [ ] Recent Clips use authoritative state and show useful previews, type, time and source when available; long content remains inspectable and loading, empty, unavailable and error states are truthful.
- [ ] Search, supported filters and ordering, and direct row copy work with existing runtime capabilities; copy feedback reflects the result and row copy does not open details.
- [ ] Desktop, tablet, phone and extension-popup layouts remain usable without page-level horizontal overflow; narrow navigation conserves space and remains keyboard and touch accessible.
- [ ] Accessible names, selected states, contrast, focus and reduced-motion behavior are preserved; test observable shared UI behavior with fixtures and affected application UI without connection tests or tests that send Clips.
- [ ] Existing Clip details and other user actions remain available while subsequent tickets are outstanding.
