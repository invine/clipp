# Clipp layout comparison — throwaway prototype

**Approved selection:** Compact summaries device rows retain visible status text; the top row uses the original green triangle for direct connections. [History](http://127.0.0.1:4195/?variant=S2&view=history&surface=phone&connection=direct) · [Devices](http://127.0.0.1:4195/?variant=S2&view=devices&surface=phone&connection=direct). [Six focused captures](evidence/text-status-triangle/measurements.json) verify these changes. S2 is now approved for all states, including amber attention for partial relay problems, and is the default preview.

**Rejected direct-icon alternatives:** [Linked chain](http://127.0.0.1:4195/?variant=L1&view=history&surface=phone&connection=direct), [Device pair](http://127.0.0.1:4195/?variant=L2&view=history&surface=phone&connection=direct) and [Status light](http://127.0.0.1:4195/?variant=L3&view=history&surface=phone&connection=direct). Bottom arrows cycle these three shapes in the same header. These are earlier references; current Devices keeps text statuses. Other states retain S3 as an unapproved comparison host. [Twelve captures](evidence/direct-icons/measurements.json) cover the refinement. The user rejected these replacements; the later diagonal refinement was also superseded by the original triangle.

**Resolved: [compact connection status](../issues/12-explore-compact-connection-status.md#answer).** The user selected M1 Devices + M3 Settings; `variant=M` combines them. S2 Network status is selected on that design; S1 Path glyph and S3 Health ring remain comparison references. [Open History](http://127.0.0.1:4195/?variant=S2&view=history&surface=phone&connection=direct) or [Devices](http://127.0.0.1:4195/?variant=S2&view=devices&surface=restored&connection=direct). Use the Connection scenario selector and bottom arrows to compare. The user approved S2 and showing partial problems. The approved History source is retained in [reference-approved-history](reference-approved-history/README.md); earlier management source is retained in `reference-management-options/`.

`connections.js` holds the synthetic state vocabulary and single-icon proposals. [59 captures](evidence/connections/measurements.json) preserve the comparison across twelve connection scenarios and representative sizes. Following the user’s header correction, the Clipp icon/name and connection indicator sit in a compact top line above Search, Filters and Send. The [eight focused captures](evidence/history-header/measurements.json) verify the corrected header across narrow, popup, desktop and 200% text; the earlier 59-capture ledger predates this correction. No native connection or delivery result is inferred from these fixtures.

`management.js` contains synthetic management fixtures and interactions; `capture-management.cjs` produces the [65-capture browser ledger](evidence/management/measurements.json). Management actions never reach production. The source/recovery constraints, measured comparison and simulation limits are recorded in the linked comparison notes.

The user selected **1 · Search first** on 2026-10-09. **3 · Browse first** remains a reference from the narrow-toolbar comparison. Both retain the selected A+C structure: rows narrow, equal-height multi-column cards wide, no permanent sidebar or reading pane. [Compare lightweight narrow toolbars](../issues/10-compare-lightweight-narrow-toolbars.md#answer) records the choice. The user also agreed to the [button/icon treatment](../button-icon-evaluation.md#agreed-direction); its first pass is now applied to Search first.

Run from the repository:

```sh
npm --prefix .scratch/ux-study/layout-prototype start
```

| Option | Open phone view | Narrow behavior |
| --- | --- | --- |
| 1 · Search first | [Preview](http://127.0.0.1:4195/?variant=1&surface=phone) | Clipp top line with overflow above the always-visible Search field, Filters inside Search and Send beside it. All/Pinned are in Filters. |
| 3 · Browse first | [Preview](http://127.0.0.1:4195/?variant=3&surface=phone) | All Clips/Pinned dropdown, Search icon, labelled Share now and overflow. Search replaces the row when opened. |
| D · Previous toolbar | [Reference](http://127.0.0.1:4195/?variant=D&surface=phone) | Dedicated branding/Auto Sync row above search, scope and sharing controls. |

Option 1 is the selected direction and the initial preview; 3 and D are references. The Actions in option 1 selector compares the agreed icons with the previous text treatment (`icons=icons` / `icons=text`). The bottom switcher cycles 1, 3 and D; arrow shortcuts ignore inputs, selects and dialogs. Select the available window, text size, theme or scenario to compare the same data. The URL preserves workbench settings. Simulated app state is in memory and resets when a comparison control reloads the preview. Stop the server with Ctrl+C when running it in your own terminal.

## Try the differences

1. In **Search first**, type in Search or open its Filters icon and select Pinned. An active Pinned only × control appears inline wide and below the toolbar narrow; tap it to clear that scope while keeping the search query.
2. In **Browse first**, tap All Clips to change scope. Tap Search to enter search mode; it focuses the input and temporarily replaces the other toolbar actions. Clear removes the query; Back or Escape closes search and clears the query while retaining the chosen scope. This close behavior is illustrative, not a separately approved product contract.
3. In either option, open the overflow menu and turn Auto Sync off. A visible, actionable off state appears; use it to open the menu and turn Auto Sync on again. Auto Sync being on does not consume a separate status/button row.
4. Search for `npm`, try a phrase with no matches, then clear it. Copy and Send give labelled demonstration feedback; Copy briefly changes to a check. A clear-search × appears inside Search only when a query exists, and returns focus to the input when activated. No clipboard data is read or sent.
5. Switch to the Chrome popup preset. The narrow header stays light, while an Open Clipp route with pending-request count remains visible below history. It demonstrates the already accepted quick-popup/full-page split.

Scope menus, search, no-match recovery and Auto Sync are functional in memory. The overflow also provides a Settings route. Browser dialog behavior handles keyboard focus containment and Escape for these new menus; Escape focus return was checked. Share/Copy, popup navigation, Pairing, identity reset, account and diagnostics remain demonstrations. The Filters panel currently compares All/Pinned only; source/date filter design remains outside this small comparison.

At widths above 720px, Search first keeps Search, Filters and Send in one row above the uniform card grid. All/Pinned are available only inside Filters; an active Pinned only × indicator appears inline when needed. Browse first retains D's earlier wide controls as a reference. A direct resize preserves query, scope and matching Clips. The narrow History header remains visible above Search: Clipp branding left, connection status in S variants or More options in the selected non-status variants right. Earlier hidden-header measurements below are historical and are superseded by the current header ledger.

## Clip details Delete icon — current refinement

At the user's request, Delete in the selected Clip details view is now a trash icon with danger color, accessible name and hover/focus hint “Delete Clip”. It sits at the opposite end of the footer from Copy/Pin and retains the 40px pointer / 48px simulated Android target. Keyboard hints appear after focus scrolls long content into view. This changes the preview's presentation; deletion remains a demonstration and its confirmation policy is still unsettled.

The [four focused captures](evidence/delete-icon/measurements.json) cover restored desktop, popup, 320px phone and a long Clip at 200% text in light mode. The icon, keyboard hint, target size and dialog/tooltip bounds passed; no page-script errors or horizontal dialog overflow were detected.

## Single scope control — preceding refinement

The user pointed out that the wide All/Pinned switch duplicated Filters. The selected prototype now consolidates that choice into Filters at every width. The normal wide toolbar has no scope switch or extra row; the clearable active indicator appears only for Pinned. The default restored window still starts its first Clip at y=114, and enabling Pinned keeps that position. Selecting or clearing scope returns keyboard focus to the visible Filters button.

[Open the restored window](http://127.0.0.1:4195/?variant=1&surface=restored&theme=dark&icons=icons). The [focused render ledger](evidence/filter-scope/measurements.json) records 16 captures and 53 passing checks, including restored/wide/fullscreen, a 721px boundary with 200% text, simulated tablet/320px phone, query retention through resizing, clearing and Escape focus return. No script errors, horizontal overflow, undersized simulated touch targets or out-of-bounds menus were detected. `capture-filter-scope.cjs` produces this evidence; these remain browser simulations.

## Agreed icons — preceding revision

[Open the selected preview](http://127.0.0.1:4195/?variant=1&surface=phone&icons=icons) or its [text reference](http://127.0.0.1:4195/?variant=1&surface=phone&icons=text). Copy uses overlapping rectangles; Share now uses Send; Close and Clear search use ×. All are local SVGs with accessible names, 40px pointer / 48px Android-simulation targets, and keyboard/hover hints. Navigation, status, settings, setup and destructive actions keep their labels. Pin keeps a stable accessible name with pressed state.

The empty state explains that Send shares the current clipboard. Copy feedback is explicitly simulated and never claims delivery. The selected Clip viewer now uses a browser dialog: Close and Escape return focus to the opener, keyboard focus stays in the dialog, and its feedback is inside that dialog. Historical reference viewers retain the prior rough behavior.

The preceding [26-case icon ledger](evidence/icon-actions/measurements.json) includes default/narrow/popup/short/wide/fullscreen, long content, 130/200% text, concurrent notices, empty/no-match, active query, copied feedback, detail dialog and tooltip states. It reported no script errors, horizontal overflow, unnamed icon controls, undersized simulated touch targets or overlays outside the viewport. Interaction checks covered clear/focus, Copy check/reset with stable name, stable Pin naming/state, Close/Escape focus return, hover/focus tooltips, and preservation of the text reference. Native runtime and real clipboard outcomes were not exercised. This evidence predates the wide scope consolidation; its original source hashes are retained in the [icon receipt](evidence/icon-actions/review-receipt.json).

The actual 360px phone Search field gains 31.33px (152.67 → 184px); Copy is 48px instead of 57.02px. The first Clip stays at y=84 and six complete Clips fit. Pointer Share/Copy targets are 40px. Wide cards remain equal in height. The icon change makes the controls lighter and recovers width; it does not promise another height reduction or extra complete phone Clips.

`capture-icons.cjs` produced the icon revision's render/interaction evidence. `icons=text` compares action labels within the current selected layout; the exact earlier toolbar sources and receipt remain archived in `reference-light-toolbars/`.

## Earlier toolbar comparison — measured space use

The same nine synthetic Clips are used in D and the new variants. Normal default state, 100% text:

| Simulated surface | First Clip in D | First Clip in 1 and 3 | Complete Clips, D → 1/3 |
| --- | ---: | ---: | ---: |
| Android phone 360×720 | y=195 | y=84 | 5 → 6 |
| Android small 320×640 | y=195 | y=84 | 4 → 5 |
| Chrome popup 480×600 | y=152 | y=52 | 6 → 7 |
| Narrow desktop 520×728 | y=152 | y=52 | 7 → 8 |

The phone top area falls from 171px to 60px excluding the 24px simulated native top inset—about 65% less space. The toolbar itself is one 48px row for Android and one 40px row for pointer surfaces. These are default-state measurements; active Pinned filtering in option 1, Auto Sync off, notices and enlarged text can add height. The popup count includes its new visible full-page footer route.

The [render ledger](evidence/light-toolbars/measurements.json) records **41 captures**: 24 base cases plus interactive menu, scope, search, off-state, enlarged-text and short-window states. The base cases cover both options at 320/360px, popup, narrow desktop, short/landscape/wide windows, 130/200% text, long content, recovery, empty and no-match. `capture-light.cjs` launches a fresh headless Playwright browser and closes it afterward. This is a design render aid, not an application test suite.

The final run reported no page-script errors, horizontal overflow, controls outside viewport width, undersized Android-simulation targets or menus outside the viewport. Interactions confirmed two pinned Clips, one `npm` match, no-match recovery, restoration of all nine Clips after clearing, visible Auto Sync off, Escape focus return, demonstration feedback, and query/match preservation through a direct narrow-to-wide resize. Manual inspection covered both normal phone views, popup, menus, search, off state and enlarged text.

These are **prototype comparisons, not native before/after benchmarks**. Android system bars are 24px placeholders; root-font scaling is not real Android scaling or browser zoom. Native keyboard/IME, Back, safe areas, DPR, assistive technology and production state preservation still need implementation-time checks. At short heights and narrow 200% text the navigation precedes history within a page scroller; content can begin below the fold.

## Earlier comparisons and scope

The [chosen history direction](../issues/09-compare-history-density-and-navigation.md#answer) remains settled. Its [D render ledger](evidence/hybrid/measurements.json) and [retained sources](reference-hybrid/README.md) document the preceding A+C synthesis. Original A/B/C [sources](reference-original/README.md) and [measurements](evidence/measurements.json) remain available. Explicit `?variant=A`, `C` or `B` URLs still render those historical references; B remains rejected.

Shared semantic colors are unchanged; the new top controls reduce visible boxes/fills rather than target sizes or text contrast. The earlier [token contrast arithmetic](evidence/contrast.json) remains relevant to those unchanged tokens, but does not establish accessibility conformance. Final visual tone and the broader management contract remain with the [layout decision](../issues/07-decide-layout-and-visual-direction.md).

Historical reference full-Clip dialogs still lack production focus management; the selected browser dialog is not a substitute for native/assistive-technology qualification; browser/native integration, actual clipboard transfer, filters beyond scope and unsettled control semantics remain out of this prototype. No option settles identity retirement, destructive confirmation or account workflow decisions.

Only study files changed. No product route, runtime bridge, real identity/history or production UI was connected or changed. The final choice must be implemented separately; app changes and code commits are outside this study.
