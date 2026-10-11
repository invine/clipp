# Deliver accessible navigation and task reflow

Type: implementation
Status: claimed
Assignee: ux-navigation-19
Priority band: 1
Blocked by: 07, 12, 32
Dispatch: authorized UX implementation run ux-implementation-20261010; coordinator claim ux-navigation-19
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
- [Deliver local assets and Android shared controls](32-deliver-local-assets-and-android-shared-controls.md) — consume its completed compatible asset/control interface and Android control contribution.

The refined prerequisite supplies compatible source and its qualified Android scope. [Residual desktop controls](17-unify-local-assets-and-shared-controls.md) keep their missing G13/G14 qualification. This consumer still requires every affected desktop/native presentation gate in its own accepted scope; source compatibility is not desktop qualification.

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

## Dispatch assessment — 2026-10-12

Hard predecessors 07/12/32 are resolved; ticket 19 is the next eligible unclaimed urgent access output. The coordinator claims `ux-navigation-19`, isolated branch `codex/ux-19-navigation` and worktree `/Users/invine/src/js/clipp/.local/ux-implementation/worktrees/ticket-19` from this claim commit, following reviewed theme integration `4d8cb331c9ec52f36e3ea2990d5daa097da32655` (117 suites/849 tests/all three builds). Preparation/context remain outside disposable worktrees: `/private/tmp/clipp-ux-implementation-20261010/ticket-19-prep.md` and the run directory `ticket-19-dispatch-context.md`.

This delivery preserves one document-lived UiSession, measured host geometry, authoritative settings/actions and pending/response versus Membership semantics, retained raw/newer/failed drafts and ADR-0012. It introduces no new router or product store and preserves Chrome11/nativeBack13/compact21/23/24 boundaries. Consume the integrated Appearance owner without moving applied settings into UiSession. Existing17/08/10 native gaps are not passes; all affected19 Candidate gates and external/retained deferrals remain required.

Root owns serialized native/rendered/broad checks and both-axis review/integration/resolution. No host clipboard/global setting/native launch is implied. The user explicitly approved temporary guest-only root and IPv4/IPv6 firewall checks after automatic approval review rejected the earlier privilege escalation; fresh root ownership and actual policy/readback still precede Android UI. The earlier e276 guest closed before UI with all scalars/Qt restored.
