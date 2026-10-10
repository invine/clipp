# Compare history density and navigation

Type: prototype
Labels: wayfinder:prototype
Mode: HITL
Status: resolved
Assignee: Codex (current session, 2026-10-08)
Parent: [Clipp cross-runtime UX study](../map.md)
Blocked by: 03, 04, 05

## Question

Which history/navigation structure best balances compact daily use, full-content inspection, reachable actions and usable expanded windows: compact rows, a list-and-detail workspace, or adaptive cards? Which parts should differ between Android, Chrome popup, Chrome full-page management and Electron?

Use a throwaway, populated comparison with the same synthetic Clips and terminology. Compare compact, short landscape, popup, restored desktop and expanded viewports, with enlarged text, long content, recovery notices and light/dark appearance. Variants must differ structurally, not just cosmetically. Keep every preview separate from native runtime evidence, and keep controls whose semantics are still pending in the controls ticket illustrative only.

The user may choose one variant or combine specific parts. Capture the selected direction and its tradeoffs as this ticket's Answer; recommendations alone cannot resolve this HITL comparison. Feed the answer into [Decide visual consistency and efficient layout](07-decide-layout-and-visual-direction.md).

## Comments

2026-10-08 claim: the comparison follows the measured one-Clip Chrome popup, Android's 58px history area at 340×350, Electron's stretched fullscreen grid and all runtimes' long management drawers. Use the prototype UI skill with three variants and a URL-driven switcher. The study's isolation boundary takes precedence over attaching speculative views to the operator's real data or production routes: keep a populated app-surface replica and all assets under the existing study directory. No app behavior changes or production promotion are part of this effort.

2026-10-08 prototype ready for discussion: [run/review notes](../layout-prototype/README.md), [interactive comparison](http://127.0.0.1:4195/?variant=A&surface=phone), [source](../layout-prototype/index.html), [render measurements](../layout-prototype/evidence/measurements.json). A is compact rows, B is a reading workspace and C is adaptive cards, all on the same route with `?variant=` and a floating switcher. The same synthetic fixture gives four/five complete phone/popup Clips for rows, versus one/two for cards. These are variant comparisons, not a native before/after benchmark. The recommendation is A's rows with B's reading pane on selection when wide; that synthesis is not a fourth tested implementation.

At that point, the L1 question in this chat requested the user's choice of A/B/C or a combination; no answer had yet been recorded. L2 organization and L3 visual tone are tracked by the parent layout decision. The ticket remained claimed pending that choice; rendered examples were not implicit approval.

2026-10-08 continued claim: the user now selected A for narrow sizes plus C's multi-column history for wide sizes, rejected B entirely, rejected A's wide side panel and C's variable card heights, and required much more compact top controls. Implement that combination only in the throwaway prototype, retain the original comparisons as evidence and validate the synthesis before recording the resolution.

## Answer

Resolved through the user's 2026-10-08 feedback in this chat: **A's narrow rows plus C's wide multi-column history**, with **equal-height cards**, **no wide side panel**, and **much more compact Share now / Filters / All / Pinned / Search controls**. B is rejected in full. This supersedes the agent's earlier A+B recommendation; the user did not approve that recommendation.

The user said: “I like A for narrow size, but for wide size I want to have several columns for clips, so it should be a combination of A and C.” They also rejected A's wide side panel, unequal card heights in C, and the space taken by the top controls. These explicit requirements settle this comparison's structural question.

The revised [D · A+C prototype](http://127.0.0.1:4195/?variant=D&surface=wide) concretely demonstrates that direction; [phone view](http://127.0.0.1:4195/?variant=D&surface=phone), [notes](../layout-prototype/README.md), [measurements](../layout-prototype/evidence/hybrid/measurements.json) and [review receipt](../layout-prototype/reference-hybrid/review-receipt.json) retain the supporting evidence. D is the default; original A/C are selectable references. B is excluded from the proposal cycle but retained as a historical direct URL/source.

### Demonstrated interpretation and tradeoffs

- Narrow views retain rows and direct Copy/Pin; wide views use a uniform grid. At 1440px there are four columns and at 1920px six. All desktop cards have identical heights at a given text size: about 184px at default size, 309px at 200%. Their preview budgets grow with text; they never stretch to fill the viewport. Short Clips leave some blank preview space in exchange for visual alignment. Full content remains available on selection.
- There is no permanent sidebar or inspector. Header navigation wide and labelled bottom navigation narrow demonstrate one way to retain History/Devices/Settings without a side panel. At short heights or narrow 200% text, navigation precedes history within the page scroll. These exact placements, breakpoint values and spacing are prototype choices supporting the requirement, not separately approved product specifications.
- Search, scope, Filters and Share now occupy one toolbar row wide and two compact rows narrow at default text size. Removing redundant headings/counts and consolidating navigation reduces space without shrinking Android hit targets. The Filters icon is labelled; its menu contents remain a stub. Auto Sync and pending-request access remain available.
- Toolbar height falls from A's 164px to 100px on the phone, 136px to 84px in the popup, and 136px to 40px wide. The same fixture displays five complete phone Clips versus four in A, six popup Clips versus five, and all nine wide Clips in a grid. These are prototype-to-prototype measurements, not native before/after results.
- Twenty-five rendered scenarios cover regular/short/expanded windows, popup/full-page management, phone/tablet, breakpoint transitions, long text, recovery and enlarged text. They reported no page-script errors, horizontal overflow, controls outside viewport width, unequal wide-card heights or Android-simulation targets smaller than 48px. Native behavior, actual display/text scaling and production accessibility remain implementation checks.

The final colors, typography, management grouping and remaining responsive contract stay with [Decide visual consistency and efficient layout](07-decide-layout-and-visual-direction.md). This answer does not settle that ticket's unanswered visual-tone choice or the controls ticket's second round. Only this comparison ticket is resolved in this invocation. No production code or runtime data was changed.
