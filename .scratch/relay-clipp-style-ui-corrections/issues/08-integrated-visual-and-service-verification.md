# 08 — Integrated visual and service verification

Status: resolved
Owner: coordinator


Blocked by: 01, 02, 03, 04, 05, 06, 07

**Delivers:** The integrated portal is assessed against the reference and its existing behavior using actual built-service evidence, with limitations recorded accurately.

**Visual evidence:** [Review findings and measurements](review.md), [interactive mockup](../../mockups/clipp-relay/index.html), and the before/after reference captures linked above.

**Acceptance:**

- [ ] Capture and visually review the built service at 1440×900, 768×1024, 390×844 and 320 px in both themes, with enlarged text and reduced motion, using deterministic local account/admin fixtures.
- [ ] Cover signed-out, active/restricted/Recovery Review Hold, zero/overrun/missing usage, complete 13-week history, setup, security, account list/detail, plan, consent and relevant conflict/error/recovery states.
- [ ] Verify computed contrast and element visibility/bounds for theme, logout, menu and dialog controls; include clipping ancestors, keyboard/focus, Escape, no-script paths, accessible names, copy success/refusal via fixture and long emails/IDs.
- [ ] Exercise the existing production HTTP and built-service browser seams against disposable migrated PostgreSQL and local identity-provider fixtures where available; record source revision, environment, results and every unavailable/excluded case, and do not claim template-only evidence as a service pass.
- [ ] Apply the app-screen inspector to the built service as a diagnostic, allowing the user-approved purple brand, and resolve actual contrast and clipping problems while documenting defensible remaining warnings. Investigate the prior unlocalized light-theme complaint without claiming resolution absent evidence.
- [ ] Run applicable focused/routine Relay verification only within the user's test boundary: no connection tests, tests that send Clips, forced transfers, live identity-provider journeys, real accounts or real clipboard access. Do not claim live connectivity, publication or deployment acceptance.

## Answer

Integrated at relay HEAD `b3c66d6b4022daf04541f4cdc23ae9b1ecd7d151` on `codex/relay-clipp-style-ui-corrections-integration`, based on user-selected source `020f47da263d0765bae42b7505c760d8caac1a35`. The same existing relay worktree was reused. `bash scripts/verify.sh routine` passed; the built-service browser acceptance passed against production handlers/assets, disposable PostgreSQL 18, synthetic users and a local identity-provider double. It exercised owner/admin/security/plans/consent/setup/recovery, no-script and keyboard behavior, 1440/768/390/320 px, enlarged text, reduced motion, both themes, and both logout variants. The inspector had no FAIL findings after allowing only the approved purple palette. The consent whitespace warning is documented; the inspector’s isolated admin URLs lacked fixture auth and were not treated as admin evidence. Standards and Spec reviews found no material remaining gap. The unresolved unidentified light-theme report and the absence of disabled controls in fixtures are recorded honestly in `../run.md`. No real accounts, provider journeys, clipboard, connections, Clips, push, publication or deployment were used.

## Dependency rationale

Tickets 01–07 are complete user-facing slices through existing portal routes and are independently implementable; a shared stylesheet/template or coordinator concurrency limit is an integration concern, not a genuine functional blocker. Coordinate claims and merge shared edits carefully. Ticket 08 is blocked by all seven because it verifies the integrated result. This proposal does not select an implementation branch, authorize real account actions, or change the parent specification.
