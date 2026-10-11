# Deliver complete Chrome management and secure handoff

Type: implementation
Status: open
Assignee: none
Priority band: 1
Blocked by: 02, 03, 06, 07, 08, 33, 13, 17, 19
Dispatch: plan approved; awaiting an authorized execution run
Parent: [Clipp UX implementation](../spec.md)

## Outcome

Canonical full-page Chrome provides complete live management before popup management is retired.

## Work and boundaries

Compose functional shared details, Requests, Pairing, editors, relay/settings and Clear consumers; co-deliver the minimum details/settings presentation needed now. Implement authenticated runtime.Port handoff plus session mailbox, exact canonical page URLs, idle reuse and new tab when occupied. Keep old entries until parity passes.

No popup draft survival, content-script access or full-page current-clipboard Send/focus capture. Future density/M1/M3 polish and reset are not prerequisites. Stale entities reconcile to the correct list; no silent task replacement.

The [approved package contract](../../ux-implementation-plan/correctness-delivery-proposal.md#complete-chrome-management-and-secure-destination-handoff) is normative detail for this ticket. Preserve the [shared interfaces](../../ux-implementation-plan/shared-interface-proposal.md) and [specification invariants](../spec.md#preserved-contracts). Update every affected live runtime bridge with its consumer; do not leave a successful helper behind a broken caller.

## Dependencies and integration

- [Reconcile authoritative History and queries](02-reconcile-authoritative-history.md) — consume its completed, scoped output.
- [Confirm and recover Clear all local history](03-confirm-clear-all-history.md) — consume its completed, scoped output.
- [Report QR generation and payload Copy results](06-report-qr-and-payload-copy-results.md) — consume its completed, scoped output.
- [Preserve session tasks and editor recovery](07-preserve-session-tasks-and-editor-recovery.md) — consume its completed, scoped output.
- [Compose actionable recovery issues](08-compose-actionable-recovery-issues.md) — consume its completed, scoped output.
- [Deliver the compatible Pairing outcome interface and Electron journey](33-deliver-pairing-outcome-interface-and-electron-journey.md) — consume its completed, scoped output.
- [Integrate native task input and focus](13-integrate-native-task-input.md) — consume its completed, scoped output.
- [Unify local assets and shared controls](17-unify-local-assets-and-shared-controls.md) — consume its completed, scoped output.
- [Deliver accessible navigation and task reflow](19-deliver-accessible-navigation-and-reflow.md) — consume its completed, scoped output.

Only the output scoped here must be complete to resolve this ticket. Later consumers requalify their changed presentation; broad finding collection is separate and cannot block this ticket on its own descendants. Follow [phase admission](../spec.md#delivery-order-and-completion) rather than treating file numbers as an execution sequence.

## Verification and acceptance

Test all actions/errors/live state and retained task/focus, popup closes after acceptance, new/idle/occupied page, stale/removed target, duplicate/lost handoff and worker interruption. Reject malformed/untrusted senders. Verify real popup Escape/click-away and full-page keyboard entry on the integrated candidate.

Run the [common candidate gates](../spec.md#verification-and-evidence) plus affected suites/builds/native checks. Record exact revision/dirty state, environment, commands and actual outcomes. Preserve regressions through the owning interface; use rendered/native evidence for the behavior that requires it, not implementation-mirroring helper tests.

## Coverage and closure

Candidate handoff/lifecycle and popup native input; actual notification delivery is the notification owner. Later screens requalify their own migration.

The [coverage ledger](../validation-coverage.md) specifies Candidate, External and Retained dispositions and fresh native intervals. Required missing evidence leaves the affected portion unqualified; report it explicitly. No old observation or planning approval is a pass. Primary finding collector: C11, C12 Full finding closure requires all [traceability contributions](../traceability.md), not merely this ticket's completion. Separate additions keep their own names and are not counted as new runtime findings.

## Source anchors

- [manifest.json](../../../apps/extension/manifest.json)
- [managedRelayUi.ts](../../../apps/extension/src/managedRelayUi.ts)
- [popupClipboardActions.ts](../../../apps/extension/src/popupClipboardActions.ts)
- [options.tsx](../../../apps/extension/src/options.tsx)
- [managedRelayUi.test.ts](../../../tests/extension/managedRelayUi.test.ts)

## Handoff

Coordinator records the fresh baseline/claim, accepted decision assessment, isolated worktree, integration revision, checks and Standards/Spec review under [project workflow](../../../docs/agents/workflow.md). Preserve unrelated work. No code, native operation, commit, push or deployment has occurred for this planning ticket.

## Pairing scope refinement — 2026-10-12

Consume ticket 33's completed common interface and scoped Electron evidence. Residual ticket 10 retains required Android/Chrome native journeys. This consumer retains every affected host/native/cutover qualification; Electron G01 is not a cross-runtime pass.
