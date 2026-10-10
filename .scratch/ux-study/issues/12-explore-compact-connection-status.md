# Explore compact connection status

Type: prototype
Labels: wayfinder:prototype
Mode: HITL
Status: resolved
Assignee: Codex (current session, 2026-10-09)
Parent: [Clipp cross-runtime UX study](../map.md)
Blocked by: 11

## Question

How should icons and color express individual device connection paths and a compact overall connection state on History, without implying delivery or treating ordinary offline devices as faults?

The user requested gray for offline, “ember” (interpreted as amber/orange) for a relayed connection, green for direct, and preferably one icon in History's top row to tell at a glance whether connections look okay. Exact counts/details need not occupy that row. Use the selected M1 Devices + M3 Settings organization and approved History layout as the host. Explore recognizable glyphs and a truthful aggregate rule across ready relays, no configured relays, direct/relayed/unknown peers, no peers, retry/auth/fault conditions and Auto Sync off.

## Comments

2026-10-09 claim: created and claimed from the user's explicit refinement request. Keep ordinary connection path, configured relay health, membership, Auto Sync and delivery semantics distinct. Present aggregate behavior as a proposal for human review; do not infer a new promise of successful synchronization. No production implementation is in scope.

2026-10-09 exploration ready: [the comparison](../connection-status-exploration.md) presents S1 Path glyph, S2 Network glyph and S3 Health ring, each using the selected M1 Devices + M3 Settings organization. Devices gains colored path icons; History has one visible status target, replacing narrow More and wide connection-count text. [59 captures and 14 checks](../layout-prototype/evidence/connections/measurements.json) report no recorded script, geometry, status-count or interaction failures. The 360px toolbar remains 48px high with 184px of empty Search input and first Clip at y=84.

Two independent questions are pending: choose the glyph (S2 recommended), and decide whether a configured-relay problem should show attention while another usable connection remains (show partial problems recommended). The distinction between a normal amber routed icon and an amber exclamation is explicit. Only the management-organization ticket was resolved this invocation; this prototype ticket remains claimed for the user's verdict.

2026-10-09 header correction: the user clarified that the agreed History layout has a Clipp icon/name line above Search. Restored that line at narrow widths, with the connection icon at its right and Search/Filters/Send together below it. The selected non-status Search first and management variants also retain the branding line, with More options at right. The [eight focused captures](../layout-prototype/evidence/history-header/measurements.json) verify visible branding above Search, one visible S2 status icon in the header, Escape focus return and no horizontal overflow or out-of-width controls across phone, small/200% text, popup, landscape and restored desktop. Normal phone Search is now 236px and the first Clip starts at y=132; restored desktop remains y=114. Earlier measurements above describe the superseded hidden-header version. This correction does not settle the pending glyph or partial-problem policy.

2026-10-09 direct-icon refinement: the user dislikes the current direct-connection icon and requested alternatives. Added L1 Linked chain (recommended), L2 Device pair and L3 Status light to the existing header/Device rows; the [comparison notes](../connection-status-exploration.md#direct-icon-alternatives--rejected-references) explain their tradeoffs. Non-direct states use S3 only as a comparison host, without treating the user's currently viewed variant as approval. The [twelve captures](../layout-prototype/evidence/direct-icons/measurements.json) and two interaction checks pass after correcting the validation selectors/surface scope. Header placement and other layouts are unchanged. Replacement choice, complete status family and partial-problem priority remain pending; this ticket stays claimed.

2026-10-09 direct motif selected: the user rejected L1/L2/L3 and requested the previous direct icon rotated 45 degrees, bottom left to top right. Applied the original two-node direct glyph with a -45-degree SVG rotation to History/status panels across S1/S2/S3 and direct Device rows. [Six focused captures](../layout-prototype/evidence/diagonal-direct/measurements.json) verify orientation, matching glyphs and viewport bounds with no recorded errors. L1/L2/L3 are labelled rejected references. This settles the direct motif only; other state glyphs and partial-problem priority remain unresolved, so the ticket stays claimed.

2026-10-09 revised selection: the user requested reverting Compact summaries device statuses to text and retaining the original triangle in the top row for direct connections. Restored the original text-row markup with “Connected · direct”, “Connected · relay” and “Offline”; removed path icons from device rows. S1/S2/S3 now use the original green three-node triangle for the direct state. This supersedes the preceding diagonal-icon choice. [Six focused captures](../layout-prototype/evidence/text-status-triangle/measurements.json) verify phone/restored History, status-host/original-M1 Devices, and 320px/200% text without recorded errors or width overflow. Other glyph states and partial-problem priority remain open; this ticket stays claimed.

2026-10-09 approval recorded: the user replied “ok I agree with this” after reviewing the restored device text and triangle icon. These visual choices are now approved: Compact summaries shows device connection statuses as text, and the History top row uses the original green three-node triangle for the direct state. Preserve the Clipp branding line above Search. Do not reopen these choices without user direction or new evidence. This approval addresses the latest visual refinement; it does not select an unreviewed non-direct icon family or answer the separately pending configured-relay partial-problem priority. The ticket remains claimed for those remaining decisions. No prototype or production code changed for this approval.

2026-10-09 continued claim: after the user requested the next frontier, resume the remaining decisions in this ticket. There are no open, unclaimed, unblocked child tickets; the controls ticket remains claimed with earlier unanswered lifecycle questions and the layout parent waits on this status ticket. The approved device text and direct triangle are settled. The current round addresses only the non-direct status family and precedence of configured-relay attention when another connection is usable. Existing source constraints and rendered scenarios provide the necessary facts; no new runtime investigation or production changes are required.

2026-10-09 remaining round presented: Q1 recommends the S2 network family for non-direct states, with S3 circular symbols as the alternative. Q2 recommends amber attention for a configured-relay problem even while a direct device path remains usable, with green-until-no-usable-path as the alternative. The [scenario review and acceptance checks](../connection-status-exploration.md#remaining-decision-round-and-acceptance-checks) make the consequences concrete and retain all approved visuals. Answers are pending; recommendations do not resolve this HITL ticket.

## Answer

Resolved 2026-10-09 through the user's explicit agreement to both remaining recommendations. Earlier approval already settled device text, the direct triangle and the branding row. This answer supersedes the exploratory alternatives and pending statements in the chronological comments above.

- **Devices:** M1 Compact summaries retains visible status text below each name: Connected · direct, Connected · relay, Offline, or an explicit unknown-path label. No connection-path icons in device rows. M3 Settings remains selected by the management decision.
- **History placement:** one status button in the Clipp branding line above Search; keep Search, Filters and Send below it. No connection counts or diagnostic sentences in the normal header. Preserve the demonstrated target sizes, accessible label/hint and short status panel.
- **Direct:** original green three-node triangle. It means an available direct connection to a Trusted Device, not delivery or every device being online.
- **Other states:** the S2 network family is selected. Amber routed network for relay-only connections; gray slashed network for offline; gray dotted network for waiting/startup/idle; explicit unknown-path treatment. Working amber relay routing is distinguished by shape from amber attention.
- **Partial-problem priority:** a configured-relay sign-in requirement, degradation/retry or warning shows amber attention even if a direct connection remains usable. Opening the indicator explains both the problem and the available device path. Ordinary offline Trusted Devices and an unconfigured relay are not faults.
- **Independent state:** Auto Sync remains separate; a green connection icon never claims synchronization or delivery. A known usable path must remain represented while another connection starts. Exact diagnostics remain in Devices/Connections settings.

The [scenario review and acceptance checks](../connection-status-exploration.md#remaining-decision-round-and-acceptance-checks) operationalize this decision. `variant=S2` is the selected prototype/default; S1/S3 and rejected L variants remain historical comparisons. Existing [connection-state evidence](../layout-prototype/evidence/connections/measurements.json), [header correction evidence](../layout-prototype/evidence/history-header/measurements.json), and [final device-text/triangle evidence](../layout-prototype/evidence/text-status-triangle/measurements.json) cover successive revisions, not a claim that the latest source received native acceptance. The receipt records the current source and evidence chain.

This closes only the connection-status decision. The parent layout decision still owns responsive/dialog/notice acceptance and final visual consistency. Separate control-lifecycle questions and native evidence gaps remain with their existing tickets. No production implementation or commit is authorized by this resolution.
