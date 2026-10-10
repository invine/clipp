# Repair Chrome preference integrity

Type: implementation
Status: resolved
Assignee: ux-preferences-01
Priority band: 1
Blocked by: none
Dispatch: integrated and reviewed in UX implementation run `ux-implementation-20261010`; branch and evidence in [run record](../run.md)
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

The coordinator recorded the baseline, claim, isolated worktrees, integration revision, candidate checks and two-axis review under [project workflow](../../../docs/agents/workflow.md). The unrelated primary-checkout work remains untouched.

## Answer

Implemented field-scoped Chrome preference writes with an ordered authoritative snapshot feed across options and the actual toolbar popup. Rejected and unconfirmed outcomes keep truthful feedback; a lost reply blocks further preference mutations until reconciliation succeeds. An initial failed read leaves values unknown and controls disabled with Retry. Obsolete ineffective controls were removed, while Auto Sync and log level remain active. The shared Auto Sync preference stays in `packages/core` and shared feedback/presentation in `packages/ui`.

Integrated candidate: `46a5bcc645c62c0372fee429de870b37021858ef` on `codex/ux-implementation-integration` (clean at review). `npm run check` passed 81 suites/700 tests before the last merge commit, and integrated `npm run verify` passed lint, typechecks, 700 tests and three builds. Disposable Chrome candidate receipts cover two open views, persistence/publication failure, overlapping writes, worker restart, rejected/unconfirmed outcomes, unknown initial state, failed refresh, blocked duplicate mutation and successful Retry in options and a real toolbar popup. Standards and Spec reviews both passed at this exact revision against fixed baseline `d23e44f33ca1a280e3933850a98d19dcb3745e81`. Candidate receipts and command logs are retained under the ignored run evidence directory identified in [run.md](../run.md).

C01 and C10 finding closure is recorded in [finding status](../finding-status.md). C02 remains open until its replacement settings and later presentation contributions are verified. Native, external and retained gates outside this scoped ticket remain with their owners.
