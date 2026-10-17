# Simplify the desktop tray and qualify Dock behavior

Type: implementation
Status: claimed
Assignee: ux-tray-26
Priority band: 3
Blocked by: none
Dispatch: 2026-10-15 coordinator claim; small related tray cleanup alongside ongoing native task-input work
Parent: [Clipp UX implementation](../spec.md)

## Outcome

The tray has one useful Open Clipp command and verified window/Dock behavior.

## Work and boundaries

Remove duplicate Configure Relays. Revalidate actual close-to-tray/Open before conditionally fixing Dock; retain conflicting historical evidence. Keep normal minimize/restore/focus and session context.

Dock visible while main window is open, hidden on close-to-tray; ordinary Quit stays normal. Do not repair a nonreproduced bug or use inspection activation as proof of tray behavior.

The [approved package contract](../../ux-implementation-plan/native-host-delivery-proposal.md#desktop-tray-and-window-behavior) is normative detail for this ticket. Preserve the [shared interfaces](../../ux-implementation-plan/shared-interface-proposal.md) and [specification invariants](../spec.md#preserved-contracts). Update every affected live runtime bridge with its consumer; do not leave a successful helper behind a broken caller.

## Dependencies and integration

No technical predecessor. The approved phase admission rule still applies.

Only the output scoped here must be complete to resolve this ticket. Later consumers requalify their changed presentation; broad finding collection is separate and cannot block this ticket on its own descendants. Follow [phase admission](../spec.md#delivery-order-and-completion) rather than treating file numbers as an execution sequence.

## Verification and acceptance

Observe actual tray selection, close/open/minimize and normal window states with passive logs. Verify draft/query remains. If Dock already complies, record pass with no speculative change. Test actual menu reachability separately from constructed callbacks.

Run the [common candidate gates](../spec.md#verification-and-evidence) plus affected suites/builds/native checks. Record exact revision/dirty state, environment, commands and actual outcomes. Preserve regressions through the owning interface; use rendered/native evidence for the behavior that requires it, not implementation-mirroring helper tests.

## Coverage and closure

Candidate tray/window evidence; VoiceOver remains unverified. A small related tray cleanup can accompany authorized host work without delaying correctness.

The [coverage ledger](../validation-coverage.md) specifies Candidate, External and Retained dispositions and fresh native intervals. Required missing evidence leaves the affected portion unqualified; report it explicitly. No old observation or planning approval is a pass. Primary finding collector: E10, E17 Full finding closure requires all [traceability contributions](../traceability.md), not merely this ticket's completion. Separate additions keep their own names and are not counted as new runtime findings.

## Source anchors

- [main.ts](../../../apps/electron/src/main.ts)
- [renderer.tsx](../../../apps/electron/src/renderer.tsx)

## Handoff

Coordinator records the fresh baseline/claim, accepted decision assessment, isolated worktree, integration revision, checks and Standards/Spec review under [project workflow](../../../docs/agents/workflow.md). Preserve unrelated work. No code, native operation, commit, push or deployment has occurred for this planning ticket.

## Dispatch assessment — 2026-10-15

Claim ux-tray-26. The approved native package explicitly permits a small related tray cleanup alongside host work without delaying urgent correctness. Tickets20 and34 retain urgent acceptance priority; the stalled Android worker experiment is parked. Remove the known duplicate Configure Relays entry while root qualifies existing native input. Preserve all existing window/session behavior. Dock repair remains conditional on an actual reproduced failure; no speculative change. No protocol, authority, glossary, storage or ADR change is requested.

Source baseline18cd65a321a622b37363093228da957042e011d0; isolated codex/ux-26-desktop-tray branch/worktree. Use existing actual Electron menu/window lifecycle seams and TDD for any behavioral code change. Do not add a test that merely mirrors a menu literal. Native actual tray selection, close/Open, minimize/restore, Dock and live draft/query remain required; callback fixtures cannot qualify them. Existing approvals persist; no sign-in, push or deployment. Root owns native runs, reviews, merger and resolution; at most two implementers, ticket20 and26, after ticket34 source handoff.

## Reviewed source integration and native blocker — 2026-10-15

Source e5f2407d25a13e3ecd85b8cca27057f52dd590a9 removes exactly the duplicate Configure Relays tray item. Existing Open Clipp/Quit callbacks and window/session behavior are unchanged; no nonreproduced Dock repair was made. Both source review axes pass, mandatory merger integrated at55870d7dae378cfef9b88aa620ae725864a79bac, and fresh integrated verify passes139 suites/962 tests/all three builds.

Root attempted actual native acceptance using a fresh owned disposable profile, production main/preload/renderer and protected process-local clipboard. Actual close-to-tray hid the earlier owned window, but status-menu inspection timed out. A later attempt returned conflicting accessibility/pixels, missing frames and finally ScreenCaptureKit.SCStreamErrorDomain -3811 after tool-session recovery. No actual tray selection, reliable Open/minimize/restore/Dock or normal Quit pass is inferred. All owned runtime PIDs/sessions are closed; profiles/helpers/backups are preserved inert. Source cleanup is integrated; ticket26 remains claimed until these required native gates can be measured.

Evidence: private ticket-26-tray-source/handoff.json; ignored run tickets-20-26-source-{standards,spec}-review.md, tickets-20-26-merge-receipt.json, tickets-20-26-integrated-verification.json and manual-electron-tray-20261015-a6e8ec4b/observations-and-closure.json. No approval is requested again; standing user authorization remains valid. VoiceOver and all earlier deferrals remain recorded.

## Current native retry — 2026-10-16

A fresh disposable profile on source `a096b35b1bdefa4d6b72acb8697a7fc71f284441` rendered the production Electron window and accepted synthetic Search text. The existing passive launcher used process-local clipboard memory only. Native control then returned unchanged/stale Settings state and `noWindowsAvailable`; a normal Quit attempt did not establish termination. No tray/Open/minimize/Dock/Quit or retained-editor qualification is inferred. The exact owned process/group was closed after UID/command/profile verification; source assets were unchanged and the inert profile/logs are preserved at ignored run `manual-electron-tray-20261016-a721c35b/observations-and-closure.json`. Ticket26 remains claimed; every earlier failed observation and VoiceOver limit remains.

## Bounded current-candidate retry — 2026-10-16

Reused the existing passive launcher with only fresh profile/title/output paths on production source `b415af1508e70e84a4ca061726057839e9d1620f`; process-local clipboard memory prevented host access. The native window rendered, but AX exposed only window/menu controls and a screenshot-based Search action failed `Computer Use server error -10005: noWindowsAvailable` before typing. Normal CmdQ did not establish termination. After UID/launcher/profile verification, root closed the exact owned process and independently confirmed the group absent; assets stayed unchanged and the inert profile remains preserved. Evidence: ignored run `manual-electron-tray-20261016-b415f9e1/observations-and-closure.json`. No new harness or speculative Dock change was made. Tray/Open/minimize/restore/Dock/query/draft/normal Quit remain unqualified;26 stays claimed and all earlier failures remain.

## Actual tray defect and resumed implementation — 2026-10-17

The user selected actual tray Open Clipp for owned “Clipp Native edd1b412” and reports “Window returned; Dock icon missing”. Frozen passive evidence corroborates a visible focused window with dockVisible=false; subsequent hide is preserved. Original Electron assets remain byte-identical through7518306. Receipt: ignored `electron-distinct-bundle-edd1b412/tray-reopen-human-20261017.json`. This reproduces the spec's conditional Dock defect and authorizes its bounded repair; inspection activation alone is not used as tray evidence.

Resume existing ux-tray-26 in clean preserved ticket-26 worktree/branch at e5f2407d25a13e3ecd85b8cca27057f52dd590a9; incorporate current integration7518306 before editing. Restore only missing ignored Husky helper/shims from sanitized integration, without npm prepare. Use existing owning main/window/tray seams and meaningful TDD, preserving normal minimize/restore/Quit/session context. No second focus manager or global host setting. Root owns native fixed-candidate qualification, reviews, mandatory merger and resolution. At most two source implementers: ongoing34 acceptance work and resumed26, replacing completed20.26 remains claimed until fixed real tray/Dock and remaining required native checks pass.
