# 01: Manage relays from a dedicated destination

**What to build:** Move the existing relay management experience from Settings to a first-class Relays destination with the confirmed responsive header and relay list. A person can configure and manage relays end-to-end without losing existing capabilities or interrupted work.

**Blocked by:** None (can start immediately).

**Status:** resolved

**Claim:** coordinator / ticket-01 implementer; client branch codex/relay-tab-01; baseline a2c012265ea1a4aec04023431d9028be4fb0b933.

- [ ] Relays appears in shared navigation, selected state and workspace header; Add relay opens the existing editor. Settings no longer duplicates the relay panel or visible category.
- [ ] The Configured relays card matches the confirmed visual guide at desktop, tablet and phone widths, uses the Devices shell and compact Clipp navigation control, supports light/dark themes, readable long identifiers, keyboard and touch actions, and no page-level horizontal overflow. Example data and the mockup's empty-state switch are not shipped.
- [ ] Starting from an empty configuration, users can add, validate, edit and remove both authenticated-discovery and explicit Peer ID configurations, and use existing legacy address controls on hosts that expose them. Pending, rejected, partial and unconfirmed outcomes remain honest and recoverable.
- [ ] Existing applicable login, account, retry and refresh controls, every managed and legacy connection state, reasons and warnings remain available. Secondary actions remain accessible for each eligible relay at every width, including a relay needing login; removal retains existing local-only semantics.
- [ ] Recovery links, notification and task returns, and valid legacy relay-settings handoffs reach Relays. Editing drafts, pending work, cancellation, interruption and focus return follow existing behavior; malformed unrelated handoffs remain rejected.
- [ ] Use existing shared UI adapter and browser scenarios to exercise navigation, configuration and recovery at desktop, tablet and phone sizes, with both themes, supported runtime capabilities and affected host handoffs. Add runtime-specific coverage only for changed bridges. Existing transport and session behavior remains unchanged.
- [ ] Retain a distinct status-card region above the relay list with honest current status information; ticket 02 completes its aggregate presentation.

## Resolution

Integrated client commits `826f49e19142d1937c4ae2bf075c1325932d6cee` and `33e33cd7bc0feb4747b030ef5ac22316ace4755a` by fast-forward to `codex/relay-tab-integration` at `33e33cd7bc0feb4747b030ef5ac22316ace4755a`. Standards review found no actionable issues. Spec review found collapsed-card focus and feedback issues; follow-up fixed them and both reviewers accepted the follow-up. On the identical source revision, `npm run check` passed 209 Jest suites / 1,695 tests and 133 candidate tests (Node 26.13.0); Jest warned about an open handle but eventually exited. Integrated revision relay-management and relay-destination browser checks passed 4/4 and 6/6 respectively. Runtime builds passed on the first commit; final builds are required on the completed integration. Two unrelated shared-browser navigation failures reproduced on the unchanged starting baseline. Native and forced-live relay acceptance were not run. See run record for evidence.
