# Reconcile authoritative History and queries

Type: implementation
**Status:** resolved
Assignee: ux-history-02
Priority band: 1
**Blocked by:** [01](01-repair-chrome-preference-integrity.md)
Dispatch: integrated and reviewed in UX implementation run `ux-implementation-20261010`; branch and evidence in [run record](../run.md)
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

The coordinator recorded the baseline, claim, isolated worktree, integration revision, candidate checks and two-axis review under [project workflow](../../../docs/agents/workflow.md). The unrelated primary-checkout work remains untouched.

## Answer

History now publishes general changes for retained additions, removals, suppression cleanup and policy effects while preserving the existing addition-only `onNew` signal. Ordered projections and bootstrap gates prevent stale reads, replies and failed initial loads from replacing newer authority across the affected runtime bridges and views. Visible query/scope derives from the accepted History snapshot and distinguishes unavailable, empty and no-match states.

Integrated candidate: `1ce9217fb2b95a11a30dfc6aa0836545195da994` on `codex/ux-implementation-integration` (clean at review). The integrated `npm run check` passed 86 suites/713 tests before the final merge commit (after a recorded timing-sensitive unrelated failure on the first full run); integrated `npm run verify` passed lint, typechecks, 713 tests and Electron/Android web/Chrome builds. Fresh candidate checks passed 11 Chrome cases across two options views and an actual toolbar popup, 17 Electron native/SQLite cases including real writer-lock Delete/Clear failure and Retry, and five Android API 31 WebView/IndexedDB History cases. The full source and integration receipts and logs live in the ignored run evidence directory named in [run.md](../run.md). Standards and Spec reviews both passed at this exact revision against dispatch baseline `3045bad0b45ccbc03f2dd169993d155b8c147b93`.

The scoped ticket is complete. C09 finding closure remains open for the later compact History presentation contribution. G35's additional abrupt-stop partial cleanup, Android-specific retention/unpin and forced IndexedDB outage are explicitly unqualified and remain with later Clear/retention collectors or the final G35 collection; they are not evidence for this scoped ticket. G31 transfer is External/Retained under the accepted coverage ledger.
