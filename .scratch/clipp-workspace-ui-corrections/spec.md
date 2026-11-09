# Clipp workspace: visual fidelity and layout corrections

Status: ready-for-agent
Date: 2026-11-02
Repository role: client

## Problem Statement

The implemented Clipp workspace carries the approved design's broad navigation and dialog ideas, but its screens do not yet achieve the mockup's compactness or hierarchy. History controls remain above unrelated destinations, Clips take too much vertical space, and Clip details place technical metadata before the content and actions people need. Devices and Settings use large nested panels that leave considerable space unused and push useful controls below the fold, especially in narrow windows. Small labels and the History heading also need readability and semantic attention. Users need a polished, efficient UI without losing the real capabilities, safeguards and feedback that the simplified mockup does not show.

## Solution

Refine the existing shared workspace against the approved interactive mockup, prioritizing compact destination-specific controls, denser readable History rows, content-first Clip details, and efficient Devices and Settings layouts. Preserve dark and light themes, accessible behavior and all existing product capabilities. Use the [visual review](review.md) as the evidence and acceptance focus, not the prototype's sample content as product data. Judge the results in the real built applications as well as the shared UI using isolated fixtures; do not run connection tests or tests that send Clips.

## User Stories

1. As a Clipp user, I want the workspace to match the approved visual direction, so that the product feels coherent and finished.
2. As a Clipp user, I want readable dark and light themes, so that I can choose the appearance that suits me.
3. As a Clipp user, I want the System appearance preference preserved, so that the app can follow my device.
4. As a Clipp user, I want recognizable icons and clear labels, so that I can distinguish actions without guessing.
5. As a user, I want the current destination identified once with a clear hierarchy, so that I can orient myself without redundant headings.
6. As a user, I want History search and filters to belong to History, so that they do not displace content on Devices or Settings.
7. As a user, I want a clear way to return to search, so that contextual controls do not make History harder to reach.
8. As a narrow-window user, I want a compact top area, so that more useful content is visible without scrolling.
9. As a desktop user, I want the available width used by the current task, so that large areas are not consumed by empty nested panels.
10. As a user, I want navigation and Requests to remain reachable, so that visual refinement does not remove existing tasks.
11. As a keyboard user, I want clear focus and logical navigation, so that I can use the workspace without a pointer.
12. As an assistive-technology user, I want meaningful headings, control names, selected states and status announcements, so that I can understand each view.
13. As a user, I want my Clips displayed in compact rows, so that I can scan more history at once.
14. As a user, I want Clip content or a meaningful preview to lead each row, so that I can find the right Clip quickly.
15. As a user, I want source, timestamp, type and pin state communicated without repeated visual noise, so that I can scan relevant metadata.
16. As a user, I want long text and identifiers to remain fully inspectable, so that compact rows do not hide important information permanently.
17. As a user, I want copy and pin controls associated with the correct Clip, so that I can act safely and quickly.
18. As a touch or keyboard user, I want row actions to be discoverable without hover, so that I can use them on all supported devices.
19. As a user, I want All, Pinned and Links views and available time/source filters to remain usable, so that compactness does not remove filtering.
20. As a user, I want my search, filter and list position retained as appropriate when changing tasks, so that I do not lose context.
21. As a user, I want empty, loading, no-match, unavailable and error states that are easy to understand, so that I can distinguish absence from failure.
22. As a user, I want retry and recovery actions to remain visible where needed, so that I can recover from a failed operation.
23. As a user, I want to open Clip details in a contextual dialog, so that details do not permanently take up the History area.
24. As a user, I want the Clip content and its type to be prominent in that dialog, so that I can verify the item before acting.
25. As a user, I want a clear Copy action and the supported pin and delete actions, so that I can act without interpreting ambiguous symbols.
26. As a user, I want source, time, Peer ID and Clip ID available in details without dominating the first view, so that I can inspect technical context when needed.
27. As a user, I want the current-clipboard Send action accurately described, so that I do not think it sends the selected Clip when it does not.
28. As a user, I want pending, failed and retryable Clip actions to display truthful feedback, so that I know what actually happened.
29. As a keyboard user, I want dialog focus contained and restored on dismissal, so that I return to the Clip I was using.
30. As a narrow-screen user, I want a dialog that fits and scrolls as needed, so that the content and every action remain reachable.
31. As a user, I want Devices to show my device and Trusted Devices in compact, aligned rows, so that I can understand my Device Network at a glance.
32. As a user, I want device status and identity to remain accurate and distinguishable, so that I do not mistake offline status for loss of Trust.
33. As a user, I want the actual Pairing, QR, naming, device details, revoke and recovery actions to remain available, so that a visual correction does not remove device management.
34. As a user, I want long names and Peer IDs to be reachable, so that a compact layout does not make identity verification impossible.
35. As a user, I want Settings groups aligned and efficiently arranged on wide screens, so that I can compare settings without scanning oversized full-width controls.
36. As a narrow-screen user, I want settings to stack compactly and remain scrollable, so that controls are reachable without excessive chrome.
37. As a user, I want actual Auto Sync, notifications, retention, Clip Sharing Lifetime, relay, identity and platform-specific settings preserved, so that the redesign does not discard functionality.
38. As a user, I want saved, pending, unavailable, partially applied and recovery states presented honestly, so that I know which values are effective.
39. As a user, I want retention consequences and destructive actions explained where necessary, so that a denser layout does not make important decisions opaque.
40. As a user, I want disabled Auto Sync to retain local capture and Clipboard History, so that I do not lose my local Clips.
41. As a user, I want device and relay states to use actual runtime observations, so that the UI never fabricates connection or delivery status.
42. As an Electron, Android or Chrome user, I want the same design adapted to my host's real constraints, so that controls are available where the platform supports them.
43. As a user with enlarged text, I want controls to reflow and remain legible, so that visual density does not require smaller text.
44. As a user who prefers reduced motion, I want nonessential movement minimized, so that navigation and dialogs remain comfortable.
45. As a user, I want all screen content reachable without page-level horizontal scrolling, so that small windows remain usable.
46. As a user, I want actual application verification reported separately from fixture screenshots, so that design evidence is not confused with native acceptance.

## Implementation Decisions

- The client repository owns this corrective effort. Its visual baseline is the linked implementation revision and its reference is the approved Clipp interactive mockup, as recorded in the review. Inspect the current integration state and coordinate with existing UX work before implementation; follow this spec's own integration lineage and preserve unrelated work.
- Keep the existing shared UI, application stack and host bridges. Adapt styles and shared presentation at existing boundaries; introduce no new network, transport, storage, identity or sync policy. Preserve real action results and platform capability differences rather than replacing the application with the mockup.
- Make top-bar and page-title hierarchy compact and consistent. Place History-specific search, filters and sorting with History rather than occupying persistent space on unrelated views. Retain a clearly discoverable path to History search and all existing History controls, Requests, connection/status information and current-clipboard Send. Preserve navigation/session state, drafts, focus, host Back behavior and established geometry constraints.
- Reduce History row height toward the approved two-line reference using aligned preview, source, time and type; give the preview the main visual weight. Keep real metadata, status, pin and copy actions, accessible names and full content in details. Preserve usable hit targets, visible focus, truncation alternatives and empty/error/retry states. The review's 70/65 px reference rows are comparison evidence, not a fixed height that overrides localization, 200% text, touch targets or long content.
- Keep Clip details as a contextual modal. Place the Clip's content and meaningful identity first, with prominent labeled copy and appropriately named secondary actions. Place source, capture time and technical identifiers in a tidy secondary section or accessible disclosure; do not remove them. Preserve pin state, delete, feedback, selection context, focus containment, Escape, return focus and recovery. Explicitly distinguish the existing current-system-clipboard Send action from sharing the selected Clip; do not imply either action was performed by opening the dialog.
- Recompose Devices as content-sized, aligned device rows and task actions rather than an oversized outer panel with nested boxes and dead width. Preserve this-device identity, all Trusted Device state, truthful connection observations, naming, QR, Pairing, revocation, Requests and associated error/recovery flows. Long labels and Peer IDs remain accessible; offline is not revocation.
- Recompose Settings around a clear visual hierarchy: compact category navigation, grouped controls and aligned labels/actions on desktop, stacking naturally on narrow screens. Avoid oversized nested bordered groups and unnecessarily full-width controls when they do not help the task. Keep all existing appearance preferences, Auto Sync, notification, retention, sharing, managed relay, identity, diagnostics, continuity and host-specific controls and their explanatory text, confirmation and recovery flows. Do not introduce the sample mockup's history limit.
- Apply a consistent restrained surface, border, spacing, typographic and icon system in both themes, using the approved reference. Increase tiny metadata to a readable size and provide a semantic screen-level heading on History. Keep contrast, meaningful non-color status cues and accessible control names; remove a visible resting shadow only where it is actually shown, while preserving legitimate overlay/focus treatment. Do not mechanically remove app-appropriate lines or legacy styles solely because a source scanner flags them.
- Maintain the existing distinction between local Clipboard History, Auto Sync, Clip Sharing Lifetime, Share Now and current-clipboard Send, including existing retry/error states and runtime-specific capabilities. Never invent device status or show success without a confirmed action result. Preserve managed-relay empty defaults and accepted single-session transport fallback; no relay changes are required.
- Use available viewport space without clipping, nested scrolling traps, horizontal page overflow or lost controls across wide, tablet, phone and short popup windows. Support 200% text/zoom, long localized strings, narrow safe areas, keyboard and touch use, reduced motion and logical focus/scroll restoration. Retain practical touch target sizes even where that limits density.
- The review examined selected controlled host-styled screenshots and source, not native application shells. Treat every unobserved state as a verification requirement rather than claiming all differences are known; compare each implemented surface with the reference and extend the findings when evidence shows another material mismatch.

## Testing Decisions

- Reuse the user's previously confirmed seam: test externally observable shared workspace UI through existing public interactions and host-action boundaries with realistic, isolated fixtures. Tests assert what users can see and do, preserved state and truthful callback outcomes, not DOM nesting, CSS classes or exact pixel snapshots. Extend existing workspace navigation, Clip details, dialog focus, settings and recovery prior art; prefer the current high-level seam to new production APIs.
- Capture comparable before/after renders at 1400×900, 768×1024, 390×844, 340×600 and project-supported short/narrow extremes in dark and light appearances. Include populated, empty, no-match, error, long-content and expanded-filter cases; History, details, Devices, Settings, Requests and host-specific states. Compare first-row position, density, header height, available content width, readable type and action visibility, with the review as baseline. Responsive and accessibility requirements take precedence over pixel-perfect imitation.
- Verify navigation to and from History, preserving search/filter/draft/scroll state; copy/pin via fixture callbacks; detail close/focus/feedback; device and settings state and recovery; and keyboard, touch-friendly targets, enlarged text, reduced motion, contrast and screen headings. Ensure History actions are not mistakenly invoked by a destination transition.
- Test the actual Electron, Android and Chrome applications through the established safe application UI boundaries where available, in addition to the fixture-backed shared UI. Record host, build, revision, screenshot provenance and native versus browser status; do not claim real native or extension-popup coverage from a simulated host stylesheet.
- **User test boundary:** do not run connection tests or tests that send Clips. Use isolated controlled fixtures for connection states and action presentation, and avoid real system clipboard access or profile/network startup unless an existing safe test boundary proves it cannot connect or send. Verify labels and callbacks without exercising real network or Clip delivery.
- Run relevant targeted checks and appropriate repository verification that respects the test boundary; record excluded tests and any baseline failures explicitly. Review the inspector's visible results and zero/failure states; do not present a source lint count as proof that every flagged style is active. This specification itself makes no implementation or native acceptance claim.

## Out of Scope

- Protocol, Relay, Device Network, identity, storage, clipboard capture or sharing-policy changes; changes to the Relay repository.
- Removal of supported actions, technical metadata, error recovery, safety confirmations or host-specific controls solely to imitate the mockup.
- Connection tests, tests that send Clips, forced transfer and unsafe use of real clipboard or persisted profiles.
- Treating synthetic examples or mockup-only interactions as product data, changing installed application icons, publishing, pushing or deploying.

## Further Notes

The [visual review](review.md) preserves the inspected revision, fixture provenance, measurements, screenshot links and limits. The mockup is the approved style and interaction reference, not a pixel-exact production specification or evidence of working backends. The implementation thread reported production asset builds and controlled screenshots but did not launch native shells; its broad check also encountered pre-existing Android type errors. Re-establish actual current status and applicable verification during implementation rather than assuming those reports remain current.
