# Approved Clipp workspace design

Status: ready-for-agent

## Problem Statement

Clipp users need to find, reuse and manage their Clips across devices without losing screen space to chrome or a persistent details pane. The existing experience must communicate the same familiar actions on desktop, extension and Android, while respecting the smaller space available in narrow windows. Users also need recognizable controls, clear device status and settings that are easy to navigate in either theme.

## Solution

Apply the approved interactive mockup as the visual and layout reference for a shared Clipp workspace. Use a dark-first, restrained interface informed by the selected purple Clipp icon, with a complete light theme. Give Clipboard History the available width; open Clip details in a focused dialog on demand. Use compact navigation on narrow screens, recognizable icons, and dedicated views for Pinned Clips, links, devices and settings. Preserve existing real functionality, runtime-specific capabilities, recovery and accessibility rather than treating the mockup's sample data and preview actions as the product contract.

## User Stories

1. As a Clipp user, I want a recognizable Clipp identity in the workspace, so that I know which application I am using.
2. As a Clipp user, I want a restrained dark theme, so that I can comfortably use the app in low light.
3. As a Clipp user, I want a complete light theme, so that I can choose the appearance that suits me.
4. As a Clipp user, I want the existing system appearance preference preserved, so that my device can choose the theme.
5. As a Clipp user, I want my appearance choice applied consistently across views, so that navigation feels cohesive.
6. As a Clipp user, I want readable type and clear contrast, so that I can understand content in both themes.
7. As a Clipp user, I want familiar, consistent icons with accessible names, so that I can recognize actions without guessing at abstract symbols.
8. As a desktop user, I want labeled workspace navigation, so that I can move between areas quickly.
9. As a narrow-window user, I want compact navigation that opens when needed, so that more space remains for my Clips.
10. As a keyboard user, I want to operate navigation and controls without a mouse, so that I can use the whole workspace.
11. As a user of assistive technology, I want meaningful names, selected states and status announcements, so that the workspace is understandable.
12. As a user, I want the Clipboard view to use the available width, so that I can scan more content.
13. As a user, I want my recent Clips listed with useful previews and times, so that I can identify the one I need.
14. As a user, I want the source device shown when available, so that I can recognize where a Clip came from.
15. As a user, I want text and link Clips visually distinguishable, so that I can scan history quickly.
16. As a user, I want long previews truncated in the list and available in detail, so that rows remain easy to scan.
17. As a user, I want to search Clipboard History, so that I can find a Clip by its content.
18. As a user, I want a clear empty search result, so that I know when no Clips match.
19. As a user, I want to browse all Clips, Pinned Clips and links, so that I can narrow the list to the content I need.
20. As a user, I want to see the active view or filter, so that I understand which Clips are displayed.
21. As a user, I want to change the ordering where supported, so that I can find older or newer Clips.
22. As a user, I want to copy a Clip from the list, so that I can reuse it without opening details.
23. As a user, I want feedback after a copy action, so that I know whether it succeeded.
24. As a user, I want to open a Clip in a dialog, so that details do not occupy space until needed.
25. As a user, I want to read the Clip contents, type, source and time when available, so that I can verify the Clip before using it.
26. As a user, I want to copy the Clip from its dialog, so that I can act after inspecting it.
27. As a user, I want to pin or unpin a Clip from its details, so that I can find it later.
28. As a user, I want the pin state reflected in the list and Pinned view, so that the views agree.
29. As a user, I want Share Now where supported, so that I can explicitly share a Clip with trusted devices.
30. As a user, I want to dismiss Clip details with a close control or Escape and return to my prior context, so that I can continue browsing.
31. As a keyboard user, I want focus managed within dialogs and restored after dismissal, so that I do not lose my place.
32. As a narrow-screen user, I want the details dialog to fit and remain usable, so that I can read and act on a Clip without horizontal scrolling.
33. As a user with no Clips, I want a clear empty state, so that I understand what appears in history.
34. As a user, I want unavailable and failed history operations explained with recovery where available, so that I know what to do next.
35. As a user, I want a Devices view, so that I can understand my Device Network.
36. As a user, I want to distinguish this device from Trusted Devices, so that I know which entry I am managing.
37. As a user, I want connection and last-seen information where available, so that I can understand device reachability.
38. As a user, I want offline Trusted Devices to remain visibly trusted, so that offline status is not confused with Device Revocation.
39. As a user, I want to begin Pairing from the Devices view, so that I can add a device to my Device Network.
40. As a user, I want access to the existing device details, naming and revocation flows, so that the redesign does not remove management capabilities.
41. As a user, I want pending Pairing requests and their outcomes to remain visible, so that I can safely complete or recover a pairing attempt.
42. As a user, I want a Settings view organized into clear groups, so that I can find a preference without navigating through unrelated controls.
43. As a user, I want to control Auto Sync, so that I can choose whether Clips are exchanged automatically.
44. As a user, I want disabling Auto Sync to leave local capture and history intact, so that I retain access to my local Clips.
45. As a user, I want notification controls where supported, so that I can manage device and request notifications.
46. As a user, I want to manage local retention and Clip Sharing Lifetime, so that I understand how long history remains and Clips are shared.
47. As a user, I want pin exemptions and the effects of history policy changes explained, so that I can make informed choices.
48. As a user, I want to review clearing history before confirming it, so that I can avoid accidental loss.
49. As a user, I want the actual applied settings and save or recovery feedback, so that I do not mistake an unconfirmed change for a saved one.
50. As a user, I want managed relay settings to remain available and empty when none are configured, so that I can configure connectivity when needed.
51. As a user, I want existing identity, recovery and platform-specific settings to remain reachable, so that a visual redesign does not hide important operations.
52. As a user, I want clear loading, empty, offline and error states, so that the interface reflects what is actually known.
53. As an Electron, extension or Android user, I want the shared design adapted to my host's available capabilities, so that controls work correctly on my device.
54. As a user who reduces motion, I want nonessential animation minimized, so that the interface respects my preference.
55. As a user, I want the layout to adapt to the available width without clipped controls or page-level horizontal scrolling, so that the workspace remains usable.

## Implementation Decisions

- The client repository owns this effort. The approved interactive mockup is the visual reference, not an implementation or data source. Preserve it as reviewable reference material when preparing implementation.
- Implement reusable product presentation and interaction in the shared UI; keep cross-runtime domain behavior in core and update affected host bridges only where existing user actions require it. Keep Electron main/preload module conventions and extension background/offscreen ownership intact.
- Carry the approved dark and light color roles, restrained surfaces, spacing, typography hierarchy, recognizable outline icon language and selected purple icon into real screens. The mockup's icon is design guidance; it does not independently authorize replacing installed application icons.
- Use one shared workspace shell with labeled desktop navigation and compact, reachable narrow navigation. Preserve navigation destinations and host-specific tasks that are not represented in the mockup. Keep content and action affordances usable at desktop, tablet, phone and extension-popup sizes.
- Show Clipboard History as the primary full-width work area. Provide existing search, views, supported ordering and copying with real state and feedback. Treat mockup link filtering and sorting as presentation targets to map onto available supported behavior; do not fabricate persistent history or delivery semantics.
- Replace persistent Clip details with an accessible modal dialog. Keep content, supported actions, focus containment, Escape dismissal, return focus, copy feedback and error handling. Preserve the list's context when closing it. A direct row copy action must not unintentionally open the dialog.
- The Devices view presents this device, Trusted Devices and known connection states from authoritative runtime state. Pairing, naming, device details, requests, revocation and recovery continue through existing real flows. Never infer Trust from live connectivity or equate an offline device with a revoked one.
- Settings organizes existing capabilities while preserving actual values, System/Light/Dark appearance, pending and recovery feedback, destructive review, local retention and Clip Sharing Lifetime semantics, and host-specific availability. The mockup's sample 100-Clip limit is not an approved policy change.
- Auto Sync remains a device preference for inbound and outbound exchange; disabling it does not disable local capture or erase history. Share Now remains the existing one-Clip outbound override.
- Managed-relay configuration starts empty. Preserve the accepted single-session transport fallback and independent relay behavior; this spec does not change transport, membership, identity or protocol contracts.
- Sample Clip text, device names, network counts, status messages and mockup-only preview actions are illustrative. Replace them with runtime data and truthful loading, empty, unavailable and error states; never display a successful or connected state without supporting state.
- Preserve existing accepted UX implementation decisions and runtime acceptance gates. Coordinate against that effort's canonical integration checkout and current work before implementation; resolve any apparent conflict through the project's decision process instead of silently overriding existing decisions.
- Provide visible focus, semantic controls, accessible names and status feedback, appropriate touch targets, reduced-motion handling and no page-level horizontal overflow. Do not rely on color alone to communicate state.

## Testing Decisions

- **Confirmed seam:** test the shared UI through its public user-facing interface with realistic runtime fixtures. Assert visible outcomes and user interactions, not component structure, CSS classes or internal state. Prefer the existing shared workspace seam over introducing new UI-specific bridge APIs.
- Cover navigation, search and filters, row copy, opening/closing details, pin state, focus restoration, settings states, device status and Pairing entry, and loading/error/recovery through observable behavior. Cover both themes and narrow/wide layouts, including keyboard and accessible names.
- Existing shared UI workspace navigation, Clip details, dialog focus, Clip settings, managed relay settings and recovery tests are prior art; extend the existing workspace navigation harness when appropriate.
- Test the applications on Electron, the extension and Android, using established runtime acceptance procedures for the affected UI and platform-specific interactions. A browser mockup or web build alone does not prove native behavior. Do not run connection tests or tests that send Clips; use controlled UI states and fixtures for connection status and sharing presentation.
- Compare actual rendered views against the approved reference at representative desktop, tablet, phone and extension-popup dimensions, in both themes. Check text contrast, clipping, focus and empty/error states; the mockup's sample content is not an assertion about runtime data.
- Run the repository's appropriate verification profile and document unavailable native or live acceptance rather than substituting simulated results. Run the required check before any code commit.

## Out of Scope

- New synchronization, trust, identity, transport, relay, storage or protocol behavior; a new relay service or relay repository implementation.
- Replacing the installed application icon or introducing a new brand asset solely from the mockup.
- Treating mockup device names, Clip contents, history limit or preview-only actions as product requirements.
- Removing existing functionality, reducing security or changing accepted retention, sharing or revocation policy.
- Deploying, publishing, pushing or performing live acceptance as part of writing this spec.

## Further Notes

The approved reference is the interactive mockup linked from this feature's README. It is a visual and interaction prototype with sample data and several preview-only actions, not a functional runtime. The project glossary and accepted ADRs remain authoritative for domain semantics. The current UX implementation effort has its own canonical integration checkout and decisions; this design effort must coordinate with it before work begins. The user confirmed shared UI and application testing and excluded connection tests and tests that send Clips on 2026-11-02.
