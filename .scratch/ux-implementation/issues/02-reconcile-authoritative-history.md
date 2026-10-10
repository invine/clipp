# Reconcile authoritative History and queries

Type: implementation
Status: open
Assignee: none
Priority band: 1
Blocked by: 01
Dispatch: plan approved; awaiting an authorized execution run
Parent: [Clipp UX implementation](../spec.md)

## Outcome

Every live view shows current retained History under its current query and scope.

## Work and boundaries

Add general History invalidation while preserving addition-specific onNew. Wire ordered/coalesced projections through all affected hosts and derive visible queries from accepted snapshots. Bootstrap, search and refresh cannot overwrite newer data; distinguish loading, unavailable, empty and no-match.

Keep History storage/suppression/capacity policy and Chrome session-only pins. Authority session changes reject old-worker replies; no global transaction is implied.

The [approved package contract](../../ux-implementation-plan/correctness-delivery-proposal.md#authoritative-history-and-query-reconciliation) is normative detail for this ticket. Preserve the [shared interfaces](../../ux-implementation-plan/shared-interface-proposal.md) and [specification invariants](../spec.md#preserved-contracts). Update every affected live runtime bridge with its consumer; do not leave a successful helper behind a broken caller.

## Dependencies and integration

- [Repair Chrome preference integrity](01-repair-chrome-preference-integrity.md) — consume its completed, scoped output.

Only the output scoped here must be complete to resolve this ticket. Later consumers requalify their changed presentation; broad finding collection is separate and cannot block this ticket on its own descendants. Follow [phase admission](../spec.md#delivery-order-and-completion) rather than treating file numbers as an execution sequence.

## Verification and acceptance

Exercise real History mutations, unpin/retention removal, delayed reads and failed refresh through adapters. Mutate Clear/add/delete in two open Chrome views without reload; assert retained and filtered contents rather than event counts.

Run the [common candidate gates](../spec.md#verification-and-evidence) plus affected suites/builds/native checks. Record exact revision/dirty state, environment, commands and actual outcomes. Preserve regressions through the owning interface; use rendered/native evidence for the behavior that requires it, not implementation-mirroring helper tests.

## Coverage and closure

Candidate state/History failure persistence; real transfer/reconciliation remains separately owned.

The [coverage ledger](../validation-coverage.md) specifies Candidate, External and Retained dispositions and fresh native intervals. Required missing evidence leaves the affected portion unqualified; report it explicitly. No old observation or planning approval is a pass. Primary finding collector: C09 Full finding closure requires all [traceability contributions](../traceability.md), not merely this ticket's completion. Separate additions keep their own names and are not counted as new runtime findings.

## Source anchors

- [store.ts](../../../packages/core/history/store.ts)
- [orchestrator.ts](../../../packages/core/runtime/orchestrator.ts)
- [ClipHistoryList.tsx](../../../apps/extension/src/components/ClipHistoryList.tsx)
- [backendConformance.ts](../../../tests/core/history/backendConformance.ts)
- [concurrency.test.ts](../../../tests/core/history/concurrency.test.ts)

## Handoff

Coordinator records the fresh baseline/claim, accepted decision assessment, isolated worktree, integration revision, checks and Standards/Spec review under [project workflow](../../../docs/agents/workflow.md). Preserve unrelated work. No code, native operation, commit, push or deployment has occurred for this planning ticket.
