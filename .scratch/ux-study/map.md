# Clipp cross-runtime UX study

Labels: wayfinder:map
Status: resolved

## Destination

An evidence-backed, prioritized UX assessment of Electron, the Chrome extension and Android: identify visual inconsistency, missing controls, obsolete controls, clipping/overflow, inefficient control organization and excessive space use, with concrete recommendations and acceptance criteria for subsequent implementation.

## Notes

- Requested by the user on 2026-10-07. This is a study and decision map; changing application behavior is outside this effort. The user explicitly named identity generation and the macOS tray's relay configuration item as examples to investigate, not predetermined findings.
- Use `wayfinder`; use `research` for external platform facts and `grilling` plus `domain-modeling` for user decisions. Use `prototype` only when an evidence-backed layout choice needs a concrete comparison. Charting resolves research tickets only; later sessions claim one eligible ticket before working it.
- Follow [local tracker operations](../../docs/agents/issue-tracker.md#wayfinding-operations). Ticket `Status` and `Blocked by` fields determine the frontier; do not maintain another open-ticket list here. Scan `issues/` in numeric order for open, unclaimed tickets whose blockers are resolved. Only the coordinator writes canonical claims and resolutions.
- Cover the shared app, runtime wrappers, Chrome popup **and** options, Electron tray/native dialogs, Android notifications/permissions/keyboard/Back, Pairing and recovery states. Electron is the most complete runtime reference, not automatic evidence of the correct UX.
- Include first launch, ordinary repeated use, long/dense data, loading, empty, disabled, error and recovery states. Compare pointer/keyboard use with touch; separate logical viewport size, device-pixel ratio, display scaling and text scaling. Native execution and browser rendering are different evidence classes.
- Read [operations](../../docs/agents/operations.md), [architecture](../../docs/agent-guide.md), [glossary](../../GLOSSARY.md), the relevant [accepted ADRs](../../docs/adr/), and settled feature specs before assessing a control. Source/spec conflicts must be recorded, not silently resolved in favor of old prose. Current project instructions require empty managed-relay defaults.
- In particular, [Identity Rotation semantics](../../docs/adr/0004-use-peer-id-as-membership-identity.md) and [accepted relay fallback](../../docs/adr/0012-relay-transport-fallback-and-concurrent-sessions.md) constrain recommendations. A missing manual rotation control is distinct from deciding to add a new user-initiated destructive operation.
- User-confirmed direction, from this chat on 2026-10-07: **shared styling and terminology with layouts adapted to each runtime**; **balanced simple defaults and compact daily use**. These guide the study; they do not pre-approve particular control removals, destructive operations or redesigns.
- Baseline inspected on 2026-10-07: client HEAD `a2e1a64cad05eadb7c567b48e3ec45ce7cd51e33`, branch `codex/agent-workflow-integration`. Existing dirty files: `apps/electron/src/main.ts`, `apps/electron/src/managedRelayAuth.ts`, `tests/electron/managedRelayAuth.test.ts`; untracked `apps/electron/src/trayIcon.ts` and `tests/electron/trayIcon.test.ts`. Preserve them. Refresh source status before each runtime study and record the exact revision plus relevant diff hashes with evidence.
- Use isolated synthetic study data. Preserve existing identities, memberships, relay credentials and personal clipboard contents. Reuse the runtime-specific isolation guidance rather than launching fixtures against the operator installation. Missing native access becomes a named evidence gap, never a claimed visual pass.
- Store assets under this effort or a linked retained local evidence directory. Every finding needs a runtime/surface, scenario, viewport/scaling, reproduction, actual versus expected result, evidence/source pointer, impact, confidence and proposed next action. Distinguish observed defects, source-supported gaps, hypotheses and intentional platform differences.

## Decisions so far

- [Establish platform sizing and interaction constraints](issues/01-establish-platform-constraints.md#answer): official platform constraints, selected accessibility criteria and a measurement matrix now distinguish popup/tab, window/content and native/web evidence.
- [Inventory user flows and control coverage](issues/02-inventory-flows-and-controls.md#answer): four active UI surfaces now have a traced action/state inventory, 23 scenario families and 14 fixture recipes; source-supported gaps are assigned to the existing runtime and decision investigations.
- [Observe Electron flows across window sizes](issues/03-observe-electron-ux.md#answer): 76 native/fixture captures establish 17 findings across responsive controls, recovery, keyboard use and space costs; the report preserves unrun native/display gaps for the final handoff.
- [Observe Chrome popup and options flows](issues/04-observe-extension-ux.md#answer): actual toolbar-popup and options evidence establishes 16 findings across stale state, ineffective controls, styling, feedback and density; 94 captures separate native behavior, response fixtures and remaining native/display gaps.
- [Observe Android layouts and native interactions](issues/05-observe-android-ux.md#answer): 18 findings cover native insets, Back, permissions, notifications, compact windows and enlarged text; the user authorized carrying the documented native gaps into the handoff as unverified follow-up work.

- [Compare history density and navigation](issues/09-compare-history-density-and-navigation.md#answer): the user selected compact rows narrow plus equal-height, multi-column cards wide, rejected B and the wide sidebar, and required a compact toolbar; the revised prototype demonstrates that combination.

- [Compare lightweight narrow toolbars](issues/10-compare-lightweight-narrow-toolbars.md#answer): the user selected Search first, keeping the search field visible and moving scope into Filters; subsequent visual refinements belong to the layout decision.

- [Compare Devices and Settings organization](issues/11-compare-devices-and-settings-organization.md#answer): the user selected M1 Compact summaries for Devices and M3 Category tabs for Settings, alongside the approved History design.

- [Explore compact connection status](issues/12-explore-compact-connection-status.md#answer): keep device statuses as text; use the S2 header icon family with the original direct triangle and attention for partial relay problems.

- [Decide visual consistency and efficient layout](issues/07-decide-layout-and-visual-direction.md#answer): finalize the selected visual system with scrolling in cramped layouts, full-screen narrow tasks, compact issue summaries and session draft retention.

- [Decide missing controls and obsolete entry points](issues/06-decide-control-gaps-and-retirements.md#answer): approve reset safeguards, Chrome action allocation, deletion confirmations, relay account scope and routine control cleanup.

- [Observe native window and popup lifecycle](issues/13-observe-native-window-and-popup-lifecycle.md#answer): native popup/host, conditional natural worker stop/wake, SQLite retry and automatic Identity Loss now have bounded evidence; the manual tray result qualifies the earlier Dock finding.

- [Qualify desktop display scaling and accessibility](issues/15-qualify-display-scaling-and-accessibility.md#answer): actual OS scaling and native keyboard/window checks strengthen existing findings; display restored, with hardware, VoiceOver and remaining text/fullscreen prerequisites explicit.

- [Observe live Pairing and account journeys](issues/14-observe-live-pairing-and-account-journeys.md#answer): targeted Pairing, failure/recovery and native clipboard evidence is recorded; the user accepted carrying the exact remaining native gaps into implementation validation as unverified.

- [Prioritize the UX findings and handoff](issues/08-prioritize-ux-study-handoff.md#answer): the completed assessment retains 51 runtime findings, three control additions, approved priorities/contracts and explicit unverified follow-ups; the study is complete.

## Not yet specified

None. All study decisions are resolved; the handoff preserves implementation acceptance and explicitly unverified follow-up work.

## Out of scope

- Implementing or committing app fixes, changing accepted identity/membership/relay semantics, deployment and release qualification. Findings can propose a separate decision or implementation effort.
- Relay server/operator-console redesign, protocol performance benchmarking and unrelated managed-relay qualification backlog.
- Claiming exhaustive coverage of every device/resolution or native behavior from screenshots of a browser surrogate.
