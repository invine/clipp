# Deliver compact History and full details

Type: implementation
Status: claimed
Assignee: ux-compact-history-21
Priority band: 2
Blocked by: 02, 03, 07, 35, 17, 18, 19
Dispatch: authorized UX implementation run ux-implementation-20261010; coordinator claim ux-compact-history-21
Parent: [Clipp UX implementation](../spec.md)

## Outcome

History uses compact narrow rows and equal-height wide columns with full inspectable details.

## Work and boundaries

Reuse repaired actions and session/query state; adopt approved two-row top area, top-aligned grid and details task. Full-page Chrome owns details/Delete; popup remains recent/search/Copy/Pin/Send. Use grapheme-safe previews for content and relevant names; full values stay available.

No masonry, stretched single-card viewport track, new sidebar, row Delete, duplicate wide scope switch or hover-only content access. Preserve Chrome session pin limit and copied-without-clip feedback.

The [approved package contract](../../ux-implementation-plan/workspace-delivery-proposal.md#compact-history-full-details-and-safe-preview-text) is normative detail for this ticket. Preserve the [shared interfaces](../../ux-implementation-plan/shared-interface-proposal.md) and [specification invariants](../spec.md#preserved-contracts). Update every affected live runtime bridge with its consumer; do not leave a successful helper behind a broken caller.

## Dependencies and integration

- [Reconcile authoritative History and queries](02-reconcile-authoritative-history.md) — consume its completed, scoped output.
- [Confirm and recover Clear all local history](03-confirm-clear-all-history.md) — consume its completed, scoped output.
- [Preserve session tasks and editor recovery](07-preserve-session-tasks-and-editor-recovery.md) — consume its completed, scoped output.
- [Deliver complete Chrome management, secure handoff and task input](35-deliver-chrome-management-and-task-input.md) — consume its completed, scoped output.
- [Unify local assets and shared controls](17-unify-local-assets-and-shared-controls.md) — consume its completed, scoped output.
- [Implement persisted System, Light and Dark](18-implement-persisted-themes.md) — consume its completed, scoped output.
- [Deliver accessible navigation and task reflow](19-deliver-accessible-navigation-and-reflow.md) — consume its completed, scoped output.

Only the output scoped here must be complete to resolve this ticket. Later consumers requalify their changed presentation; broad finding collection is separate and cannot block this ticket on its own descendants. Follow [phase admission](../spec.md#delivery-order-and-completion) rather than treating file numbers as an execution sequence.

## Verification and acceptance

Test empty/no-match/one/dense data, identical previews, long Unicode, pin/unpin/removal, full content and actual Copy/Send failure. Measure minimum/restored/maximized/fullscreen, actual short popup, phone/landscape, 320px and100/intermediate/200% text; final item/actions remain reachable.

Run the [common candidate gates](../spec.md#verification-and-evidence) plus affected suites/builds/native checks. Record exact revision/dirty state, environment, commands and actual outcomes. Preserve regressions through the owning interface; use rendered/native evidence for the behavior that requires it, not implementation-mirroring helper tests.

## Coverage and closure

Candidate density/reflow/clipboard paths; external displays/assistive gaps and broad transfer qualification retain their separate states.

The [coverage ledger](../validation-coverage.md) specifies Candidate, External and Retained dispositions and fresh native intervals. Required missing evidence leaves the affected portion unqualified; report it explicitly. No old observation or planning approval is a pass. Primary finding collector: E08, E15, C13, A12 Full finding closure requires all [traceability contributions](../traceability.md), not merely this ticket's completion. Separate additions keep their own names and are not counted as new runtime findings.

## Source anchors

- [ClipboardApp.tsx](../../../packages/ui/src/ClipboardApp.tsx)
- [styles.css](../../../packages/ui/src/styles.css)
- [clipboardActionFeedback.ts](../../../packages/ui/src/clipboardActionFeedback.ts)
- [ClipHistoryList.tsx](../../../apps/extension/src/components/ClipHistoryList.tsx)

## Handoff

Coordinator records the fresh baseline/claim, accepted decision assessment, isolated worktree, integration revision, checks and Standards/Spec review under [project workflow](../../../docs/agents/workflow.md). Preserve unrelated work. No code, native operation, commit, push or deployment has occurred for this planning ticket.

## Host delivery allocation — DRAFT 2026-10-14

Proposed under the approved cross-runtime refinement and existing-task/functional-management integration boundaries.34 supplies Android/Electron generic native input against resolved07/12/32;35 co-delivers complete Chrome management and Chrome13 input against resolved02/03/06/07/08/32/33. Original13/11 remain collectors;17/19/15/16/10 keep every residual desktop/navigation/scanner/notification/Pairing gate and contribution. Each consumer retains its own affected presentation/native/cutover gates. Consume genuinely completed scoped outputs only; no source-only resolution or finding closure. Root must accept and apply the full allocation before any new claim.

## Dispatch assessment — 2026-10-24

Coordinator claims `ux-compact-history-21` after resolved predecessors 02/03/07/35/17/18/19, including completed18/19. Consume their scoped qualified outputs and the exact [Chrome Options fullscreen Search-return exclusion](../decisions/20261024-chrome-options-fullscreen-search-return-exclusion.md); this supplies no broader acceptance for changed compact consumers. Preserve one document-lived UiSession, authoritative Clip/query/action state, honest unknown status and ADR-0012; this dispatch changes no accepted invariant.

Client baseline is clean `b9afeb48485ce277a9d75dee71c6fc53c767c045` / tree `08d6f3ca6d7a3b1b67e9cf97fbe8e3ac156dc86a` before coordinator documentation. The coordinator records the resulting claim commit and inspected isolated branch/worktree before source dispatch. No branch, worktree, implementation, native interval or new test result is asserted by this claim. Root serializes broad/native/clipboard/global-setting operations; at most two source implementers across the run, with other claimed owners idle or blocked as recorded. All ticket verification, finding collection and External/Retained boundaries remain.
