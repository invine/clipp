# Dedicated Relays destination

Status: implemented (PR #54, merge `5092167`)

## Problem Statement

A person managing how their devices reach one another currently has to find relay configuration inside Settings. Relay status, the action needed to recover a relay and management controls are harder to discover than the Devices destination. The layout also needs to work in Clipp's desktop, tablet and phone-sized surfaces.

## Solution

Give Relays its own first-class destination in the shared Clipp workspace. Place its title and Add relay action in the workspace header, following Devices. Present a short status card and a separate Configured relays card. The destination moves the existing relay management capability out of Settings and keeps its real behavior, error handling and runtime support. The confirmed mockup is the visual reference, with the qualifications in this specification for sample content and preview controls.

## User Stories

1. As a Clipp user, I want to open Relays directly from navigation, so that relay management is easy to find.
2. As a Clipp user, I want the selected destination to be clear, so that I know I am managing relays rather than devices or general settings.
3. As a Clipp user, I want the Relays title in the workspace header, so that the page follows the Devices screen.
4. As a Clipp user, I want Add relay in that header, so that I can start configuration without looking through Settings.
5. As a new user, I want an honest empty relay list and a clear way to add one, so that I can configure my first relay.
6. As a user with configured relays, I want an at-a-glance status card, so that I can see whether any require attention.
7. As a user, I want the summary to reflect current observed states, so that it does not imply readiness when state is unknown or still connecting.
8. As a user, I want the summary and individual relay list in separate cards, so that overview and detail are easy to distinguish.
9. As a user, I want to see each relay's name, type, endpoint or identity and status, so that I can identify and manage the intended configuration.
10. As a user, I want long names, URLs, Peer IDs and multiaddrs to remain usable, so that they do not break narrow layouts or identify the wrong relay.
11. As a user, I want to add an authenticated-discovery relay, so that I can use a managed service.
12. As a user, I want to add an unauthenticated Peer ID relay and its complete addresses, so that I can use an explicit configuration.
13. As a user, I want the correct fields and validation for each relay type, so that I can correct invalid input before saving.
14. As a user, I want to edit a relay, so that I can update its local configuration.
15. As a user, I want to remove a relay with the existing removal semantics, so that I can stop using that local configuration knowingly.
16. As a user, I want the relay account management action when available, so that I can manage a managed service.
17. As a user, I want a login action when authentication is needed, so that I can restore service.
18. As a user, I want a retry action when the existing relay state allows it, so that I can recover a failed or degraded relay.
19. As a user, I want to see connecting, retrying, degraded, refused and conflict states distinctly, so that I understand what is happening.
20. As a user, I want warnings and reasons to remain visible, so that a short status does not hide actionable details.
21. As a user, I want pending actions and save results communicated, so that I know whether an operation completed.
22. As a user, I want an uncertain or rejected mutation to retain the existing recovery path, so that I do not assume a change succeeded.
23. As a user, I want refresh and recovery controls where needed, so that I can reconcile the displayed configuration with authoritative state.
24. As a user, I want my editor draft and task context preserved under the existing navigation and interruption rules, so that moving the screen does not discard work.
25. As a user, I want relay recovery links to open the new destination, so that a reported issue leads to the relevant controls.
26. As a user returning through an existing relay-settings handoff, I want to reach Relays, so that prior navigation entry points continue to work.
27. As a desktop user, I want navigation and relay details to fit the available workspace, so that I can scan and act efficiently.
28. As a tablet user, I want the existing compact navigation pattern and readable relay columns, so that I can manage relays without horizontal page scrolling.
29. As a phone user, I want the Clipp icon to open navigation and relay details to reflow into rows, so that controls remain legible and reachable.
30. As a keyboard or assistive-technology user, I want named controls, visible focus and announced status, so that I can complete the same tasks without a pointer.
31. As a user of Electron, Android or the extension, I want the same destination wherever the runtime exposes relay management, so that my workflow is consistent.
32. As a user, I want each relay configuration to remain independent and existing connectivity policies unchanged, so that this navigation change does not alter how my devices connect.

## Implementation Decisions

### Visual guide

The approved reference is the self-contained [interactive mockup](visual-guide/index.html) and these final captures: [desktop, 1440 px](visual-guide/desktop.jpg), [tablet, 768 px](visual-guide/tablet.jpg), and [phone, 390 px](visual-guide/phone.jpg). Use the current shared Devices screen's actual shell, theme tokens, dimensions, typography, navigation icon and controls where they differ from the illustrative standalone shell. Match the layout relationships, visual hierarchy, spacing and responsive behavior, not a screenshot's sample values or fixed page height.

- Header: a single Relays title and Add relay primary action, in the same header positions and style convention as Devices. There is no duplicate in-content title, and no “Manage the relays this device can use to reach your other devices” introductory sentence.
- Content: a compact, distinct status card first; a separate card titled **Configured relays** second. Do not restore the “Relays are configured on this device” subline or the “Direct connections remain available…” summary sentence. Keep the heading, which the user explicitly restored.
- The relay card contains actual configurations, including identifying information, type, state and available actions. The mockup's About relays content may remain below the cards, subject to accurate existing behavior; its local-removal explanation must not be lost.
- The mockup's “Show empty state” toggle, example relay names and example URLs are design-preview devices, not production controls or seeded configuration. Empty is the normal initial state on every runtime.
- Use the product's existing Clipp icon in compact navigation, not the literal “Menu” text. The icon remains a properly named navigation button.
- The mockup's hard-coded status examples are illustrative. Render real runtime observations and actual actions; the interactive mockup is not a functional or accessibility specification.

### Responsive layout

- Desktop: keep the normal workspace navigation visible and put the title and Add relay action in its header. Status and list cards align to the same content edges; table-like columns can be used where space permits.
- Tablet: fold navigation to the existing Clipp icon control as on Devices; keep title and Add relay accessible in the header. Retain readable identifying information, type, status and actions, allowing columns to reflow when required.
- Phone: keep the Clipp icon, title and Add relay action reachable in the header; stack cards and reflow each relay into a compact multi-line row. Preserve relay identity, type, status and access to every applicable action. No page-level horizontal scrolling or clipped controls. Long values wrap, truncate with an accessible full value, or open an existing detail mechanism; they must not obscure identity or make different relays indistinguishable.
- Follow existing theme and host geometry for light/dark appearance and all runtime surfaces. Respect reduced motion and existing focus conventions; use accessible labels, keyboard operation, focus restoration, status announcements and touch targets consistent with the Devices screen.

### Navigation and existing behavior

- Add a first-class Relays destination to shared navigation, session destination state, validated host handoffs and focus/return handling. Place it with the other top-level destinations, as in the confirmed mockup. Remove the relay management panel and relay category from visible Settings navigation, avoiding duplicate controls.
- Route relay-related recovery, notification/task return and other in-app entry points to Relays. Preserve compatibility for existing valid relay-settings destination handoffs by resolving them to the new destination; do not leave a stale Settings category as the visible endpoint. Keep validation strict for unrelated malformed destinations.
- Preserve existing task lifecycle: add/edit drafts, unsaved work, pending operations, dismissal, cancellation, focus origin and return after interruptions must work under the same session rules. A migration of navigation must not silently discard a relay edit or cause a duplicate operation.
- Keep shared UI behavior in the shared UI and continue using each runtime's existing adapter and action capabilities. Update runtime bridges only if their action or navigation surface requires it; do not assume all hosts expose identical optional actions. Where the legacy relay-address surface is used, retain its supported add, edit, remove, validation and status behavior on the new destination.
- Preserve runtime configuration and credentials, persistence, optional host capabilities and current selection. This is a presentation/navigation change, not a data migration. Removing a managed relay retains its current local-configuration, resource and credential cleanup semantics and does not claim to delete the account or other routes.

### Relay states and actions

- Derive the card from the current configurations and associated runtime states, not hard-coded example counts. Count only observed ready states as ready; do not call missing or connecting state ready. Clearly account for connecting/retrying separately from states requiring attention, and keep unknown/unreported state distinguishable rather than silently omitting it. Counts must reconcile with the list as observations update.
- Preserve the existing user-visible managed states: connecting, login needed, ready, degraded, relay limit reached, retrying and Peer ID conflict, including available reason and warning text. Preserve corresponding legacy address connection states when that adapter is in use.
- Keep existing actions available under their existing capability and state conditions: add, edit, remove, managed login, manage account, retry and refresh/recovery. Each row's primary next action may be promoted as in the example, but secondary actions must remain reachable for every applicable relay, including one needing login, at every size.
- Preserve editor fields and validation for authenticated discovery and explicit Peer ID configurations, including complete multiaddrs, and all existing feedback for applied, pending, rejected, partial or unconfirmed results. Do not claim success, change live state, or clear a draft until the existing authority confirms the relevant outcome.
- Continue to honor the accepted transport policy: one retained usable authenticated connection per configuration, bounded fallback across supported transports, independent configurations, and existing authentication, quota, retry and cleanup rules. No UI summary should suggest that a relay session guarantees a Relayed Connection or Clip delivery.

## Testing Decisions

The user confirmed the existing shared UI runtime-adapter and browser-test seam as the primary acceptance boundary. Test observable outcomes and requested effects, not CSS implementation, component internals or exact DOM nesting. Reuse the existing scripted workspace and relay-management browser scenarios and their adapter/effect-recording facilities; add lower-level tests only when a behavior cannot be observed reliably at the shared seam. Runtime-specific tests/checks are warranted only where navigation, action capabilities or bridge wiring differ.

- From each responsive layout, navigate to Relays, verify selected state and header action, and verify Settings no longer presents a duplicate relay panel. Confirm the icon opens compact navigation and keyboard focus can return correctly.
- Cover empty initial state, multiple configurations, mixed ready/attention/pending/unknown states, changing observations, accurate counts, long identifiers and responsive action access. Exercise phone, tablet and desktop widths and both supported themes; verify no page overflow or inaccessible controls.
- Exercise both configuration types and applicable legacy address management through add, validation, edit, remove and the authoritative result. Cover login, account, retry and refresh where supplied; ensure unavailable actions are not offered. Preserve warnings, pending, failure and unconfirmed recovery behavior.
- Cover opening recovery and older relay-settings handoffs, notification/task return, navigation with an in-progress draft, dismiss/cancel and focus restoration. Verify actions remain associated with the intended relay when observations change.
- Reuse existing runtime-adapter coverage for Electron, Android and extension; add bridge tests only where the actual surface changes. Shared browser tests do not by themselves prove native or forced relay transfer acceptance.
- Run project verification appropriate to the final change, including existing relay management and shared UI browser suites and runtime builds. Follow project operations for broader verification and `npm run check` before a code commit. Record any native acceptance not run rather than implying it passed.

## Out of Scope

- Changing relay transport selection, session concurrency, authentication, credentials, backend APIs, schemas, quota policy, data persistence or device membership.
- Adding a relay service, account, telemetry, new seeded relay, or a production mock-data/empty-state switch.
- Redesigning unrelated destinations or asserting that the mockup's example statuses are real.

## Further Notes

The mockup was confirmed on 2026-11-10 after the header, card, restored heading and compact Clipp icon revisions. Its sample relay names and addresses are fictional. The final captures are visual references, not evidence of production behavior. The desktop inspector reported open space beneath the short sample content; this is a consequence of showing two configurations rather than a requirement to invent content. The first implementation should validate long lists and action menus in real runtime contexts.
