# Clipp Relay: visual fidelity and usability corrections

Status: ready-for-agent
Date: 2026-11-02
Repository role: relay

## Problem Statement

The implemented Relay portal adopts a dark theme and separate workspace views but still differs materially from the selected Clipp Relay mockup. Some dark-theme controls are nearly invisible, the narrow header clips navigation, and large cards and empty review panes consume space that could show account and administrative information. Mobile history and account lists also become difficult to scan. A user additionally reported unreadable light-theme text in the implementation thread, but the affected page was not identified. Relay owners and administrators need a readable, compact, consistent portal without losing the existing security, quota and recovery behavior that the mockup simplifies.

## Solution

Correct the actual server-rendered portal against the approved Relay mockup and the accompanying visual review. Fix control contrast and clipped navigation first, then align the overview, usage history, account reviews, Quota Plans, security and contextual dialogs with the reference's compact layout and recognizable Clipp identity. Preserve the full real feature set, progressive enhancement and domain contracts. Validate every changed surface through the existing portal HTTP boundary and an isolated browser against the built service; synthetic template screenshots are design evidence, not production acceptance.

## User Stories

1. As a Relay Account owner, I want a portal that visually belongs with Clipp, so that I recognize the product and its controls.
2. As a portal user, I want readable dark and light themes, so that I can use the appearance that suits me.
3. As a portal user, I want the theme switch readable in every state, so that I can change appearance without searching for an invisible control.
4. As a portal user, I want logout and dialog-close controls readable, so that I can leave or dismiss a task confidently.
5. As a portal user, I want hover, focus, disabled and active control states distinguishable, so that I can understand which action is available.
6. As a user affected by unreadable light-theme text, I want all real light-theme states investigated, so that the underlying issue can be found rather than assumed fixed.
7. As a phone user, I want the complete navigation control within the visible viewport, so that I can open the menu.
8. As a phone user, I want a compact header that does not wrap the title into a column, so that more of the actual task is visible.
9. As a keyboard user, I want to reach and dismiss menus and dialogs, so that I can use the portal without a pointer.
10. As a screen-reader user, I want named controls, semantic headings, selected state and status announcements, so that I can navigate the portal.
11. As a user with enlarged text, I want controls to reflow without clipping, so that accessibility does not hide actions.
12. As an owner, I want my account and restriction state visible, so that I know whether relay use is permitted.
13. As an owner, I want remaining weekly allowance to be the most prominent quota fact, so that I can quickly assess capacity.
14. As an owner, I want recorded usage and allowance shown together with units, so that the remaining value has context.
15. As an owner, I want the current UTC window and reset made clear, so that I know when the allowance changes.
16. As an owner with no usage, I want an honest zero, so that it is not confused with missing data.
17. As an owner with zero allowance, I want an understandable unavailable state, so that Active status does not imply usable relay capacity.
18. As an owner over quota, I want the full recorded amount and zero remaining shown, so that an overrun is not hidden.
19. As an owner, I want Relay Sessions and Login Grants shown separately, so that I do not confuse live connections with app authorizations.
20. As an owner, I want unavailable counts distinguished from zero while their limits remain visible, so that a failed observation is not presented as inactivity.
21. As an owner, I want the quota and capacity areas to fit their contents, so that blank card space does not push history below the useful area.
22. As an owner, I want Recorded Relay Usage explained without implying exact Clip payload measurement, so that I understand its limits.
23. As an owner, I want the most recent weekly values easy to compare, so that I can understand my usage history.
24. As a phone user, I want the recent current week visible without tiny, broken words, so that I can read the history quickly.
25. As an owner, I want all retained thirteen weeks available, so that a compact default does not remove earlier data.
26. As a screen-reader user, I want complete UTC dates and exact values in accessible history, so that I do not depend on a chart.
27. As an owner, I want zero and missing observations distinguished and the current week identified as incomplete, so that the history is truthful.
28. As an owner, I want Connect Clipp easy to find, so that I can configure an app without searching the page.
29. As an owner, I want a readable close control and complete setup content in its dialog, so that I can enter and leave the task comfortably.
30. As an owner, I want a correct selectable discovery endpoint and truthful copy feedback, so that I can configure Clipp even if copying fails.
31. As an owner, I want setup to distinguish a Portal Session from a Login Grant, so that I do not mistake browser sign-in for app authorization.
32. As an owner, I want setup and essential information available without JavaScript, so that enhancement is not required for basic use.
33. As an owner, I want Pending, Suspended, Denied and Recovery Review Hold states explained distinctly, so that I know why relay use is unavailable.
34. As an owner, I want portal sign-out, Sign out everywhere and account deletion clearly separated, so that I understand each action's scope.
35. As an owner, I want serious actions and their consequences reviewed before confirmation, so that compact design does not increase the chance of mistakes.
36. As an owner, I want uncertain, failed and pending actions explained with safe recovery, so that I do not mistake an unconfirmed result for success.
37. As an administrator, I want the account list to use the available width when no account is selected, so that email addresses and statuses are easy to scan.
38. As an administrator, I want account details on demand while keeping list context, so that an empty pane does not take half the screen.
39. As an administrator, I want search and status filters over the whole eligible dataset, so that results are not limited to the visible page.
40. As an administrator, I want a clear pending-review finding and reachable review action on phones, so that I can quickly find work.
41. As an administrator, I want account status, applied quota, assigned plan, overrides and Recovery Review Hold available, so that the simplified layout does not hide decisions.
42. As an administrator, I want approval, restriction, reactivation, revocation, override and recovery actions to keep their real validation and feedback, so that visual changes do not weaken policy.
43. As an administrator, I want archived or off-page assigned plans named correctly, so that an account is not incorrectly shown as unassigned.
44. As an administrator, I want Quota Plans presented in compact rows with real values, so that I can compare them efficiently.
45. As an administrator, I want creation and archive actions to retain their validation and confirmations, so that I can manage plans safely.
46. As a portal user, I want sign-in, consent, restrictions, errors and recovery pages to share the design, so that I can recognize and complete each task.
47. As a Clipp app authorizing relay access, I want the correct account and client identified and cancellation handled safely, so that a visual change cannot grant unintended access.
48. As a user with reduced-motion preference, I want the portal to minimize nonessential motion, so that navigation remains comfortable.
49. As a user, I want correct and truthful state rather than mock data or invented device status, so that I can trust the interface.
50. As a maintainer, I want actual service/browser verification separated from template-only screenshots, so that design evidence is not mistaken for acceptance.

## Implementation Decisions

- Relay owns the implementation; Clipp owns the canonical local tracker. The exact reviewed revision, accepted mockup, controlled screenshots, measurements and evidence limits are recorded in the linked review and feature README. Verify current integration state and establish this spec's own implementation lineage before work begins.
- Keep the existing server-rendered Go portal, embedded asset model, handler routes and authentication behavior. The mockup is a visual guide, not an implementation, data source, new domain policy or permission to remove established functionality.
- Correct actual computed foreground/background combinations for theme switch, sidebar/menu logout, Connect Clipp dialog Close and all affected controls in dark and light themes, including hover, focus and disabled states. Scope foreground colors to the control's actual fill instead of broad button selectors. Achieve WCAG AA contrast for normal text and meaningful control boundaries and preserve visible keyboard focus. Examine the user's unresolved light-theme report across authenticated, signed-out, admin, consent, error and interactive states; document any remaining unlocated report honestly.
- Recompose the mobile header to keep brand, current destination, theme and menu controls visible and operable at 320–390 px and enlarged text. Test actual bounding rectangles and clipping ancestors, not just document scroll width. Keep an accessible, keyboard-operable, closable menu and preserve navigation, logout and focus behavior.
- Replace the mock implementation's abstract overlapping-squares brand mark with the selected Clipp C mark or an equivalent approved portal asset consistent with the visual reference, subject to the existing embedded asset and CSP model. Do not change installed client icons. Apply the reference's neutral near-black/light surfaces, typography, restrained accent, aligned gutters and recognizable icons; avoid unnecessary framing and tinted active-navigation chrome where it detracts from the reference.
- Prioritize allowance remaining, Recorded Relay Usage against effective allowance, UTC window/reset and separate live Relay Session and Login Grant counts. Use content-sized panels, compact labels and a proportional usage indicator; do not repeat the same limit unnecessarily or stretch a short capacity area to match a taller panel. Keep usage semantics and explanatory details available without cluttering the first scan.
- Keep authoritative service data and arithmetic: nonnegative remaining, complete overrun value, zero allowance handling, binary units, current UTC window, independently unavailable versus known-zero counts and correct restriction states. Never infer device membership or connection health from a Login Grant or Relay Session.
- Make the current/recent weekly history legible at narrow widths with a compact chart or readable list, plus an accessible table or equivalent exact-value representation. Preserve the recent-four default and all thirteen retained weeks, complete UTC dates, exact values, missing/zero states and current-incomplete status. Avoid word-level breaks in headings and status; a responsive row may stack content rather than squeeze fixed table columns. No fabricated data or hidden exact values.
- Maintain Connect Clipp as a contextual task where script is available and as a usable no-script path otherwise. Match the reference's hierarchy and spacing, make Close visible, keep endpoint selection and truthful copy/refusal feedback, actual supported client setup and the Portal Session/Login Grant distinction. No action performed merely by opening the dialog.
- On Account reviews, use the available width for the list when no account is selected; open review as an on-demand dialog, detail view or equivalent task surface, with a safe no-script path. Preserve the actual review data and forms, focus/Back/list context, status filtering including Denied, bounded literal server-side search, pagination, current administrator authorization and off-page/archived plan correctness. Do not replace existing real actions with the mockup's preview button.
- Present Quota Plans and owner security as compact aligned rows or contextual task surfaces instead of repeated expanded fields and stretched cards. Preserve creation, archive confirmation, immutable assigned plan values, Account-wide Revocation, Relay Account Deletion, recent authentication, safe retries and no-script forms. Access-closing or destructive effects must remain explicit before confirmation.
- Carry the style and contrast fixes through sign-in, consent, restricted states, conflict/rate-limit/failure/deletion messages and all relevant owner/admin states. Preserve authoritative status codes, retry hints, safe destinations, consent authorize/cancel semantics, one-use continuation, PKCE, Origin/CSRF, revision, allowlist and current-session validation, operation identities, escaping, no-store and CSP. No visual control or toast may imply an unconfirmed operation succeeded.
- Support desktop, tablet, phone, narrow 320 px, enlarged text, reduced motion, keyboard, touch and screen readers. Preserve real explanations and long emails/IDs through wrapping, disclosure or scroll within a task; do not hide important content or create page-level horizontal scrolling. Distinguish legitimately scrollable table/dialog regions from offscreen clipped controls.
- This review directly examined synthetic owner, security, account-review and plan template fixtures in dark/light at 1440×900 and 390×844, plus inspector output at 768×1024. Unrendered states, real handler outcomes and deployed/live environments are not established; extend the review against the built service rather than treating the observed list as exhaustive.

## Testing Decisions

- Reuse the same portal HTTP boundary and built-service browser seams the user confirmed for the original Relay workspace: production handlers with deterministic local identity-provider double, disposable migrated PostgreSQL and real embedded templates/assets. Good tests assert observable content, control operation, safe redirects and authoritative state, rather than CSS selectors or a recreated mockup. Use existing owner-profile, account/security, administrator review, plan and consent integration tests and the portal browser fixture as prior art.
- Capture and inspect comparable built-service views in dark and light at 1440×900, 768×1024, 390×844 and 320 px, with enlarged text and reduced motion. Include signed-out, ordinary and restricted accounts, Recovery Review Hold, zero/overrun/missing usage, security, account list and selected review, plans, consent and error/recovery states. Compare hierarchy, actual control bounds, alignment, density and access to current-week history against the reference; avoid pixel-exact snapshots as the sole assertion.
- Check computed contrast and actual visibility for every theme-switch, logout and dialog-close variant, in default, hover, focus and disabled states where applicable. Test selected navigation, theme persistence/fallback, keyboard focus, Escape, dialog closure, setup copy success/refusal using an isolated clipboard fixture, and no-script navigation and forms. Investigate the user's unlocalized light-theme complaint without claiming it was reproduced or resolved until evidence identifies it.
- Exercise bounded account search/filter/paging and preserved return context, available plan and override forms, security confirmations, consent authorize/cancel, error handling and truthful outcomes with synthetic server state. Preserve the previous portal specification's security and recovery acceptance cases; no mock-only data or UI state may substitute for authoritative results.
- **User test boundary:** do not run connection tests, tests that send Clips, forced Relay transfers or live identity-provider journeys. Use deterministic fixture counts and usage. Do not use real accounts, credentials, persisted profiles or the real system clipboard; avoid actions on external services. A local UI test is not proof of real relay connectivity.
- Run applicable focused and routine Relay verification only within that boundary; record exact revision, fixtures, commands, results, skipped cases and unavailable prerequisites. Run the app-screen inspector on the built service as a diagnostic, allowing the explicitly selected purple brand rather than treating it as an automatic defect; investigate contrast and actual clipping, and explain any residual warnings. Do not equate source lint patterns or template-only screenshots with visible failures or built-service acceptance.

## Out of Scope

- Client Clipboard History, Device Network membership, Pairing, identity, clipboard capture or sharing behavior; no Clipp client implementation.
- Relay protocol, quota accounting, Relay Session admission, identity, authorization, server storage or new administrative roles/policies.
- Connection tests, sending Clips, forced transfer, live provider sign-in, production changes, deployment, publication or real account mutations.
- Replacing the Go/template stack, removing safeguards or existing functionality, or importing mockup fixture names, counts, hostnames and preview actions into production.

## Further Notes

The [visual review](review.md) provides evidence and limitations. The implementation thread reported a light-theme visibility complaint without a specific screen; the prior assistant observed a readable signed-out screen, and this review's synthetic active-account sample also appeared readable. That does not settle the complaint. The confirmed dark-theme contrast and clipped mobile menu are independently observed in template-backed browser renders. The existing Relay portal workspace specifications remain authoritative for functionality and security; this spec changes presentation without approving a change to those contracts.
