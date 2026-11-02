# Establish platform sizing and interaction constraints

Type: research
Labels: wayfinder:research
Mode: AFK
Status: resolved
Assignee: Codex UX study coordinator / platform research agent
Parent: [Clipp cross-runtime UX study](../map.md)
Blocked by: none

## Question

Which authoritative platform constraints and accessibility criteria should govern a fair UX assessment of Electron on macOS, Chrome extension popup/options and Android?

Research official Chrome popup size/lifetime restrictions and options behavior; Electron window bounds versus content bounds and fullscreen/maximized distinctions; Android adaptive layouts, edge-to-edge insets, keyboard resizing and font/display scaling; relevant primary accessibility criteria for reflow, text resizing, keyboard focus, contrast and target size. Distinguish requirements from guidelines and CSS pixels from native units. Avoid importing a platform's navigation pattern as an automatic product requirement.

Return a concise criterion table and practical representative study matrix. Cite each factual claim to a primary source, date the research and flag version-dependent behavior. This ticket establishes assessment criteria, not proof that Clipp violates them. Use the research skill in a background agent, capture the single findings file on `research/clipp-ux-platform-constraints`, and record its branch/commit and asset link on resolution.

## Comments

- 2026-10-07: Claimed by the coordinator before dispatch. Research runs separately from the user's dirty checkout and may be resolved during wayfinder charting.

## Answer

Resolved on 2026-10-07 by the UX study coordinator after reviewing the background research. [Platform constraints for the Clipp UX study](../platform-constraints.md) contains the criterion tables, measurement rules, source citations and proposed sampling matrix.

Chrome toolbar popups and full-tab options have different size/lifetime constraints. Electron outer-window bounds must be distinguished from content bounds and fullscreen from maximized state. Android insets, keyboard, window resizing and nonlinear font scaling require native observation. Selected WCAG criteria provide explicit web-UI checks without claiming complete accessibility certification or treating native dp as CSS px.

The source-requested 800px popup height versus Chrome's documented 600px cap is a specific runtime risk for [Observe Chrome popup and options flows](04-observe-extension-ux.md), not a claimed observed clipping defect. No new child ticket is needed because that investigation already includes host sizing and control reachability.

Research provenance: branch `research/clipp-ux-platform-constraints`, commit `64bc75f60d41011c6facb9500cdf3fb169dac3ac`, based on `a2e1a64cad05eadb7c567b48e3ec45ce7cd51e33`. The canonical linked copy has Markdown formatting only after transfer. The isolated research worktree was clean after commit. Staged diff and canonical Markdown formatting checks passed. No application was launched, no native visual check ran, and no application source changed for this ticket. Installed-version and native-rendering questions remain with the runtime investigations.
