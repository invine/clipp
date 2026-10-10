# Simplify the desktop tray and qualify Dock behavior

Type: implementation
Status: open
Assignee: none
Priority band: 3
Blocked by: none
Dispatch: plan approved; awaiting an authorized execution run
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
