# Decide visual consistency and efficient layout

Type: grilling
Labels: wayfinder:grilling
Mode: HITL
Status: resolved
Assignee: Codex (current session, 2026-10-09)
Parent: [Clipp cross-runtime UX study](../map.md)
Blocked by: 03, 04, 05, 09, 10, 11, 12

## Question

Which common styling rules and runtime-specific layouts best address the observed inconsistency, overflow, control organization and excessive space use?

Use grilling and domain-modeling with the user, grounded in screenshots and measured task/space costs. Compare all four web surfaces and their native wrappers. Settle shared typography, color/theme, spacing, buttons/fields, notices and destructive-action treatment; separate genuine platform requirements from accidental divergence.

Assess information hierarchy, grouping of frequent and advanced controls, navigation and settings placement, status/diagnostic prominence, history-card density, repeated headings/labels, wide-screen use, responsive transitions and dialog/scroll ownership. Include keyboard and touch use, loading/error/empty states, long content and enlarged text so compactness does not depend on hiding critical actions.

Return rationale and acceptance criteria for each recommended change, with remaining alternatives stated honestly. If screenshots cannot settle a layout choice, create a focused prototype child ticket and wire it before resolution instead of inventing the user's preference. A selected direction does not authorize implementation.

## Comments

2026-10-08 claim: this is the first open, unblocked, unclaimed frontier after the user asked to proceed. Android observation is resolved with explicit follow-up gaps. The controls ticket remains claimed with its second decision round unanswered; do not infer answers from this request to advance. Its accepted first-round choices constrain this layout discussion: shared theme selection, quick Chrome popup plus complete full-page management, removal of the duplicate relay tray command, and advanced identity reset. Independent layout choices may proceed while the remaining control semantics stay open.

2026-10-08 graduated layout question: existing screenshots establish defects but cannot choose between a compact list, list/detail workspace and adaptive card structure. [Compare history density and navigation](09-compare-history-density-and-navigation.md) now owns that concrete comparison. Its prototype uses synthetic data and has no production mutation connection. This layout ticket waits for that choice before final resolution; the accepted shared styling/adapted layouts preference remains unchanged.

2026-10-07: [Electron observations](../electron-observations.md) and the [gallery](../electron-evidence/index.html) quantify two/three complete Clips at minimum/default, stretched fullscreen grid tracks, routine preferences behind 2814px of dense drawer content, mixed browser-default/custom controls, broken recovery-banner rows, lost drafts across the sidebar boundary and 320px reflow failure. Essential icons also fail when the external font is unavailable. Long relay actions wrapped successfully; avoid inventing a relay-button overflow defect. Use native replacement screenshots for zoom, and ancestor-clipped card counts rather than the early raw counter. Chrome and Android still block resolution.

2026-10-07: [The source inventory](../flow-control-inventory.md#findings-to-carry-into-decisions) identifies the compact search/navigation gaps, terminology/status mismatches, independent options styling, fixed card/list/drawer dimensions and stacked diagnostics/notices. Use the [measurement schedule](../inventory-fixtures.md#viewport-and-interaction-schedule) to quantify these before choosing a layout. Fullscreen density and native clipping have not yet been observed.

2026-10-07: [Chrome observations](../extension-observations.md) and [gallery](../extension-evidence/index.html) confirm a real 480×600 popup with one complete Clip, a 3079px dense drawer, options Settings at y=2276, missing relay styles, 2118px document width from a long name at 480px, low-contrast fields/dark cards, broken notice rows and keyboard navigation gaps. Popup drawer/history scrolling and relay-action wrapping work. The 800px HTML request alone does not establish inaccessible bottom controls. Typical options reflows at 320px and remains reachable at 200% tab zoom; use the direct-CDP replacement captures. Physical display changes, independent popup scaling and display-filling fullscreen remain gaps. Android still blocks this decision.

2026-10-08: [Android observations](../android-observations.md) and [gallery](../android-evidence/index.html) establish native bar/IME overlap, actual 200% text overflowing fixed cards, Pairing diagnostics adding 212px above a full-height shell, a 3248px dense drawer, 320px horizontal history overflow, initially cropped landscape QR and only 58px of history in an actual 340×350 freeform window. The settled 1200×800 view displays all nine short Clips; long relay actions wrap successfully. Use the shared styling/adapted layout preference to address the measured failures without treating every platform difference or expanded layout as defective. Android closure still awaits its native coverage decision.

### 2026-10-08 human decision round — original recommendations (superseded below)

- **L1, history structure:** [Compare history density and navigation](09-compare-history-density-and-navigation.md) presents A compact rows, B list/detail and C adaptive cards. Recommended synthesis: rows by default, with a full-content pane on selection in wide windows. That ticket owns the verdict.
- **L2, organization:** recommend separate History, Devices and Settings, left navigation wide and labelled compact navigation; keep daily preferences ahead of advanced connections, identity and diagnostics. Alternative: retain one combined drawer with better grouping. Chrome popup keeps a visible route into full-page management, consistent with its already accepted surface role.
- **L3, visual tone:** recommend retaining violet branding with quieter solid surfaces, shared typography/fields, local icons and purposeful status/action colors. Alternative: retain prominent gradients/decorative cards. Native OS dialogs remain native.

The [prototype notes](../layout-prototype/README.md) explain scope, fixture counts and simulation limits. These are recommendations, not recorded user answers. The unanswered controls round remains owned by its ticket and is not settled by choosing a layout.

### Proposed acceptance baseline for the eventual direction

1. Use one shared semantic set for text, surfaces, actions, fields, borders, status and focus across Electron, Android, popup and full-page Chrome. Provide System/Light/Dark as already selected. Load essential icons locally; no external font request may determine whether a control is recognizable. Keep routine body text and metadata readable instead of achieving density through tiny fonts.
2. Size rows, cards, buttons, notices and forms from content. Long names, IDs and endpoints wrap or truncate only with a reachable full-value route. Text actions never use fixed icon-button boxes. State what is connected, what Auto Sync does and what succeeded without inventing a delivery receipt.
3. Keep search and active-filter clearing reachable at every supported width. Group secondary filters without hiding the current scope. Give Copy and the primary task direct access, and keep destructive global actions visually separate from local filters. The final confirmation policy stays with the controls decision.
4. Use a single owner for each content scroller. Follow the selected history structure from the comparison ticket; use on-demand full-content inspection, and never stretch grid rows to fill empty height. At short heights or large text, let necessary content scroll instead of reserving almost the whole window for fixed headers. Preserve drafts, selected Clip, query and focus through responsive transitions.
5. Stack actionable notices in content flow, with complete text and actions. Keep Pairing errors near their task; expand technical diagnostics on demand within the available height. Show a short, honest background-continuity summary before optional technical detail. Do not place a fixed-height app below a separate diagnostic block.
6. Keep modal/form headers, content and actions within the available window; allow content scrolling and keyboard-safe action placement. Return focus after dismissal and specify layered Escape/Android Back behavior. The wrapper supplies real status/navigation/cutout/IME insets; the prototype's padding is not proof of native correctness.
7. Verify 320px reflow, default/intermediate/200% text, long content, empty versus no-match states, concurrent notices and settings errors. Verify no lost controls or two-axis history scrolling; meet the existing contrast, keyboard/focus and touch/pointer criteria in [platform constraints](../platform-constraints.md). Prefer 48dp Android hit targets without requiring the same visible button size on every runtime.
8. Repeat actual native window/popup/IME/scaling checks for implementation. Sample restored, maximized/fullscreen and short windows, popup 480×600, wide management, Android phone/tablet and boundary transitions. Retained native coverage gaps stay explicit; browser prototype renders are never release qualification.

### 2026-10-08 user feedback — revised direction

The user rejected B, selected A for narrow sizes plus C's multi-column history for wide sizes, rejected A's wide sidebar and C's unequal card heights, and required the Share now / Filters / All / Pinned / Search controls to occupy much less space. [Compare history density and navigation](09-compare-history-density-and-navigation.md#answer) owns the direction and its revised demonstration. The earlier A+B recommendation and wide-left-navigation proposal are superseded.

The revised prototype uses header navigation wide and labelled bottom navigation narrow as a concrete interpretation of the no-sidebar constraint. This does not record an additional explicit user choice about all Devices/Settings organization. L3 visual tone, final typography/token treatment, management grouping and relevant responsive acceptance details remain to settle in this ticket. The controls ticket's unanswered second round is unchanged.

### 2026-10-08 narrow toolbar refinement — proposals, no selection yet

The user finds D's narrow top area improved but still too large and heavy, and asked to think through ideas before another revision. The selected row/grid structure remains intact. The current narrow layout still has three bands: branding/Auto Sync, Search/Filters, and All/Pinned/Share now. The 360×720 fixture starts history at y=195, including a 24px simulated native inset.

Propose three alternatives without modifying the prototype yet:

1. **Search first (recommended):** remove the dedicated branding/Auto Sync row. Use one quiet row with an always-visible search field, a Filters affordance inside that field, a labelled Share now action and an overflow menu. All/Pinned move into Filters; the active scope stays visible and clearable in the search/filter area. Auto Sync is available in the overflow menu; when off, show a visible, actionable off state. This minimizes the normal toolbar to one row, but changing scope requires opening Filters.
2. **Keep scope direct:** remove the branding row, retain a search/action row and put All/Pinned beneath as plain text tabs with a restrained selection indicator. Keep large hit areas but remove the segmented outlines, filled pills and competing boxes. Two rows remain; this preserves immediate search and one-tap scope changes.
3. **Browse first:** one row with current scope (All Clips/Pinned) as a dropdown, Search, labelled Share now and overflow. Search temporarily replaces that row with an input when invoked. This makes the default header lighter, but searching takes an extra interaction.

For all options, retain labelled/accessible actions, native-safe insets, adequate hit areas, enlarged-text reflow and explicit actionable error/off states. Lightness should come from fewer persistent controls and less visual enclosure, not tiny targets or low contrast. Full-width search boxes, explicit off-state placement and exact row heights need a subsequent prototype render; no new geometry or usability benefit has been measured. No option is selected and no UI was changed in response to this request for ideas.

### 2026-10-08 requested toolbar comparison

The user asked to prepare options 1 and 3. [Compare lightweight narrow toolbars](10-compare-lightweight-narrow-toolbars.md) now owns the concrete Search first / Browse first comparison. This ticket waits on that verdict. D remains the previous reference; the earlier history structure is still settled and no new toolbar is implicitly approved by preparing it.

### 2026-10-09 continued claim — icon action evaluation

The user selected Search first; [Compare lightweight narrow toolbars](10-compare-lightweight-narrow-toolbars.md#answer) owns that resolution. They now requested evaluation of text buttons that could become icons, especially Share now and Copy. Continue this layout ticket with an action/context inventory, a source-backed check of semantics and a measured estimate of space recovered. Treat icon choices as recommendations until selected; retain labels for consequential or ambiguous actions. Only the toolbar comparison is resolved in this invocation.

2026-10-09 evaluation ready: [Evaluate text buttons for icon treatment](../button-icon-evaluation.md) records the per-context recommendation and [15-case read-only geometry](../icon-action-evaluation/measurements.json). Recommend Copy on Clips, Send for Share now with an explicit current-clipboard explanation, Close, Clear query and edits directly beside values as icon candidates. Retain words for navigation, setting states, setup/recovery, ambiguous copy targets and consequential actions. The phone default-size width estimates are +31.33px for Search and +9.02px per row; icon replacement alone does not shorten its 48px toolbar. No icon variant was rendered and no discoverability gain is claimed.

Keep Copy / Share now semantics distinct and do not imply delivery with success feedback. The current Pin prototype mixes a changing accessible label with pressed state; choose one valid semantic pattern when revising it. Search first currently lacks an inline clear-query affordance even though Browse first demonstrates it, so the next icon pass should include that reachable ×. No icon change is approved by the toolbar selection. This layout ticket remains claimed.

### 2026-10-09 icon direction accepted and demonstrated

The user replied “I agree” to the icon recommendations and proposed first pass. Accept the policy in [Evaluate text buttons for icon treatment](../button-icon-evaluation.md#agreed-direction): icon-only Copy/Send/Close/Clear search and contextual inline edits; retain words for destinations, state, setup, recovery, ambiguous copy targets and consequential actions. This agreement does not answer the controls ticket's unsettled lifecycle questions or every remaining visual/management choice.

The selected Search first prototype now applies the first pass to narrow and wide history. It also uses stable Pin pressed semantics, hover/focus hints, a temporary Copy check, query clearing with focus return, an empty-state Send explanation and a browser-native Clip dialog for reliable icon Close/Escape behavior. The old text version remains available through `icons=text`; the other layout references retain their old action treatment. The [26-case ledger](../layout-prototype/evidence/icon-actions/measurements.json) and [receipt](../layout-prototype/evidence/review-receipt.json) record successful geometry and interaction checks. The phone Search input gains 31.33px without reducing the 48px toolbar or changing the six complete-Clip count.

This is a study prototype update only. Do not close the entire layout ticket: final visual tone, management organization and the remaining responsive contract still need reconciliation. No separate ticket is resolved in this invocation.

### 2026-10-09 wide scope duplication removed

The user observed: “in wider size All|Pinned control duplicates filters in functionality”. Remove the standalone wide All/Pinned switch from the selected Search first direction. Filters owns that choice at every width. As the concrete prototype treatment, show Pinned only × inline wide only when active, retaining the narrow clearable indicator below the toolbar. Clearing scope preserves the search query; selecting or clearing scope returns focus to the visible Filters control. Reference layouts remain available.

The [focused browser ledger](../layout-prototype/evidence/filter-scope/measurements.json) records 16 captures and 53 passing checks across restored/wide/fullscreen, the 721px boundary at 200% text, tablet and small-phone simulations, and live resizing. Default and pinned restored history both begin at y=114; the active indicator adds no wide toolbar row. No script errors, horizontal overflow, undersized simulated touch targets or menus outside the viewport were detected. The [current receipt](../layout-prototype/evidence/review-receipt.json) distinguishes this focused verification from the prior icon evidence. This refines the current prototype only; this layout ticket remains claimed and the broader unsettled decisions are unchanged.

### 2026-10-09 Delete icon requested for Clip details

The user explicitly requested replacing the details Delete label with an icon. This supersedes the earlier labelled-Delete recommendation for this context. The selected prototype now shows a local trash SVG in danger color, with accessible name and hover/focus hint “Delete Clip”, at the opposite end of the footer from Copy/Pin. Keep other destructive commands and secondary menu entries labelled. The pending deletion-confirmation decision is unchanged.

The [focused evidence](../layout-prototype/evidence/delete-icon/measurements.json) records four successful browser captures: restored desktop, popup, 320px phone and 200% long content in light mode. Targets remain 40px pointer / 48px simulated Android; keyboard focus/hint, dialog and tooltip bounds, and horizontal overflow checks pass. Restore focus hints after the browser scrolls a newly focused footer action into view. No production behavior changed, and this ticket remains claimed.

### 2026-10-09 current History and Clip details design approved

After reviewing the scope consolidation and Delete icon, the user said “ok it looks good now”. Record the current selected Search first History and Clip details presentation as approved: compact rows narrow, equal-height multi-column cards wide, no permanent sidebar, lightweight search/action toolbar, All/Pinned inside Filters with a clearable active indicator, and the demonstrated icon actions including Delete in details. The reviewed visual treatment is accepted for these surfaces; do not reopen these choices without new evidence or user direction.

The [prototype receipt](../layout-prototype/evidence/review-receipt.json) identifies the reviewed source revision and its latest focused evidence. This approval completes the current History/details visual refinement. Continue the broader layout decision with Devices/Settings organization and remaining state/responsive acceptance details. It does not answer the separate control-lifecycle questions or authorize production implementation; the parent layout ticket remains claimed.

### 2026-10-09 continued claim — Devices and Settings frontier

The user requested the next frontier after approval of History/details. Continue this claimed layout ticket with the unresolved Devices/Settings organization question. Check management actions and measured drawer/diagnostic costs before proposing the next decision round. Keep the approved History presentation and the controls ticket's unanswered lifecycle questions intact.

The organization choice now has a concrete comparison in [Compare Devices and Settings organization](11-compare-devices-and-settings-organization.md). This layout ticket waits on that verdict; the approved History design stays settled.

2026-10-09: management organization is settled by the user's selection of M1 Devices + M3 Settings. The requested follow-up is [Explore compact connection status](12-explore-compact-connection-status.md): device path colors/icons and a single compact History indicator. Other control-lifecycle answers remain with their existing ticket.

2026-10-09: [Explore compact connection status](12-explore-compact-connection-status.md#answer) is resolved by explicit user agreement. All listed blockers for this layout ticket are now resolved. Preserve the approved History/details, M1 Devices, M3 Settings and status choices; the remaining layout discussion should reconcile responsive/dialog behavior, state/notice presentation and shared visual acceptance rather than reopen those selections. Control-lifecycle answers remain with their existing ticket.

### 2026-10-09 continued claim — responsive and recovery contract

The user requested the next frontier after connection status was resolved. Continue this claimed layout ticket now that all its blockers are resolved. Scope this round to small/short windows, enlarged text, dialog/scroll behavior, loading/empty/error presentation and final shared styling acceptance. Keep approved History, M1 Devices, M3 Settings, icon actions and S2 status settled. The controls ticket retains its unanswered lifecycle questions. Reuse study evidence and make any remaining product tradeoffs explicit before resolution.

### 2026-10-09 responsive/recovery round prepared — answers pending

The read-only fact review separates correctness from presentation preferences: preserve usable content/drafts, honest error states, safe insets and accessible focus regardless of the selected layout. Existing prototype limits include navigation before content at short heights/enlarged text, inset dialogs that scroll as a whole, no task-level Back stack and inconsistent draft retention on dismissal. No new native tests or product changes were made.

The [responsive layout and recovery contract](../layout-state-contract.md) records the evidence, four independent user choices, recommendations and later acceptance matrix:

- Q1: allow top controls to scroll in cramped layouts (recommended) versus keeping them fixed.
- Q2: full-screen narrow task views, centered desktop dialogs and compact short confirmations (recommended) versus inset dialogs everywhere.
- Q3: one compact background-issue summary with task-local errors (recommended) versus a banner for every problem.
- Q4: keep unfinished editor drafts for the session on Back/Escape/Close, with explicit Cancel/Discard (recommended), versus asking before discarding dirty input.

These answers remain pending. The current prototype continues to show its previously approved design; this draft does not claim it already implements the proposed adaptations. The separate control-lifecycle questions remain unanswered. Keep this ticket claimed until the remaining layout agreement is complete; do not add it to the map's resolved index yet.

## Answer

Resolved 2026-10-09. The user replied “I agree” to the four recommendations and the linked responsive/recovery contract. This completes the remaining layout decision. Earlier exploratory recommendations and pending statements in the chronological comments are superseded by this answer and the linked child resolutions.

The [responsive layout and recovery contract](../layout-state-contract.md) is the accepted detailed artifact, including rationale, evidence pointers and implementation acceptance criteria. The selected direction is:

1. **Shared visual language, adapted layouts.** Extend the approved quiet violet branding, solid surfaces, shared fields, typography roles, focus treatment and local SVG icons across Electron, Chrome popup/full page and Android. Preserve the accepted System/Light/Dark preference. Native OS dialogs remain native. Exact token/breakpoint tuning is implementation work constrained by the recorded contrast, reflow and target criteria.
2. **History and actions.** Keep compact rows narrow and equal-height multi-column cards wide, no permanent sidebar, the Clipp/status line above Search, Search first with Filters/Send, and All/Pinned solely inside Filters with an active clearable indication. Retain the approved icon actions, stable Pin pressed semantics and danger-styled Delete icon in Clip details. The [History structure](09-compare-history-density-and-navigation.md#answer), [toolbar choice](10-compare-lightweight-narrow-toolbars.md#answer) and approved refinements in this ticket own their detailed decisions.
3. **Management and connection status.** Preserve [M1 Devices and M3 Settings](11-compare-devices-and-settings-organization.md#answer) and the [approved S2 connection contract](12-explore-compact-connection-status.md#answer), including text device statuses and partial-problem attention. Do not reintroduce repeated diagnostics or wide sidebars through management changes.
4. **Cramped layouts — Q1 accepted.** Top controls join a page scroller when fixed regions leave too little content space. Keep labelled navigation near the start of the scroller, all destinations reachable, and branding above Search. Ordinary sizes keep the selected layout. Resize/orientation/enlarged text must not reset the current task, query, scope, draft or focus context. Reduce grid columns as needed; do not introduce unequal masonry or shrink hit targets.
5. **Task surfaces — Q2 accepted.** Full-screen task views for Pairing, editing and long Clip details on narrow screens; centered dialogs at comfortable sizes; short confirmations remain compact. Provide explicit Close/Back, one content scroller and reachable actions within actual safe/IME insets. Subtask Back returns to the parent task, Close returns to the page, and keyboard/focus behavior follows the contract. A task dismissal does not cancel a submitted Trust Request or a started destructive operation.
6. **Messages — Q3 accepted.** One compact actionable summary for background problems, details on demand, and field/task errors beside their action. Routine connection state stays in S2. Keep failures that block the active task or threaten local work visibly actionable; do not hide them only in transient feedback. Distinguish loading, first-use empty, pinned-empty, no matches, pending, saved and failed states. Expand technical diagnostics inside the bounded task surface.
7. **Drafts — Q4 accepted.** Back/Escape/Close retains unfinished editor drafts for the current app session. Save applies the edit; explicit Cancel/Discard clears the applicable draft. Retention is not a successful save and does not promise survival after Chrome popup destruction or app restart. Failure and layout changes preserve recoverable input regardless of dismissal policy.

Acceptance must cover 320px reflow, intermediate/200% text, short/landscape/restored/maximized/fullscreen sizes, Chrome popup/full-page limits, long content, simultaneous issues, focus/keyboard and actual Android safe-area/IME/Back behavior. Existing browser ledgers demonstrate the revisions they captured; they do not establish native acceptance of these newly agreed adaptations. The current throwaway prototype still has known dialog/draft/Back limitations identified in the contract. Those are implementation gaps, not unresolved product preferences.

Only this layout ticket is resolved here. [Decide missing controls and obsolete entry points](06-decide-control-gaps-and-retirements.md) still owns the pending identity-reset, exact popup allocation, deletion-confirmation and relay-account questions. [Prioritize the UX findings and handoff](08-prioritize-ux-study-handoff.md) remains blocked on that ticket and must carry all recorded native evidence gaps explicitly. No application code, prototype behavior, commit or deployment changed in this approval turn.
