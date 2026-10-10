# Compare lightweight narrow toolbars

Type: prototype
Labels: wayfinder:prototype
Mode: HITL
Status: resolved
Assignee: Codex (current session, 2026-10-08)
Parent: [Clipp cross-runtime UX study](../map.md)
Blocked by: 09

## Question

Should narrow history prioritize an always-visible search field with scope inside Filters (Search first), or prioritize browsing with a scope dropdown and search on demand (Browse first)? Compare the two requested alternatives while retaining the selected narrow rows and wide uniform card grid.

Make both concrete using the same synthetic data. Remove the persistent branding/Auto Sync row on narrow history, reduce visual enclosure, keep Share now directly available, and demonstrate scope changes, search, Auto Sync off and overflow access. Preserve a visible route from the Chrome popup into full-page management. Check 320px, ordinary phone, popup, narrow desktop, short heights, wide fallback and enlarged text. The result is a comparison for the user's choice, not a production change or an automatic verdict.

## Comments

2026-10-08 claim: after reviewing the A+C synthesis, the user found the narrow top area still too heavy, asked for ideas, and then explicitly requested preparing proposed options 1 and 3. Build exactly those two options plus the previous D toolbar as a reference. The dedicated study prototype remains isolated from product code, runtime bridges and real data. No option has been selected yet.

2026-10-08 ready for review: [Search first](http://127.0.0.1:4195/?variant=1&surface=phone) and [Browse first](http://127.0.0.1:4195/?variant=3&surface=phone) are switchable on the same route, with D retained as the previous toolbar. [Prototype notes](../layout-prototype/README.md), [render ledger](../layout-prototype/evidence/light-toolbars/measurements.json) and [receipt](../layout-prototype/reference-light-toolbars/review-receipt.json) record the scope and checks. No production behavior was modified.

Both versions start the first Clip at y=84 on the 360×720 phone simulation, versus y=195 in D, and show six complete Clips rather than five. Their default narrow toolbar is one 48px touch row; the dedicated branding/sync row is gone. The popup retains a visible Open Clipp footer route. Forty-one captured cases and interactive checks found no script/geometry failures. These are browser prototype facts, not native usability or release results.

Search first keeps the field visible and puts All/Pinned inside Filters; a selected Pinned scope adds a clearable indicator. Browse first has a scope dropdown and opens search on demand; closing search clears its query but preserves scope. Auto Sync off adds a visible action in both. At short heights/large text, controls reflow and content scrolls. The exact extra-state behavior is a prototype interpretation for discussion, not a separately approved contract.

This HITL ticket remains claimed. The user's request authorized preparing both options, not selecting either; record the verdict only after their response.

## Answer

Resolved by the user's explicit 2026-10-09 choice: “I like the first option.” Select **1 · Search first** as the narrow history toolbar direction. It keeps Search visible, puts All/Pinned in Filters, retains the overflow route and uses the quieter single-row treatment. The prior A+C history choice remains intact. Browse first and D are references, not competing selected directions.

The user immediately requested evaluation of where text buttons can become icons, specifically Share now and Copy. Selection of Search first therefore settles the toolbar structure, not a requirement to preserve every current text label. [Decide visual consistency and efficient layout](07-decide-layout-and-visual-direction.md) owns that follow-up evaluation and the remaining visual/management contract. No icon substitution, new control semantics or production implementation is implicitly approved by this selection.

The [prototype notes](../layout-prototype/README.md) and [41-case render ledger](../layout-prototype/evidence/light-toolbars/measurements.json) retain the evidence and limitations. The phone simulation starts history at y=84 and shows six complete Clips at default text. These measurements establish the demonstrated layout, not native usability, discoverability or accessibility conformance.
