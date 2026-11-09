# Relay portal history

**Status:** ready for implementation.

Clipp is the owner of this local specification. Clipp Relay is the participating implementation repository; select its checkout explicitly when implementing. The [specification](spec.md) and [decision record](decisions.md) govern these approved tickets:

| Ticket | Blocked by |
| --- | --- |
| [01: Retain 52 preceding weeks of Recorded Relay Usage](issues/01-retain-recorded-relay-usage.md) | None |
| [02: Browse weekly history newest first](issues/02-browse-weekly-history.md) | None |
| [03: Choose a bounded history interval and graph grouping](issues/03-history-interval-and-grouping.md) | 01 |

Tickets 02 and 03 both touch the history section; coordinate their integration, including resetting pagination when the interval changes. Approval covers the breakdown only, not implementation.
