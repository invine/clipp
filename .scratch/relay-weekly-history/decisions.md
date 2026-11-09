# Decisions

| ID | Source | Disposition | Specification requirement |
| --- | --- | --- | --- |
| D1 | User request | Accepted | Newest-first weekly table; four initial rows, then ten more per action while more exist. |
| D2 | User request | Accepted | Remove incomplete-week wording; display legend only with the graph. |
| D3 | User request | Accepted | Replace the two existing range labels with Weekly and Monthly; add an interval control capped at one year. |
| D4 | User request | Accepted; supersedes the existing 12-week retention policy | Retain the current Weekly Quota Window plus 52 preceding windows; expire the associated weekly totals and retry receipts together, preserving accounting and cleanup safety. Expired history cannot be reconstructed. |
| D5 | Planning interpretation | Proposed | Weekly and Monthly select graph aggregation; monthly buckets group weekly totals by UTC month of the week start, clearly labeled as such. Interval selects dates independently. |
| D6 | User approval | Accepted | Exercise the authenticated owner portal as the primary behavior seam; use existing persistence/retention tests where needed. |
