# Clipp Relay portal in the Clipp workspace style

Status: ready-for-agent
Date: 2026-11-02
Repository role: relay

## Problem Statement

Relay Account owners and administrators use a portal that has its own visual language, separate from the approved Clipp workspace. Owners need to see their available weekly relay capacity, understand access limits and connect Clipp without navigating a visually inconsistent interface. Administrators need to review accounts and Quota Plans with the same clear, compact interaction patterns on desktop and narrow screens. A visual refresh must preserve trustworthy account, security, usage and administrative behavior.

## Solution

Apply the new interactive Relay mockup as the visual direction for the existing Relay portal, aligned with the approved Clipp workspace. Use dark as the primary appearance and provide a usable light appearance, restrained purple identity accents, recognizable outline icons, compact responsive navigation and contextual dialogs. Retain the existing server-rendered application and real handlers, including every established owner and administrator workflow, accessible fallback and security safeguard. The mockup is a design reference with sample data, not an implementation or authority for quota, connection or account behavior.

## User Stories

1. As a Relay Account owner, I want the portal to look related to Clipp, so that the two products feel coherent.
2. As a Relay Account owner, I want a dark appearance, so that I can comfortably use the portal in low light.
3. As a Relay Account owner, I want a light appearance, so that I can choose a readable alternative.
4. As a portal user, I want an obvious appearance control, so that I can change themes without losing my current task.
5. As a portal user, I want recognizable icons and descriptive labels, so that I can identify navigation and actions.
6. As a portal user, I want clear type and sufficient contrast in both themes, so that account information is legible.
7. As a desktop user, I want labeled navigation, so that I can reach my account and security views directly.
8. As a narrow-screen user, I want compact navigation with a clear open and close control, so that it does not consume the working area.
9. As a keyboard user, I want to reach and operate the navigation, so that I can use the portal without a pointer.
10. As an assistive-technology user, I want meaningful control names, current-view state and announcements, so that the interface is understandable.
11. As a Relay Account owner, I want my account status and signed-in identity visible, so that I know which account I am viewing.
12. As a Relay Account owner, I want remaining weekly allowance prominent, so that I can quickly judge available capacity.
13. As a Relay Account owner, I want recorded usage shown against my effective allowance, so that the remaining amount has context.
14. As a Relay Account owner, I want the current Weekly Quota Window and UTC reset time, so that I know when my allowance resets.
15. As an owner with no recorded usage, I want a genuine zero, so that unused capacity is not mistaken for missing data.
16. As an owner with a zero allowance, I want a clear unavailable state, so that an Active account does not imply usable capacity.
17. As an owner whose recorded usage exceeds the allowance, I want the full recorded amount and zero remaining, so that an overrun is not hidden.
18. As an owner, I want the usage indicator to reflect the displayed values, so that its proportion can be trusted.
19. As an owner, I want current Relay Sessions and their limit shown, so that I can understand concurrent relay capacity.
20. As an owner, I want Login Grants shown separately from Relay Sessions, so that an authorization is not mistaken for a live connection.
21. As an owner, I want unavailable observations distinguished from zero, so that sampling failure is not presented as inactivity.
22. As an owner, I want the configured limit visible when a live count is unavailable, so that I can still understand my allowance.
23. As an owner, I want a clear distinction between my Relay Account and my Device Network, so that I do not mistake grants for registered devices.
24. As an owner, I want an explanation of Recorded Relay Usage and Charged Relay Traffic, so that I understand what the figures measure.
25. As an owner, I want to know recorded usage may lag recent traffic, so that I do not interpret it as real-time payload measurement.
26. As an owner, I want recent weekly totals, so that I can see how relay use varies over time.
27. As an owner, I want the current incomplete week clearly identified, so that I do not compare it as a complete week.
28. As an owner, I want access to all retained weekly history, so that a compact default does not hide earlier observations.
29. As an owner using a screen reader, I want exact weekly totals in accessible form, so that I do not have to interpret a chart.
30. As an owner, I want honest zero and missing history states, so that I can distinguish no usage from unavailable data.
31. As an owner, I want Connect Clipp available from the account view, so that I can set up an app quickly.
32. As an owner, I want the correct Relay Discovery Endpoint displayed and copyable, so that I can configure Clipp accurately.
33. As an owner whose browser cannot copy, I want to select the endpoint manually, so that setup remains possible.
34. As an owner, I want setup to explain app authorization, so that I do not mistake a Portal Session for a Login Grant.
35. As a Pending Relay Account owner, I want an approval explanation, so that I know why I cannot use relay capacity yet.
36. As a Suspended or Denied owner, I want the applicable restriction explained, so that I do not confuse it with a pending review.
37. As an owner under a Recovery Review Hold, I want the hold shown independently of account status, so that I am not told relay use is ready when it is restricted.
38. As an owner, I want to refresh my account view without submitting a mutation, so that I can check its latest state.
39. As an owner, I want Access & security in a dedicated view, so that I can find account controls.
40. As an owner, I want portal-only sign-out separated from Sign out everywhere, so that I understand the scope of each action.
41. As an owner, I want to review account-wide revocation and its consequences, so that I can make an informed choice.
42. As an owner, I want to review Relay Account Deletion and its consequences, so that I understand its irreversibility and retained quota rules.
43. As an owner, I want pending, completed, uncertain and recoverable action outcomes reported honestly, so that I do not mistake an unknown result for success.
44. As an administrator, I want Account reviews and Quota plans available only when authorized, so that ordinary owners do not see administrative controls.
45. As an administrator, I want a clear count of accounts awaiting review, so that I can find outstanding work.
46. As an administrator, I want to filter accounts by status and search their presentation email, so that I can locate the intended account.
47. As an administrator, I want the filter and search to cover the eligible dataset, so that matching accounts beyond the current page are not missed.
48. As an administrator, I want list context preserved through review and Back, so that I can continue where I left off.
49. As an administrator, I want an account's actual status, plan, effective quota, usage and recovery hold available in review, so that I can assess the account.
50. As an administrator, I want an action-specific approval flow with plan and reason, so that I can review what will change.
51. As an administrator, I want existing suspend, reactivate, deny, return-to-pending, grant revocation and recovery review actions, so that the redesign does not remove essential management.
52. As an administrator, I want assigned plans and effective overrides shown correctly, so that an archived or off-page plan is not shown as missing.
53. As an administrator, I want setting a quota override to zero distinguished from clearing an override, so that I can express the intended policy.
54. As an administrator, I want Quota Plans listed with their actual allowance and Relay Session limits, so that I can compare available assignments.
55. As an administrator, I want to create and archive plans through the existing policy, so that I can manage future assignments without silently changing existing ones.
56. As an administrator, I want conflicts and uncertain results to offer safe recovery, so that I do not unintentionally repeat or lose a change.
57. As a Clipp user authorizing an app, I want the client type and signed-in Relay Account correctly identified, so that I know what I am authorizing.
58. As a Clipp user, I want authorization and cancellation to retain their existing security guarantees, so that a dismissed or invalid request cannot grant access.
59. As a portal user, I want important content and forms to work without JavaScript, so that essential tasks remain available when enhancement is unavailable.
60. As a portal user, I want dialogs to support keyboard navigation, Escape and return focus, so that I can complete a task without losing my place.
61. As a phone user, I want key figures, review actions and current-week history visible without horizontal page scrolling, so that the portal is usable in a small window.
62. As a user who reduces motion or enlarges text, I want the interface to remain usable, so that its presentation respects my needs.
63. As a signed-out or restricted user, I want service messages and recovery actions in the same design language, so that I understand the next safe step.

## Implementation Decisions

- The Relay repository owns the implementation. The new interactive mockup is the visual reference and the Clipp workspace mockup supplies its shared style; neither is production code, real account data or proof of service behavior. Preserve a durable, reviewable copy of the reference before implementation or cleanup.
- This request supersedes the earlier portal's green-grey/light-only visual direction and its exclusion of theme switching **for appearance only**. Preserve the earlier Relay portal workspace specification's functional, security, authorization, no-script and recovery requirements. It does not approve changing domain or transport invariants.
- Keep the existing Go server-rendered templates, embedded asset delivery, production handlers and route structure. Adopt the reference's near-black surfaces, light counterpart, restrained purple accents, Clipp mark, readable type, realistic outline icons, spacing and contextual overlays. Do not replace the installed Clipp icon as a side effect.
- Default to the dark reference and offer light selection without interrupting a task. Store or apply any appearance preference through an appropriately scoped nonsecret browser mechanism; choose a safe usable default when client storage or JavaScript is unavailable. Avoid requiring new server-side account data, weakening CSP or blocking essential content on theme initialization.
- Build owner overview, Access & security, account reviews and Quota Plans around existing server-provided facts and permissions. Show administrative navigation only under the existing authoritative administrator checks. Do not infer device membership, connection health or account authority from the mockup's icons, grants or example status.
- Lead the overview with remaining weekly allowance and a proportional indicator, recent Recorded Relay Usage, independently sampled Relay Sessions and Login Grants, and Connect Clipp. Compute remaining as the nonnegative difference from authoritative effective allowance; show the unmodified recorded total on overrun and handle zero allowance without undefined ratios. Use binary units and authoritative UTC window boundaries.
- Keep known zero separate from unavailable observations and preserve configured limits, individually sampled state and existing restrictions. Pending, Active, Suspended and Denied remain distinct; Recovery Review Hold remains an additional restriction. No mockup count or example value is a default or telemetry source.
- Keep current week and the prior twelve retained weeks available, with a recent-four default and exact accessible totals. Mark the current week incomplete, distinguish missing and zero and preserve chronological, absolute history. A mockup dialog showing only four examples is not authorization to remove the full range.
- Present Connect Clipp as a contextual dialog or equivalent responsive task surface, with the real canonical Relay Discovery Endpoint, actual setup instructions, copy success/failure feedback and a selectable fallback. A Portal Session does not authorize a Clipp app; preserve the existing no-script setup path and supported client-family instructions.
- Preserve Portal Session sign-out, Account-wide Revocation and Relay Account Deletion as distinct operations with their existing confirmation, authorization, invalidation, reauthentication, retained-quota, recovery and result semantics. Simplified mockup messages are not the operational flow.
- Use the new visual treatment for administrator lists, search, filters, account review and plan views. Retain bounded server-side search and pagination, all canonical account statuses including Denied, plan lookup independent of list paging or archival, accurate effective quotas and validated list/Back context. A contextual account review must expose all existing relevant actions and data rather than the mockup's abbreviated summary.
- Retain state-specific approval, status changes, grant revocation, plan reassignment, override and recovery-review forms, including exact value and zero-versus-clear semantics. Retain immutable assigned Quota Plans, plan create/archive behavior, operation identity and ambiguous-result handling. No client-selected subscription or in-place assigned-plan editing is introduced.
- Apply the shared style to sign-in, consent, restriction, conflict, retry, rate-limit, deletion and other existing service states, keeping content and safe recovery appropriate to each state. Preserve the full validated consent authorize/cancel flow and its existing OAuth, callback, PKCE, one-use and credential safeguards.
- Preserve Origin, CSRF, session generation, fresh-authentication, revision, reason, current administrator allowlist and operation checks, output escaping, private no-store behavior, public/private route isolation and established CSP. A dialog or success notification never substitutes for server-confirmed state or bypasses a required review.
- Maintain progressive enhancement: essential account facts, history totals, navigation, setup, forms and recovery work without JavaScript. Enhanced menus and dialogs support keyboard, focus containment and restoration, semantic names, visible focus, reduced motion and adequate touch targets. No state or action may depend solely on color.
- Responsive layouts must support desktop, tablet, phone and narrow windows, enlarged text and no page-level horizontal overflow. Keep the current week and mobile Review action reachable. Do not fabricate data or hide real content to satisfy a visual metric.

## Testing Decisions

- Reuse the previously confirmed highest meaningful seam: the production portal HTTP boundary with existing handler/request helpers, a deterministic local identity-provider double, disposable migrated PostgreSQL and existing quota collaborators. The user confirmed this seam and the built-service browser layer for the same portal on 2026-10-26; that approval applies to this presentation effort. Good tests assert visible facts and actions, HTTP outcomes, safe redirects and authoritative state rather than CSS classes, component internals or the prototype itself.
- Exercise owner account, restrictions, recorded usage/history, setup, security, administrator list/detail and plan flows, consent and recovery as relevant to changed presentation. Include known zero/unavailable counts, overruns, full history, search/paging context, permissions, stale/uncertain responses and no-script paths. Preserve existing detailed acceptance cases in the earlier portal spec rather than replacing them with screenshot checks.
- Reuse portal HTTP integration scenarios and the existing built-service browser acceptance fixture and runner as prior art. Browser tests operate against the real locally built service and embedded assets with synthetic data, and cover responsive navigation, theme choice, dialogs, focus, accessible names, setup copy success/refusal and real server forms.
- Inspect the built application in dark and light appearances at desktop, tablet, phone and narrow widths, including enlarged text, reduced motion, restricted and sparse states. Compare against the new mockup while checking contrast, current-week visibility, meaningful controls and no horizontal page overflow. The prototype inspector's two warnings about small secondary text and chart whitespace are review targets, not acceptance waivers.
- **User test boundary:** do not run connection tests or tests that send Clips. Use deterministic fixtures for Relay Session and usage presentation, and do not run forced-transfer or native-client journeys. Portal UI and HTTP verification must not be represented as live connectivity proof.
- Run the appropriate local Relay routine and focused database/browser profiles where prerequisites are available, while excluding connection and Clip-sending tests. Record commands, revision, environment, results and explicit skips; do not equate database-free or prototype checks with full application verification. Run race checks when modified shared state warrants them.

## Out of Scope

- Changes to Clipp client UI, Device Network membership, pairing, clipboard capture, Clip exchange or runtime bridges.
- Connection tests, sending Clips, forced relay transfer, live Google account testing, production deployment, cluster mutation and publication.
- New relay protocols, concurrent retained sessions, quota or accounting policy, account states, roles, subscriptions, device registries or new per-device grant claims.
- Replacing the server-rendered stack, exposing a public test-login endpoint, importing prototype fixture values into production, or removing existing functionality to match the prototype.
- Treating this specification or mockup as permission to deploy, push, mutate production or alter real accounts.

## Further Notes

The interactive reference and repository ownership are linked in this feature's README. Its example account, endpoint, usage figures and action previews are illustrative. The previous portal workspace spec remains the functional baseline, with its accepted implementation and recorded evidence; consult current repository state before planning implementation. The earlier portal integration worktree is recorded as prunable, so locate and verify the actual baseline instead of assuming that historical checkout exists. The current user's request selects this design for a new implementation specification; it does not itself implement the design.
