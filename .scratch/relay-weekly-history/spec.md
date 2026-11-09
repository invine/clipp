# Relay portal history improvements

Status: ready-for-agent

## Problem Statement

A Relay Account owner cannot readily browse recent Recorded Relay Usage in the preferred order or select the period and presentation of the history. The current controls describe fixed numbers of weeks, and the page labels the current week incomplete even though the owner does not want that wording.

## Solution

Provide a newest-first weekly table with progressive disclosure, Weekly and Monthly graph views, and a bounded date interval. Extend retained weekly history from twelve to 52 preceding weeks. Keep the graph's legend attached to the graph and remove incomplete-week wording throughout the section. Continue to describe Recorded Relay Usage and its confirmation lag accurately.

## User Stories

1. As a Relay Account owner, I want the newest week at the top, so that recent usage is easiest to find.
2. As an owner, I want four rows initially, so that the history remains compact.
3. As an owner, I want Show more only when more weekly rows exist, so that I see a useful action.
4. As an owner, I want each Show more action to reveal up to ten additional weeks, so that I can browse history in manageable steps.
5. As an owner, I want previously shown rows preserved when I load more, so that I retain context.
6. As an owner, I want the action to disappear after the final row, so that I know the available history has been shown.
7. As an owner, I want Weekly and Monthly graph choices, so that I can inspect usage at different granularities.
8. As an owner, I want to choose an interval, so that I can focus on a period of interest.
9. As an owner, I want intervals limited to one year, so that requests remain bounded.
10. As an owner, I want clear feedback for an invalid interval, so that I can correct it.
11. As an owner, I want graph and table to reflect the selected interval, so that their scope is understandable.
12. As an owner, I want the legend only when a graph is rendered, so that it always explains visible data.
13. As an owner, I want the current week identified without being called incomplete, so that the section uses the requested language.
14. As an owner, I want recorded zero distinguished from no observation, so that missing data is not presented as usage.
15. As an owner, I want exact byte totals available alongside readable units, so that I can inspect precise figures.
16. As an owner, I want an honest empty state when the selected interval has no retained data, so that absence is not mistaken for zero.
17. As a keyboard or assistive-technology user, I want labeled controls and accessible graph and table descriptions, so that I can use the history independently.
18. As an owner, I want usage to remain scoped to my Relay Account, so that another account's history is not disclosed.
19. As an owner, I want the confirmation lag explained, so that I understand why recent traffic might not yet appear.
20. As an owner, I want up to 52 preceding weeks of usage retained in addition to the current week, so that I can inspect a longer history.
21. As an owner, I want history already deleted under the previous policy treated as unavailable, so that the portal does not imply it can recover it.

## Implementation Decisions

- Modify the existing authenticated owner portal history, keeping its established visual system and responsive layout. This is a focused section change, not a redesign.
- Keep the table in Weekly Quota Windows, newest first. Initially expose at most four rows, then append up to ten per action. Derive Show more visibility from remaining rows; reset the visible count when the interval changes.
- Replace the existing fixed-range labels with Weekly and Monthly graph controls. Proposed interpretation: Weekly uses weekly buckets; Monthly groups whole weekly totals by the UTC calendar month containing each week's start. Clearly label the monthly grouping so it is not mistaken for exact calendar-month traffic; weekly aggregates cannot be split accurately across month boundaries.
- Provide labeled start and end date controls and an explicit action to load the interval. Validate the interval on the server as well as in the interface; reject reversed, invalid, or longer-than-one-calendar-year intervals with a clear correction path. Interpret dates in UTC and make boundary inclusion clear.
- The graph and table use the same selected interval, with the table's pagination independent of the graph's selected granularity. Maintain chronological graph order and accessible descriptions; identify the current week only when it actually falls within the result.
- Remove all current-week incomplete wording from visible text, legend, table, SVG titles and accessible names. Keep a legend only within a rendered graph and only when it explains an actual visual distinction.
- Retain observed zero versus missing observation and exact-byte data. Do not fabricate data for expired or unavailable weeks.
- Replace the existing current week plus twelve preceding Weekly Quota Windows retention policy with the current week plus 52 preceding windows. Apply the new boundary consistently to reads, weekly totals, retry receipts, retirement, cleanup, and relevant owner and administrator wording and documentation. Weekly totals and their associated retry receipts must still expire together; stale settlement must not recreate a retired week or charge it to a newer one. Preserve bounded cleanup, account deletion and isolation behavior.
- Do not fabricate or recover records already deleted under the earlier retention policy. Older history becomes available as it is accumulated after the change; make absence honest. The maximum selectable interval remains one calendar year even though 52 preceding weeks plus the current week are retained.
- Keep the existing authenticated, account-scoped usage snapshot and its non-authoritative presentation role. Avoid changing quota admission, accounting, or Relay Session behavior.
- Maintain accessible control labels, keyboard interaction, loading/error/empty states and usable narrow-screen table and graph overflow. Do not add invented usage or imply precision the data does not support.

## Testing Decisions

- Primary seam: the existing authenticated owner portal request and rendered response, exercising actual history selection, controls and table behavior with representative retained data. Assert externally visible outcomes rather than template structure or helper internals.
- Extend existing owner profile history integration tests as prior art. Cover ordering across year boundaries, fewer/exactly/more than four rows, ten-row increments and final page, interval validation including the one-year boundary, state reset, aggregation labels, missing versus zero, current-week wording, graph/legend and empty states, account isolation, and confirmation-lag copy.
- Use existing portal histogram tests only for graph-specific behavior that cannot reasonably be observed through the owner portal. Extend the existing accounting and retention tests to exercise the new boundary, coupled receipt retirement, bounded cleanup, stale settlement, account isolation and deletion. Verify the old 12-week boundary no longer removes eligible data and the first week outside the new boundary is retired.
- Verify the focused section in a real browser at desktop and narrow widths, including keyboard access and graph/table states, using the app-screen guidance from design-taste-frontend.

## Out of Scope

Implementation or code changes in this task; restoration of expired data; changes to quota accounting semantics, admission, administrator functionality beyond retention wording, transport, or Device Network membership; unrelated portal redesign.

## Further Notes

The retention change supersedes the earlier periodic accounting specification's twelve-preceding-week requirement, while retaining its settlement and retirement guarantees. A newly deployed change cannot restore already expired data. The monthly grouping is a planning interpretation, not a previously established product decision. The user approved the testing seams.
