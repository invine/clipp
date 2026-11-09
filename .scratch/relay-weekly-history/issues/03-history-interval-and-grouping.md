# 03: Choose a bounded history interval and graph grouping

**What to build:** Let a Relay Account owner load a selected history interval and choose a Weekly or Monthly graph, while seeing a consistent weekly table and an honest account of available data.

**Blocked by:** 01 — Retain 52 preceding weeks of Recorded Relay Usage.

**Status:** resolved

**Owner:** weekly-history-03

- [x] Labeled UTC start and end date controls load a selected interval, with clear boundary inclusion and a correction path for invalid or reversed dates and intervals longer than one calendar year. Enforce the limit on the server as well as in the interface.
- [x] Weekly and Monthly replace the fixed-range choices. Weekly uses weekly buckets; Monthly groups whole weekly totals by the UTC month containing each week start and labels that interpretation clearly.
- [x] The chronological graph and newest-first weekly table reflect the same selected interval; graph granularity does not change the table's weekly rows. Changing the interval resets table pagination to the initial four rows.
- [x] The current week is identified only if present; empty or unavailable history is not presented as zero, and already expired history is not invented. The legend appears only when a graph is rendered.
- [x] The account-scoped usage snapshot and its non-authoritative role are preserved. Controls, graph and table work with keyboard and assistive technology and at narrow widths.
- [x] Authenticated portal tests cover valid and invalid dates, the one-year boundary, year rollover, grouping, graph/table consistency, empty states and pagination reset. Verify the section in a real browser at desktop and narrow widths.
