# 01: Retain 52 preceding weeks of Recorded Relay Usage

**What to build:** Extend retained Recorded Relay Usage so a Relay Account owner can access the current Weekly Quota Window and 52 preceding windows through the existing owner view, while preserving safe accounting and retirement behavior.

**Blocked by:** None (can start immediately).

**Status:** resolved

**Owner:** weekly-history-01

- [x] The owner view can access retained totals through the new boundary, including weeks older than the former twelve-week boundary, and presents accurate retention wording.
- [x] The current window and 52 preceding windows are retained; the first older window is retired. Weekly totals and their retry receipts expire together.
- [x] Bounded cleanup, account isolation and account deletion continue to work; stale settlement cannot recreate a retired week or charge it to a newer one.
- [x] History already expired under the previous policy is not fabricated or restored. Relevant owner, administrator and service documentation reflects the new retention period.
- [x] Existing accounting and retention tests cover both boundaries and the safety behaviors above; owner-facing behavior is verified through the authenticated portal.
