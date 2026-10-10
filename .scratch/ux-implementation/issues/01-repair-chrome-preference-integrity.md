# Repair Chrome preference integrity

Type: implementation
Status: claimed
Assignee: ux-preferences-01
Priority band: 1
Blocked by: none
Dispatch: authorized UX implementation run `ux-implementation-20261010`; claim and branch details in [run record](../run.md)
Parent: [Clipp UX implementation](../spec.md)

## Outcome

Saving one Chrome preference never overwrites another stale field; failures remain visibly unsaved.

## Work and boundaries

Use field-scoped validated writes and one authoritative persistence path. Introduce the ordered state/result adapter with popup/options consumers; reconcile rejected or unconfirmed writes and overlapping saves. Remove ineffective Expiry and Text/Images/Files controls while retaining Auto Sync/log level. Their real replacement is a later owner.

Explicit Save overwrites edited fields only; preserve unrelated fields and exact trusted-page checks. No second UI settings database.

The [approved package contract](../../ux-implementation-plan/correctness-delivery-proposal.md#chrome-preference-integrity) is normative detail for this ticket. Preserve the [shared interfaces](../../ux-implementation-plan/shared-interface-proposal.md) and [specification invariants](../spec.md#preserved-contracts). Update every affected live runtime bridge with its consumer; do not leave a successful helper behind a broken caller.

## Dependencies and integration

No technical predecessor. The approved phase admission rule still applies.

Only the output scoped here must be complete to resolve this ticket. Later consumers requalify their changed presentation; broad finding collection is separate and cannot block this ticket on its own descendants. Follow [phase admission](../spec.md#delivery-order-and-completion) rather than treating file numbers as an execution sequence.

## Verification and acceptance

Test the real settings handler with persistence/publication failure, lost reply and overlapping writes. In two candidate views disable Auto Sync, change log level elsewhere, reject a save, then reopen; both views show actual applied state and no stale resend.

Run the [common candidate gates](../spec.md#verification-and-evidence) plus affected suites/builds/native checks. Record exact revision/dirty state, environment, commands and actual outcomes. Preserve regressions through the owning interface; use rendered/native evidence for the behavior that requires it, not implementation-mirroring helper tests.

## Coverage and closure

Candidate cross-view updates and action feedback; C02 remains open until working retention/lifetime replacement.

The [coverage ledger](../validation-coverage.md) specifies Candidate, External and Retained dispositions and fresh native intervals. Required missing evidence leaves the affected portion unqualified; report it explicitly. No old observation or planning approval is a pass. Primary finding collector: C01, C10 Full finding closure requires all [traceability contributions](../traceability.md), not merely this ticket's completion. Separate additions keep their own names and are not counted as new runtime findings.

## Source anchors

- [options.tsx](../../../apps/extension/src/options.tsx)
- [popup.tsx](../../../apps/extension/src/popup.tsx)
- [background.ts](../../../apps/extension/src/background.ts)
- [autoSyncPreference.ts](../../../packages/core/runtime/autoSyncPreference.ts)
- [autoSyncPreferenceConformance.test.ts](../../../tests/core/runtime/autoSyncPreferenceConformance.test.ts)

## Handoff

Coordinator records the fresh baseline/claim, accepted decision assessment, isolated worktree, integration revision, checks and Standards/Spec review under [project workflow](../../../docs/agents/workflow.md). Preserve unrelated work. No code, native operation, commit, push or deployment has occurred for this planning ticket.
