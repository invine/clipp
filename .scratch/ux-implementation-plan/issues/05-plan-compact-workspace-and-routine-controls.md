# Plan compact workspace and routine control delivery

Type: grilling
Labels: wayfinder:grilling
Mode: HITL
Status: resolved
Assignee: Codex (current session)
Parent: [Clipp UX implementation planning](../map.md)
Blocked by: 03, 04

## Question

How should the accepted History, Devices and Settings workspace replace current surfaces in bounded increments while incorporating reusable first-band styling/accessibility repairs and the appropriate routine additions?

Plan shared local icons, semantic styles and persisted System/Light/Dark; compact branding/status above Search; Filters/Send and named icon actions; narrow rows/equal-height wide grids and full Clip details; M1 Devices with text statuses; M3 Settings; and the S2 header status. Preserve the [approved layout contract](../../ux-study/layout-state-contract.md), runtime capability differences, large-text reflow and native safe bounds. Exact tokens/breakpoints are implementation tuning against that contract, not a new visual decision.

Identify reusable components, host stylesheet/sizing entry points and a migration order for Electron, Android, popup and full-page Chrome. Full-page action/state/error parity and secure task handoff must exist before old popup management is retired. Include long values, Unicode-safe previews, search/no-match, recovery composition and drafts without duplicate control ownership.

Allocate the three priority bands explicitly: foundations needed for readable/reachable controls remain first-band; complete workspace organization is second-band; alias clearing, real retention/Clip Sharing Lifetime wiring and other routine controls may accompany the appropriate component as already permitted. The advanced identity reset has its own durable-lifecycle decision. Keep inactive control removal separate from falsely implying a replacement setting works before it is wired through core and every runtime.

Resolution should produce candidate delivery slices and cutover/retirement criteria, trace remaining layout/control findings and additions, and identify integration dependencies on correctness/native work. No prototype geometry or browser fixture substitutes for native implementation acceptance.

## Comments

Claimed 2026-10-10 as the next frontier at the user's request to continue until a concrete confirmation is needed. Prepare the complete proposed workspace delivery breakdown and review it before asking for the unresolved planning decision. Preserve approved visuals, runtime surface roles, shared interfaces, correctness/native ownership and coverage dispositions. No application implementation, native checks or execution-ticket dispatch occurs in this planning round.

The [workspace delivery proposal](../workspace-delivery-proposal.md) defines eight reviewable packages, early access/theme/reflow repairs, functional-before-retirement Chrome gates, settings wiring and candidate acceptance. It proposes workspace closure collectors for 27 findings while preserving the 15 correctness and nine native collectors. Alias clearing accompanies Devices, sharing lifetime accompanies real settings replacement, and manual identity reset remains with its dedicated lifecycle decision.

Read-only source investigations confirmed the host stylesheet/sizing gaps, missing effective theme preference, Unicode preview slicing, Chrome peer-read failures mapped to empty arrays, existing empty-string alias clear and current retention/lifetime semantics. Three proposal audits found no remaining blocker or additional product decision after link and ownership clarifications. Basic pending access remains first-band for A10; C02 does not close after inactive-control removal alone. The sole current question is adoption of the delivery breakdown and proposed closure collectors; settled visual and domain choices are not reopened.

## Answer

Resolved 2026-10-10 after the user selected **“Adopt the workspace delivery plan (Recommended)”**. Adopt the [workspace delivery breakdown](../workspace-delivery-proposal.md), its eight package scopes, proposed closure collectors and staged cutover criteria for final consolidation.

Shared assets/controls, working themes, accessible navigation and minimum reflow stay in correctness. Complete History/details, S2, M1 Devices and M3 Settings follow using existing state/session/task/native modules. Alias clearing accompanies Devices; real retention and Clip Sharing Lifetime form an independently verifiable settings step. Manual identity reset remains with its dedicated lifecycle decision. Chrome full-page action/state/error/draft/focus parity and secure handoff must pass before retiring old management paths; final density polish is not a circular prerequisite for functional management.

The 27 workspace-primary collectors combine their own work with required correctness/native evidence; the 15 correctness and nine native primary findings retain their owners. All 51 findings and three separate additions remain accounted for. A10 includes early pending-work access, C02 requires functioning replacements as well as obsolete-control removal, and C15 requires complete cross-surface evidence. No finding is declared fixed by this planning resolution.

The accepted visual, domain, priority and coverage decisions remain unchanged. No new decision ticket emerged. [Design the durable manual identity-reset boundary](06-design-durable-manual-identity-reset.md) is next; continue preparing it under the user's standing request to work until another concrete confirmation is needed. Final execution tickets remain with the last planning decision; no implementation or native activity is started.
