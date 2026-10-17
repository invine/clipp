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

## Reviewed source integration — 2026-10-12

Source `de22911bfcdac7a701d68d9f9add1624c2474acf` received one Spec P2 finding: Open Auto Sync recovery reached History after the control moved to Settings. Standards reported two minor duplication findings. The owning route regression and focus/dismissal repairs are committed at `4a3f1b5f198eea1d21754467901fd1fdf262ee22`; renewed Standards and Spec reviews both pass with no actionable findings. All original reports, RED cases and failed attempts remain preserved.

Mandatory merger integrated the exact reviewed source at `d75cec0ca0d24241a745bb1e940aacaa7989329d`, complete tree `71aa9bab17ceeed2a9b7b6cc88b877db7007bca6`. All thirteen source hashes match. Fresh integrated verification passes 118 suites/852 tests and all three builds, zero lint errors; production assets are individually mapped and the internal virtual extension manifest difference is disclosed. The final rendered matrices pass 36 Electron-style, 37 Android-style and 24 Chrome-style cases, with their limited host scopes explicit. Evidence lives in `ticket-19-review-handoff.md`, `ticket-19-review-source-evidence.json`, both `ticket-19-4a3f-*-review.md` reports and `ticket-19-integration-merge-receipt.json` under the ignored run directory.

Native G13/G14/G15/G25/G27/G28 and affected G38–40 remain required and unrun for this changed source. Research did not establish a public macOS reading-size signal for Electron, so G14 remains unqualified and another desktop test environment is being sought. This is no waiver or change to Candidate/External/Retained dispositions. Ticket 19 remains claimed.

## Current Chrome supporting input observation — 2026-10-16

On b415 production full-page Chrome, native typing, Device Name task focus, Escape return focus, retained Search/draft on reopen and actual Save passed specific direct checks. Zoom-in chords enlarged visible text and reset restored layout; exact zoom percentage was not independently read. Evidence: ignored run `ticket35-native-fullpage-b415/observations.json`; complete navigation/reflow, bounds/text/spacing/control/input/focus matrices remain unqualified. This is no whole19 or35 acceptance;19 stays claimed and every earlier failed/unavailable gate remains.

## Incoming Devices focus repair — 2026-10-17

Source `a2c235b7bc3bd7b462092171b2406cff57d20475` repairs an accepted Devices destination retaining the previous logical focus key. The existing UiSession public destination regression fails on the prior source and passes with the named Devices navigation target; the History query remains retained. Pinned Node24 full check and the unchanged actual project hook pass152 suites/1,150 tests. Mandatory fast-forward integration preserves source/tree ancestry; source and integration were clean. Exact source/check/hook/merge evidence is in ignored run `resume19-handoff-20261017.json` and `resume19-merge-20261017.json`. The initial Node26/sandbox check failure remains preserved.

19 remains claimed: these owning-interface tests do not qualify its required current native/text/input/focus/reflow matrices. TT35's separate acceptance remains unchanged. The coordinator's final incremental reviews and integrated routine result are recorded in ignored run `resume19-29-integrated-verification-20261017.json`; no native or finding closure is inferred.
