# Deliver accessible navigation and task reflow

Type: implementation
Status: open
Assignee: none
Priority band: 1
Blocked by: 07, 12, 17
Dispatch: plan approved; awaiting an authorized execution run
Parent: [Clipp UX implementation](../spec.md)

## Outcome

Search, navigation, pending access and task actions remain reachable across boundaries and large text.

## Work and boundaries

Implement approved Clipp/status line above Search, compact controls and one Filters scope. Use one live session, accessible named navigation, a bounded task scroller and native bounds. Repair exact1100/320/short/200% access on existing content before final grid density. Basic pending entry is first-band.

No permanent sidebar, duplicate wide All/Pinned or hidden compact Search. Preserve drafts/query/focus; uniform cards may gain shared height/fewer columns or switch to rows, never masonry or shrinking user text.

The [approved package contract](../../ux-implementation-plan/workspace-delivery-proposal.md#accessible-responsive-navigation-and-task-presentation) is normative detail for this ticket. Preserve the [shared interfaces](../../ux-implementation-plan/shared-interface-proposal.md) and [specification invariants](../spec.md#preserved-contracts). Update every affected live runtime bridge with its consumer; do not leave a successful helper behind a broken caller.

## Dependencies and integration

- [Preserve session tasks and editor recovery](07-preserve-session-tasks-and-editor-recovery.md) — consume its completed, scoped output.
- [Integrate Android content bounds and IME](12-integrate-android-content-bounds.md) — consume its completed, scoped output.
- [Unify local assets and shared controls](17-unify-local-assets-and-shared-controls.md) — consume its completed, scoped output.

Only the output scoped here must be complete to resolve this ticket. Later consumers requalify their changed presentation; broad finding collection is separate and cannot block this ticket on its own descendants. Follow [phase admission](../spec.md#delivery-order-and-completion) rather than treating file numbers as an execution sequence.

## Verification and acceptance

Test boundary widths, 340x350, long fields/errors, task focus/return, full QR/fallback and final control reachability. Require actual popup enlargement/fullscreen and Android IME/text/input evidence for affected claims; later History and scanner add their consumer evidence.

Run the [common candidate gates](../spec.md#verification-and-evidence) plus affected suites/builds/native checks. Record exact revision/dirty state, environment, commands and actual outcomes. Preserve regressions through the owning interface; use rendered/native evidence for the behavior that requires it, not implementation-mirroring helper tests.

## Coverage and closure

Candidate responsive/input/text/QR checks. Native input integration validates the host route separately; C15/A18 collection cannot create a dependency cycle.

The [coverage ledger](../validation-coverage.md) specifies Candidate, External and Retained dispositions and fresh native intervals. Required missing evidence leaves the affected portion unqualified; report it explicitly. No old observation or planning approval is a pass. Primary finding collector: E03, E04, E06, E07, C06, A10, A14, A15, A18 Full finding closure requires all [traceability contributions](../traceability.md), not merely this ticket's completion. Separate additions keep their own names and are not counted as new runtime findings.

## Source anchors

- [ClipboardApp.tsx](../../../packages/ui/src/ClipboardApp.tsx)
- [styles.css](../../../packages/ui/src/styles.css)
- [popup.tsx](../../../apps/extension/src/popup.tsx)
- [main.tsx](../../../apps/android/src/main.tsx)

## Handoff

Coordinator records the fresh baseline/claim, accepted decision assessment, isolated worktree, integration revision, checks and Standards/Spec review under [project workflow](../../../docs/agents/workflow.md). Preserve unrelated work. No code, native operation, commit, push or deployment has occurred for this planning ticket.
