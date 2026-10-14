# Deliver M1 Devices, Requests and alias clearing

Type: implementation
Status: open
Assignee: none
Priority band: 2
Blocked by: 04, 05, 07, 33, 35, 17, 18, 19, 21, 22
Dispatch: plan approved; awaiting an authorized execution run
Parent: [Clipp UX implementation](../spec.md)

## Outcome

M1 Devices gives compact trusted-device summaries, reachable Requests and alias clearing.

## Work and boundaries

Keep Device statuses as text; show full names/IDs on demand and pending access without long traversal. Use device name clears only the local alias via existing capability and corrected saves. Preserve Pairing/approval and existing Revoke action/review while reorganizing.

Trusted is not connected; no guessed device platform. Alias clear does not alter identity/name. Revoke remains permanent remove-wins membership behavior; manual reset does not revoke the old identity.

The [approved package contract](../../ux-implementation-plan/workspace-delivery-proposal.md#m1-devices-requests-and-alias-clearing) is normative detail for this ticket. Preserve the [shared interfaces](../../ux-implementation-plan/shared-interface-proposal.md) and [specification invariants](../spec.md#preserved-contracts). Update every affected live runtime bridge with its consumer; do not leave a successful helper behind a broken caller.

## Dependencies and integration

- [Retain Device Name and alias edits](04-retain-name-and-alias-edits.md) — consume its completed, scoped output.
- [Report immediate Pairing and approval results](05-report-immediate-pairing-results.md) — consume its completed, scoped output.
- [Preserve session tasks and editor recovery](07-preserve-session-tasks-and-editor-recovery.md) — consume its completed, scoped output.
- [Deliver the compatible Pairing outcome interface and Electron journey](33-deliver-pairing-outcome-interface-and-electron-journey.md) — consume its completed, scoped output.
- [Deliver complete Chrome management, secure handoff and task input](35-deliver-chrome-management-and-task-input.md) — consume its completed, scoped output.
- [Unify local assets and shared controls](17-unify-local-assets-and-shared-controls.md) — consume its completed, scoped output.
- [Implement persisted System, Light and Dark](18-implement-persisted-themes.md) — consume its completed, scoped output.
- [Deliver accessible navigation and task reflow](19-deliver-accessible-navigation-and-reflow.md) — consume its completed, scoped output.
- [Deliver compact History and full details](21-deliver-compact-history-and-details.md) — consume its completed, scoped output.
- [Present the S2 connection summary](22-present-s2-connection-summary.md) — consume its completed, scoped output.

Only the output scoped here must be complete to resolve this ticket. Later consumers requalify their changed presentation; broad finding collection is separate and cannot block this ticket on its own descendants. Follow [phase admission](../spec.md#delivery-order-and-completion) rather than treating file numbers as an execution sequence.

## Verification and acceptance

Test dense devices/requests, complete values and Copy, alias-clear rejection, stale request, approval/version failure and notification entry. Preserve Revoke Cancel/confirm, failure/Retry and live state. Collect S2/preview/notification evidence for E12/E16 without making earlier packages wait on this screen.

Run the [common candidate gates](../spec.md#verification-and-evidence) plus affected suites/builds/native checks. Record exact revision/dirty state, environment, commands and actual outcomes. Preserve regressions through the owning interface; use rendered/native evidence for the behavior that requires it, not implementation-mirroring helper tests.

## Coverage and closure

Candidate control/alias/revocation UI; native notifications required for claimed selection route. Real revocation convergence remains named qualification.

The [coverage ledger](../validation-coverage.md) specifies Candidate, External and Retained dispositions and fresh native intervals. Required missing evidence leaves the affected portion unqualified; report it explicitly. No old observation or planning approval is a pass. Primary finding collector: E12, E16 Full finding closure requires all [traceability contributions](../traceability.md), not merely this ticket's completion. Separate additions keep their own names and are not counted as new runtime findings.

## Source anchors

- [ClipboardApp.tsx](../../../packages/ui/src/ClipboardApp.tsx)
- [identity.ts](../../../packages/core/trust/identity.ts)
- [pending.ts](../../../packages/core/pairing/pending.ts)
- [reconciliation.ts](../../../packages/core/membership/reconciliation.ts)
- [presentation.test.ts](../../../tests/core/pairing/presentation.test.ts)

## Handoff

Coordinator records the fresh baseline/claim, accepted decision assessment, isolated worktree, integration revision, checks and Standards/Spec review under [project workflow](../../../docs/agents/workflow.md). Preserve unrelated work. No code, native operation, commit, push or deployment has occurred for this planning ticket.

## Pairing scope refinement — 2026-10-12

Consume ticket 33's completed common interface and scoped Electron evidence. Residual ticket 10 retains required Android/Chrome native journeys. This consumer retains every affected host/native/cutover qualification; Electron G01 is not a cross-runtime pass.

## Host delivery allocation — DRAFT 2026-10-14

Proposed under the approved cross-runtime refinement and existing-task/functional-management integration boundaries.34 supplies Android/Electron generic native input against resolved07/12/32;35 co-delivers complete Chrome management and Chrome13 input against resolved02/03/06/07/08/32/33. Original13/11 remain collectors;17/19/15/16/10 keep every residual desktop/navigation/scanner/notification/Pairing gate and contribution. Each consumer retains its own affected presentation/native/cutover gates. Consume genuinely completed scoped outputs only; no source-only resolution or finding closure. Root must accept and apply the full allocation before any new claim.
