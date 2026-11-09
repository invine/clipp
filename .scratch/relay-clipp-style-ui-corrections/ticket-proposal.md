# Proposed Clipp Relay UI correction tickets

**Draft for review — not published as claimable tickets.** The [corrective specification](spec.md) and [visual review](review.md) define scope. Screenshots here are synthetic renders of the reviewed server templates and assets, not built-service, handler, or live-acceptance evidence. The [interactive Relay mockup](../../mockups/clipp-relay/index.html) is the visual reference; its sample values and preview actions are not product behavior.

Relay owns implementation, Clipp owns the canonical tracker. Before implementation, preserve the mockup/evidence, inspect the selected repository and current integration state, and follow project operations to establish this spec's own integration lineage. Keep the Go server-rendered stack, real authenticated handlers and prior portal security, quota and no-script contracts.

All tickets use the existing production portal HTTP boundary and built-service browser fixture with synthetic data, deterministic local identity provider and disposable migrated PostgreSQL when available. Report unavailable prerequisites rather than treating template-only screenshots as a service pass. **Do not run connection tests, tests that send Clips, forced transfers, live identity-provider journeys or real account mutations.** Avoid real credentials and clipboard access. Cover dark and light themes, narrow/desktop viewports, enlarged text, keyboard and reduced motion as relevant. Coordinate overlapping shared templates/CSS using project concurrency limits; a shared file alone does not create a functional blocker.

## 01 — Readable theme, logout and dialog controls

**Blocked by:** None (can start immediately).

**Delivers:** Relay users can read and operate theme, logout and dialog-close controls in both themes, including keyboard/focus and ordinary interaction states.

**Visual evidence:** [Dark desktop account before](evidence/implementation-desktop-account-dark.png), [dark Connect Clipp dialog before](evidence/implementation-desktop-connect-dark.png), [dark phone dialog before](evidence/implementation-phone-connect-dark.png), and [approved mockup](../../mockups/clipp-relay/index.html).

**Acceptance:**

- [ ] Fix the observed near-invisible dark text on Light theme, sidebar/menu Log out and Connect Clipp Close; scope foregrounds to their real control fills so readable light-on-dark and dark-on-purple combinations are maintained.
- [ ] Across owner, admin and standalone pages, relevant controls meet WCAG AA text contrast and meaningful control-boundary requirements in default, hover, focus and disabled states where applicable; keyboard focus is visible.
- [ ] Investigate the user's prior light-theme unreadable-text report across signed-out, authenticated, admin, consent, error and interaction states. Record the affected case and resolution if reproduced; otherwise document the unlocated report and actual coverage without claiming it is fixed.
- [ ] Theme choice, persistence/fallback when storage or JavaScript is unavailable, navigation/logout and dialog close/focus behavior remain functional and retain existing authorization and no-script behavior.
- [ ] Verify computed contrast and observable behavior through the established HTTP and built-service browser seams using isolated fixtures; explicitly record exclusions and unavailable prerequisites.

## 02 — Compact, unclipped navigation and Clipp identity

**Blocked by:** None (can start immediately).

**Delivers:** The portal uses the approved Clipp identity and a responsive workspace header whose brand, destination, theme and menu controls stay visible and operable.

**Visual evidence:** [Phone account before](evidence/implementation-phone-account-dark.png), [phone account reviews before](evidence/implementation-phone-accounts-dark.png), [reference phone overview](evidence/reference-phone-account-dark.jpg), [reference desktop overview](evidence/reference-desktop-account-dark.jpg).

**Acceptance:**

- [ ] Replace the portal's abstract overlapping-squares mark with the approved Clipp C mark or equivalent approved portal asset, using existing embedded asset delivery and CSP; do not alter installed client icons.
- [ ] Recompose the shell around the reference's neutral surfaces, restrained purple accents, consistent icon language and aligned gutters in both themes without deleting real content or navigation.
- [ ] At 320–390 px and larger text/long labels, brand, destination, theme and complete Menu control remain within visible clipping bounds and are operable. Test actual element rectangles and clipping ancestors, not merely document scroll width.
- [ ] Desktop navigation and accessible narrow menu retain current-view indication, administrator authorization visibility, logout, keyboard open/close, Escape/focus restoration and no-script path.
- [ ] Check the served portal at desktop/tablet/phone sizes with reduced motion and keyboard/touch interaction; do not test real Relay connections or send Clips.

## 03 — Compact, truthful account overview

**Blocked by:** None (can start immediately).

**Delivers:** An owner sees the weekly allowance, recorded usage and separate Relay Session/Login Grant capacity in a compact layout that brings useful history higher on the screen.

**Visual evidence:** [Desktop account before](evidence/implementation-desktop-account-dark.png), [phone account before](evidence/implementation-phone-account-dark.png), [reference desktop](evidence/reference-desktop-account-dark.jpg), [reference phone](evidence/reference-phone-account-dark.jpg).

**Acceptance:**

- [ ] Give remaining allowance the strongest hierarchy, place recorded usage and effective limit together, make the UTC window/reset clear and use content-sized, aligned quota/capacity areas instead of stretched cards and redundant limit displays.
- [ ] Keep Recorded Relay Usage and Charged Relay Traffic explanations available without implying exact Clip payload traffic; retain a correctly proportional indicator and make Connect Clipp reachable.
- [ ] Use authoritative data for overrun (full recorded value and nonnegative remaining), zero allowance, known zero versus unavailable observations, independently sampled Relay Sessions and Login Grants, and Pending/Suspended/Denied/Recovery Review Hold states.
- [ ] Do not infer Device Network membership, device status or connection health from grants or Relay Sessions. Preserve read-only refresh, essential content and actions without JavaScript.
- [ ] Compare built-service renders to the reference in both themes across desktop and phone, including zero, overrun, unavailable and restricted fixtures; verify through the existing portal HTTP boundary and do not run connection or Clip-sending tests.

## 04 — Legible weekly usage history at narrow widths

**Blocked by:** None (can start immediately).

**Delivers:** Owners can read recent and retained Recorded Relay Usage at desktop and phone sizes, with the current week visible and exact values accessible.

**Visual evidence:** [Phone account/history before](evidence/implementation-phone-account-dark.png), [reference phone overview](evidence/reference-phone-account-dark.jpg), [desktop overview before](evidence/implementation-desktop-account-dark.png).

**Acceptance:**

- [ ] Present the latest four weeks by default and the full current week plus twelve retained preceding weeks on request, in chronological order, with the current week explicitly incomplete.
- [ ] On narrow screens, use a readable compact chart or stacked/list representation plus an accessible exact-value table or equivalent; avoid breaking headings, dates, totals or “incomplete” inside words and avoid page-level horizontal scrolling.
- [ ] Preserve complete UTC dates, exact byte totals, independent missing versus recorded-zero states, absolute history and current-week visibility regardless of later allowance changes; do not fabricate points to improve density.
- [ ] Screen-reader, keyboard, enlarged-text, both-theme and no-script access retain all real values and range controls.
- [ ] Exercise the existing HTTP and built-service browser seams with deterministic history fixtures, including zero, missing, overrun and thirteen-week cases; do not run connection or Clip-sending tests.

## 05 — Full-width account reviews and contextual details

**Blocked by:** None (can start immediately).

**Delivers:** Administrators can scan the account list without a permanently empty half-width editor and open the complete review task on demand while preserving list context.

**Visual evidence:** [Desktop accounts before](evidence/implementation-desktop-accounts-dark.png), [desktop selected review before](evidence/implementation-desktop-review-dark.png), [phone accounts before](evidence/implementation-phone-accounts-dark.png), [reference accounts](evidence/reference-desktop-accounts-dark.png).

**Acceptance:**

- [ ] When no account is selected, the list uses the available width so email identity, status, plan and Review action are scannable. On selection, use an accessible contextual dialog, focused detail or equivalent; maintain a safe no-script path and return/focus/list context.
- [ ] Retain bounded literal case-insensitive server-side search before paging, all canonical statuses including Denied, scoped pending counts, stable paging, long email readability and accurate archived/off-page plan lookup.
- [ ] Preserve complete review facts, effective quota and zero-versus-cleared overrides, Recovery Review Hold and state-appropriate approval, suspend, reactivate, deny, revoke, reassign and recovery actions.
- [ ] Preserve authorization/allowlist, reason, revision, Origin/CSRF, validation, stale-conflict and uncertain-result handling; no dialog, synthetic data or toast substitutes for confirmed server state.
- [ ] Exercise account list and review using production HTTP and built-service browser fixtures at desktop and phone, keyboard and no-script paths; do not run connection or Clip-sending tests.

## 06 — Compact Quota Plans and owner security tasks

**Blocked by:** None (can start immediately).

**Delivers:** Administrators and owners can scan plan and security options in compact, aligned layouts while reviewing consequential operations before confirmation.

**Visual evidence:** [Phone plans before](evidence/implementation-phone-plans-dark.png), [reference desktop plans](evidence/reference-desktop-plans-dark.png), [desktop security before](evidence/implementation-desktop-security-dark.png), [reference security](evidence/reference-desktop-security-dark.png).

**Acceptance:**

- [ ] Present plan values and account-security choices in content-sized aligned rows or contextual task surfaces, reducing repeated labels and expanded confirmations without hiding actual plan values or task destinations.
- [ ] Preserve plan creation validation, immutable assigned allowances, archive consequences, explicit confirmation, reasons, revisions, operation identity and ambiguous-result recovery; existing assignments survive archival.
- [ ] Distinguish Portal Session logout, Account-wide Revocation and Relay Account Deletion with their existing effects, fresh-authentication, explicit review/confirmation, journal, retained-quota and safe recovery behavior.
- [ ] Both themes, phone and desktop layout, keyboard/focus, touch targets, long content, enlarged text and safe no-script forms remain usable; no success is asserted before confirmation.
- [ ] Exercise existing portal HTTP and built-service browser tests with disposable fixtures, excluding connection tests and tests that send Clips.

## 07 — Connect Clipp, consent and service-state presentation

**Blocked by:** None (can start immediately).

**Delivers:** Setup, sign-in, consent and recovery tasks use the approved visual hierarchy and remain complete, readable and safe across responsive and no-script states.

**Visual evidence:** [Desktop Connect Clipp before](evidence/implementation-desktop-connect-dark.png), [phone Connect Clipp before](evidence/implementation-phone-connect-dark.png), [approved mockup](../../mockups/clipp-relay/index.html).

**Acceptance:**

- [ ] Connect Clipp retains the canonical selectable discovery endpoint, supported client setup, truthful copy success/refusal feedback and the Portal Session versus Login Grant explanation. Opening setup performs no connection or authorization.
- [ ] Dialog and no-script setup paths fit desktop, phone and enlarged text, expose named keyboard/focus/close controls and preserve existing safe destinations and fallback behavior.
- [ ] Sign-in, consent, restriction, conflict, rate-limit, service-failure, deletion and recovery states use consistent styling while retaining authoritative content, status codes, retry hints and permitted recovery actions.
- [ ] Consent shows the trusted account and registered client and preserves authorize/cancel behavior, validated callback, PKCE, one-use continuation, Origin/CSRF, expiry and credential-generation safeguards.
- [ ] Exercise production portal HTTP and built-service browser fixtures with isolated clipboard stubs and no-script/keyboard cases; do not connect, send Clips, use live identity providers or mutate real accounts.

## 08 — Integrated visual and service verification

**Blocked by:** 01 — Readable theme, logout and dialog controls; 02 — Compact, unclipped navigation and Clipp identity; 03 — Compact, truthful account overview; 04 — Legible weekly usage history at narrow widths; 05 — Full-width account reviews and contextual details; 06 — Compact Quota Plans and owner security tasks; 07 — Connect Clipp, consent and service-state presentation.

**Delivers:** The integrated portal is assessed against the reference and its existing behavior using actual built-service evidence, with limitations recorded accurately.

**Visual evidence:** [Review findings and measurements](review.md), [interactive mockup](../../mockups/clipp-relay/index.html), and the before/after reference captures linked above.

**Acceptance:**

- [ ] Capture and visually review the built service at 1440×900, 768×1024, 390×844 and 320 px in both themes, with enlarged text and reduced motion, using deterministic local account/admin fixtures.
- [ ] Cover signed-out, active/restricted/Recovery Review Hold, zero/overrun/missing usage, complete 13-week history, setup, security, account list/detail, plan, consent and relevant conflict/error/recovery states.
- [ ] Verify computed contrast and element visibility/bounds for theme, logout, menu and dialog controls; include clipping ancestors, keyboard/focus, Escape, no-script paths, accessible names, copy success/refusal via fixture and long emails/IDs.
- [ ] Exercise the existing production HTTP and built-service browser seams against disposable migrated PostgreSQL and local identity-provider fixtures where available; record source revision, environment, results and every unavailable/excluded case, and do not claim template-only evidence as a service pass.
- [ ] Apply the app-screen inspector to the built service as a diagnostic, allowing the user-approved purple brand, and resolve actual contrast and clipping problems while documenting defensible remaining warnings. Investigate the prior unlocalized light-theme complaint without claiming resolution absent evidence.
- [ ] Run applicable focused/routine Relay verification only within the user's test boundary: no connection tests, tests that send Clips, forced transfers, live identity-provider journeys, real accounts or real clipboard access. Do not claim live connectivity, publication or deployment acceptance.

## Dependency rationale

Tickets 01–07 are complete user-facing slices through existing portal routes and are independently implementable; a shared stylesheet/template or coordinator concurrency limit is an integration concern, not a genuine functional blocker. Coordinate claims and merge shared edits carefully. Ticket 08 is blocked by all seven because it verifies the integrated result. This proposal does not select an implementation branch, authorize real account actions, or change the parent specification.
