# 02: Browse weekly history newest first

**What to build:** Make the owner portal's weekly history easy to browse, with the newest weeks first, progressive disclosure, and clear graph context.

**Blocked by:** None (can start immediately).

**Status:** resolved

**Owner:** weekly-history-02

- [x] The weekly table shows at most four rows initially, ordered newest first, including across year boundaries.
- [x] Show more appears only while more rows are available and reveals up to ten additional weeks per action without removing previously displayed rows; it disappears when exhausted.
- [x] Current-week incomplete wording is removed from visible text, table, legend, graph titles and accessible names. A legend appears only with a rendered graph and explains an actual visual distinction.
- [x] Recorded zero remains distinct from no observation; human-readable and exact byte totals remain available, and confirmation-lag information remains accurate.
- [x] Authenticated portal tests cover ordering, pagination boundaries, graph and empty states, and accessible wording. Verify the section in a browser at desktop and narrow widths with keyboard access.
- [x] Coordinate integration with the interval ticket so a changed interval resets pagination to four rows.
