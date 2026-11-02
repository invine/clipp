# Compare Devices and Settings organization

Type: prototype
Labels: wayfinder:prototype
Mode: HITL
Status: resolved
Assignee: Codex (current session, 2026-10-09)
Parent: [Clipp cross-runtime UX study](../map.md)
Blocked by: 09, 10

## Question

Which organization makes Devices and Settings compact and understandable across a restored/wide desktop window, Chrome full-page management and Android phone/tablet, while preserving access to Pairing, requests, identity, relays and advanced preferences?

Compare three structural alternatives within the existing study prototype: compact summaries with on-demand detail views; expandable sections with inline controls; and category tabs. Use the same synthetic data/actions and approved History styling. Compare ordinary preference changes, Pairing/review, local alias versus Device Name, zero relays, long names, recovery and enlarged text. Chrome popup retains its accepted full-page management route; approval placement and other unanswered control-lifecycle questions remain with their existing ticket.

## Comments

2026-10-09 claim: created from the Devices/Settings frontier in [Decide visual consistency and efficient layout](07-decide-layout-and-visual-direction.md). Existing drawer and diagnostic space measurements justify a structural comparison. No alternative is selected in advance. This is a throwaway visual study with synthetic in-memory actions; no production implementation, mutations or commits.

2026-10-09 comparison ready: [comparison notes and scenarios](../management-layout-comparison.md) link M1 Compact summaries, M2 Inline sections and M3 Category tabs on the existing prototype route. [65 browser captures and 17 interaction checks](../layout-prototype/evidence/management/measurements.json) exercise the base layouts and representative management flows. No script, geometry or recorded interaction failures remain. Recommend M1 for Devices and M3 for Settings, while allowing independent choices or a combination. This is not a resolution: wait for the user's verdict. Pending control-lifecycle questions remain with [Decide missing controls and obsolete entry points](06-decide-control-gaps-and-retirements.md).

Human decision round pending: Q1 asks which Devices organization to take forward (M1 recommended; M3 tabs or M2 inline offered). Q2 independently asks which Settings organization to take forward (M3 recommended; M1 overview or M2 inline offered). Combinations are welcome. The browser workbench switcher, destination/category navigation, device search and updated background-state summary also passed [focused checks](../layout-prototype/evidence/management/workbench-checks.json).

## Answer

2026-10-09: the user explicitly selected **M1 Compact summaries for Devices and M3 Category tabs for Settings**. Combine those two destinations with the already approved History and Clip details presentation. Devices keeps the pending-request summary, This device entry and compact Trusted Device list; Settings uses General, Connections and Advanced. The comparison's other variants remain reference evidence.

The user requested one further exploration: icons and color for device connection paths, plus a preferably single icon in History's top row that makes connection health apparent without exact counts. [Explore compact connection status](12-explore-compact-connection-status.md) owns that new question. This selection settles the management organization; it does not answer the separate reset, account or confirmation lifecycle questions.
