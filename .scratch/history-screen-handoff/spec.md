# History screen and shared navigation handoff

Status: ready-for-agent

## Problem Statement

History gives icons and filters too much of the available screen, making Clip content difficult to scan, especially on mobile. The time filter adds little value. The menu control does not carry Clipp's identity, connection status is not sufficiently clear, and Pinned Clips and row actions take unnecessary space. Users need a visually consistent, compact view while keeping existing Clip operations and device connectivity understandable and reliable.

## Solution

Implement the final, approved interactive History design using real application data and existing behavior. Give the content most of each row; show Copy and Delete as the only row action icons and open remaining supported Clip actions from the Clip details dialog. Keep the useful filters collapsible and remove time filtering. Use the Clipp icon as the navigation control on every tab. Show the existing connection-specific glyphs in state colors, with Direct and Relayed Connections both green, and expose an understandable status summary and a path to Devices.

## User Stories

1. As a Clipp user, I want Clip contents to occupy most of each row, so that I can identify the Clip quickly.
2. As a mobile user, I want a compact two-line History row, so that I can see more Clips without scrolling.
3. As a user, I want text Clips without a repeated text icon, so that the common case wastes less space.
4. As a user, I want a subtle link icon on link Clips, so that I can distinguish links at a glance.
5. As a user, I want long Clip previews to wrap or truncate neatly, so that they do not obscure other rows.
6. As a user, I want full Clip content in details, so that truncation never hides information permanently.
7. As a user, I want the source and capture time shown beneath the content, so that I can recognize when and where a Clip came from.
8. As a user, I want a small pin symbol for a Pinned Clip, so that I can recognize it without a word repeated in the list.
9. As a user, I want a Copy icon directly on each row, so that I can reuse a Clip in one action.
10. As a user, I want a Delete icon directly on each row, so that I can remove a Clip without opening details.
11. As a user, I want copy and deletion to act on the chosen Clip, so that an adjacent row is never affected.
12. As a user, I want clear pending, success and failure feedback, so that I know whether my action completed.
13. As a user, I want failed Clip actions to retain their recovery options, so that I can retry without losing context.
14. As a user, I want to open Clip details by selecting its content, so that I can inspect it before acting.
15. As a user, I want to pin and unpin in Clip details, so that the row remains compact.
16. As a user, I want existing supported actions and metadata in Clip details, so that the redesign does not remove capabilities.
17. As a user, I want the Pinned view and pin marker to update together, so that I can trust what is shown.
18. As a user, I want to close Clip details and return to my list position, so that I can continue browsing.
19. As a keyboard user, I want focus moved into the dialog and returned when it closes, so that I do not lose my place.
20. As a user, I want to search History, so that I can locate a Clip by content.
21. As a user, I want All, Pinned and Links filters, so that I can narrow the list by Clip type or state.
22. As a user, I want the Source filter retained, so that I can find Clips from a device or source.
23. As a user, I want to fold and unfold the filter area, so that I can prioritize content when filters are not needed.
24. As a user, I want active filters to stay selected when folded, so that collapsing them does not alter my results.
25. As a user, I want time filtering removed, so that an unused control no longer consumes space or filters my results.
26. As a user, I want an informative empty or no-match state, so that I know why no Clips are visible.
27. As a user, I want no redundant History heading, subtitle, “Recent clips” label or count, so that the list starts higher.
28. As a user, I want the Clipp icon to open navigation, so that the app is identifiable and navigation remains reachable.
29. As a user on any tab, I want the same Clipp navigation control, so that moving between History, Devices, Requests and Settings feels consistent.
30. As a user, I want navigation to keep its existing destinations, so that I do not lose access to app functions.
31. As a user, I want a green connection glyph for both Direct and Relayed Connections, so that both successful paths read as connected.
32. As a user, I want different connection glyphs for different situations, so that the connection path and problems remain distinguishable.
33. As a user, I want connection meaning described in text as well as color, so that I can understand it without color vision.
34. As a user, I want to open a connection summary and reach Devices from it, so that I can investigate connectivity.
35. As a user, I want unknown, offline and attention states to be truthful, so that the app does not claim a connection it cannot verify.
36. As a user, I want Trusted Devices to remain trusted when offline, so that temporary reachability is not mistaken for revocation.
37. As an Electron user, I want the same shared History design, so that desktop remains consistent.
38. As an Android user, I want accessible touch targets and a responsive view, so that History works on my phone.
39. As a Chrome extension user, I want the design to fit the popup, so that controls and Clips remain usable in a narrow surface.
40. As a user of light or system theme, I want a usable corresponding presentation, so that the redesign respects my preference.
41. As a user of assistive technology, I want controls and status named and announced, so that icon-only actions remain understandable.
42. As a user, I want existing sharing and recovery controls preserved, so that visual changes do not alter what my device does.
43. As a reviewer, I want matching reference screenshots and a live reference, so that I can assess visual fidelity across widths.

## Implementation Decisions

### Visual reference and fidelity

The authoritative design reference is the preserved [interactive preview](reference/index.html), also available as the [published History preview](https://clipp-history-preview.attentivemarmot.chatgpt.site). The local snapshot is stable if the hosted Site changes. Review the unscaled screen at each actual viewport; the preview's outer size selector and its preview-only status selector are review tools and must not ship as product controls. Sample Clips, timestamps, devices and states are fixtures, not real data.

| Target | Reference | Comparison viewport |
| --- | --- | --- |
| Phone, expanded filters | [Phone](reference/phone.png) | 390 × 844 CSS px |
| Tablet | [Tablet](reference/tablet.png) | 768 × 900 CSS px |
| Desktop | [Desktop](reference/desktop.png) | 1200 × 900 CSS px |
| Extension-sized | [Popup](reference/popup.png) | 340 × 600 CSS px |
| Folded filters | [Phone, folded](reference/filters-folded.png) | 390 × 844 CSS px |
| Clip details | [Phone details](reference/clip-details.png) | 390 × 844 CSS px |
| Relayed status | [Phone relay](reference/relay-status.png) | 390 × 844 CSS px; preview selector is not product UI |

Use the same fixtures, dark theme, viewport, device scale and scroll position for pixel-level review. Match the rendered reference's geometry, row density, alignments, icon shapes and sizes, type hierarchy, surfaces, borders and colors as closely as the host allows. Compare the full screenshot and inspect controls and states, not just a single crop. A literal universal 100% pixel match cannot be guaranteed across native fonts, operating systems, system UI and host viewports: record measured differences and their causes, and do not silently call an unreviewed approximation exact. Preserve accessibility and actual functionality when the prototype omits them. Light/system theme must remain usable using existing theme tokens; the dark reference does not specify a new light palette.

Reference guide in CSS pixels: dark ground `#111113`, raised search `#222226`, primary text `#f2f1f4`, muted text `#a4a2aa`, subtle separators `#303034` and `#262629`; system UI type, 15 px Clip text and 12 px metadata. Mobile toolbar 64 px, horizontal outer margins 18 px, 32 px brand mark, 40 px search field, two 40 × 44 px row action targets, 14 px vertical row-content padding, and a two-line Clip preview. At wider widths use the reference's 68 px header, centered maximum 960 px content region with 32 px inner horizontal padding, 34 px mark, 42 px search field and 42 × 44 px row action targets. Reconcile these figures with the rendered snapshots and existing accessible hit-target requirements; do not shrink touch targets to the visible glyph. Reference offsets, wrapping and typography are more important than copying unused prototype CSS. No History heading, explanatory subtitle, Recent clips label or clip count.

### Shared shell and navigation

Use the existing Clipp mark as the interactive navigation trigger wherever a hamburger/menu trigger is shown, in every tab and applicable runtime, not only History. It replaces the menu glyph, not the installed app icon or the destination's identity. The mark is a real button with an accessible name such as “Open navigation”; retain expanded state, keyboard operation, close/Escape behavior, destination selection, focus return and existing desktop/narrow layout rules. Do not remove navigation, Requests, Settings, device management or host-specific entry points. Avoid a duplicate adjacent mark or menu glyph.

### Filters, search and navigation

The top bar retains search, a filter toggle and connection control. The filter toggle folds/unfolds the entire All / Pinned / Links and Source row, with an accessible name, expanded state and relationship to its panel. Keep current responsive defaults and user-toggle behavior where feasible; folding must not reset the query, filter selection, Source or scroll state. Expanded tabs retain selection, and Source includes the current real options (All, local, remote and actual devices where supported). Search, filters, empty results and reset operate together. Remove the time-filter control **and its effect on the list**: a previously selected stored/session time range must not invisibly restrict History. Retire or normalize obsolete state safely; this does not alter History retention or Clip Sharing Lifetime settings. Preserve supported current-system-clipboard Send and other real controls even where the simplified mockup omits them; label them so they do not imply sending the selected Clip.

### History rows and actions

Render real Clips in their existing ordering. Content is the visual lead; text has no repeated type icon and links have the small link glyph. Use a compact neutral pin symbol on Pinned Clips rather than the word “Pinned”; it communicates state and is not an additional row action. Below the content, show real source name or an appropriate truthful fallback, plus captured time. Preserve access to meaningful source, type, local/remote and technical metadata through Clip details even when removed from the compact row. Wrap/truncate safely for long text, URLs, line breaks, emoji and long unbroken identifiers.

The only per-row action buttons are Copy and Delete, visually and spatially matching the reference; eliminate the row Pin button and overflow menu. The content area opens details, and neither action opens it accidentally. Use the existing Clip action and Local Clip Deletion paths, their busy/disabled handling, error/retry behavior, feedback and focus/scroll restoration. Delete must retain its established local deletion and suppression semantics; do not introduce an unrelated deletion confirmation or change replication policy merely to match the mockup. Maintain accessibility names, association with the relevant Clip and keyboard operation. Deleting a Clip that is open or otherwise unavailable must leave a coherent recoverable UI.

### Clip details and action behavior

Open the existing accessible Clip details task/dialog from the content, with content first and real source/time, type and technical metadata available. Keep Copy, Pin/Unpin, Delete and all other existing supported actions and recovery in this dialog; the simplified prototype's button list is not permission to remove existing functionality. Preserve accurate current-system-clipboard Send semantics. Show actual pin state, update the list and Pinned filter when it changes, handle pending/retry/failure, trap and restore focus, support Escape/back, and retain History scroll and selection context. Match the reference for primary content and visual hierarchy while retaining required controls and metadata.

### Connection status

Reuse the existing aggregate connection projection, state precedence and status-specific glyphs. Apply color to the glyph itself, with no separate status dot in the toolbar. Direct and Relayed Connection are green (`#22c55e` in the dark reference); attention is amber (`#eab34e`); waiting uses the reference's muted violet (`#b5a7f2`); unknown, starting, idle and offline use neutral muted gray (`#929198`). Preserve the existing distinct shapes: direct triangle, relay diamond, attention exclamation, unknown question mark, offline crossed network, and dashed network for starting/waiting/idle. The state label and actual facts, not color or fabricated fixture data, convey the distinction. The “preview status” selector is never part of the app.

Activating the control opens an accessible, dismissible summary with the truthful projected label and a route to Devices, as agreed in the design discussion. It must not claim devices are connected when only a relay is ready, nor confuse a Relay Session with a Relayed Connection. Preserve existing recovery indications and paths; attention must not be concealed by a healthy path. The mockup's brief explanatory copy is illustrative, not a new network-state derivation. Keep current projection precedence and the accepted one-session fallback policy in ADR-0012; no network, transport or trust changes are authorized.

### Boundaries and compatibility

Use shared UI for common presentation and interaction, shared core for any genuinely cross-runtime behavior, and existing host bridges for actual actions. Check Electron, Chrome extension and Android integration, updating a bridge only if an action surface actually changes. Preserve background/offscreen extension ownership, Electron CommonJS/relative import constraints, empty initial managed-relay settings, and existing per-runtime capabilities and limitations. Do not create new APIs or storage migrations solely for this restyle; if one becomes necessary, document and review its impact before implementation. This spec supersedes earlier workspace instructions to retain the History time filter and row pin action; other accepted workspace/UX decisions and runtime acceptance gates continue to apply.

## Testing Decisions

- Prefer the existing public shared UI/user-session integration seam and realistic fixture-backed host callbacks. A good test exercises observable user behavior, accessible names, effects and recovery, rather than implementation internals or CSS selectors as the contract. Existing History mutation, workspace navigation, dialog focus and device-management harnesses are prior art. This handoff proposes that seam; it has not been separately confirmed by the user.
- Cover real row Copy/Delete targeting, non-opening of details by row actions, real success/pending/failure/retry, Pinned Clip markers, pin/unpin and filtered-list updates, and dialog metadata and focus restoration. Verify local deletion suppression through the existing domain/host tests rather than a fake UI-only success.
- Cover search combined with Source and All/Pinned/Links, fold/unfold with state preserved, and a formerly active time range no longer silently restricting History. Test no Clips, no matches, loading, unavailable and recovery states.
- Drive each of the eight projected connection states, including direct plus an attention issue, and verify appropriate shape, visible icon color, accessible text, summary and Devices navigation. Check unknown/offline are not presented as connected and that Trust is not inferred from reachability.
- Test navigation via the Clipp icon on History, Devices, Requests and Settings wherever that destination exists, including keyboard, focus and narrow layouts. Check that non-History controls and host-specific routes survive.
- Capture actual app screenshots at the four reference sizes using the same fixtures, theme, device scale and scroll position. Compare against the preserved images, inspect differences and document concrete residual mismatches. Also inspect the folded filter, detail, long-content and connection states and exercise light/system themes, touch targets, reduced motion and no horizontal page overflow.
- Run appropriate existing UI and runtime checks and the repository verification profile. Verify actual Electron, extension and Android behavior using established acceptance procedures for affected surfaces; a static web mockup or build does not prove native interactions. Run `npm run check` before any code commit. Record any unavailable native gate rather than claiming it passed.

## Out of Scope

- Implementing app code, shipping or deployment as part of this specification handoff.
- New transport, relay, synchronization, trust, clipboard storage, retention or deletion policy.
- Replacing installed OS application icons or changing the Device page design beyond the shared navigation control and agreed status presentation.
- Shipping fake preview data, the preview-size selector, or the manual status selector.
- Removing existing supported actions, error/recovery paths, accessibility or runtime-specific capabilities merely because the mockup omits them.

## Further Notes

The sample History reference is design evidence, not a source of real Clip data. The wider size buttons in the preview are a review convenience: they simulate responsive widths and are not required product UI. Use the exact user-facing source and timestamp conventions supported by each runtime, and capture comparable fixtures before judging visual differences.

The user has approved the mockup direction through the conversation; this is an implementation handoff, not proof of implemented behavior, accepted runtime testing, or authorization for a deployment. Coordinate against a newly established feature integration checkout and current project records before starting work.
