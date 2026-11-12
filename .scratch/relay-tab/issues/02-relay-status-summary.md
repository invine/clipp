# 02: Summarize current relay status

**What to build:** Make the status card on Relays give an accurate, concise view of the configured relays and update as their reported states change.

**Blocked by:** 01: Manage relays from a dedicated destination.

**Status:** resolved

**Claim:** coordinator / ticket-02 implementer; client branch codex/relay-tab-02; baseline 33e33cd7bc0feb4747b030ef5ac22316ace4755a.

- [ ] The status card derives its counts and labels from current configurations and observed states; only an observed ready relay is counted ready, and all counts reconcile with the list.
- [ ] Empty, connecting or retrying, attention-needed, and unknown or unreported states are clearly distinguished. Changes in runtime observations update the card without inventing success or implying a Relayed Connection or guaranteed Clip delivery.
- [ ] Managed and legacy relay-address surfaces show honest summaries for the observations each supplies; individual status, reasons, warnings and actions remain usable.
- [ ] The card follows the confirmed visual guide at phone, tablet and desktop widths, uses accessible text rather than color alone, and omits the removed direct-connections sentence and mockup-only controls.
- [ ] Shared UI adapter/browser tests cover zero, mixed and changing states, including unreported observations and both supported themes. Run relevant relay and shared UI suites and runtime builds; report native acceptance separately, and run project-required checks before any code commit.

## Resolution

Integrated client commit `9ceefa73532a4d0e41be04943f5b1550bd104e38` by fast-forward into `codex/relay-tab-integration` at the same revision. Full Standards and Spec reviews found no remaining actionable findings; the Spec review requested additional long-identifier, responsive action and recovery-route coverage, which was added and reviewed. `npm run check` passed 209 Jest suites / 1,695 tests and 133 candidate tests; all three runtime builds passed; repository lint passed with zero errors and 1,129 warnings. Integrated relay-management and relay-destination browser suites passed 4/4 and 18/18. Two unrelated shared UI navigation failures were reproduced on the unchanged starting baseline. Husky hook was unavailable in the ticket worktree; formatting, lint and `npm run check` were run manually. Native and forced-live relay acceptance were not run. See run record for evidence.
