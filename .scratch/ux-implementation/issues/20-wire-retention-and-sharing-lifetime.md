# Wire local retention and Clip Sharing Lifetime

Type: implementation
Status: open
Assignee: none
Priority band: 1
Blocked by: 01, 02, 17
Dispatch: plan approved; awaiting an authorized execution run
Parent: [Clipp UX implementation](../spec.md)

## Outcome

Local retention and Clip Sharing Lifetime each control their stated, different behavior.

## Work and boundaries

Use validated persisted settings through every runtime, existing History policy and runtime Clip factory. Replace obsolete Chrome Expiry after its early removal. Show actual persisted nonpreset values; document zero/default/max semantics from accepted source, retaining 30-day maximum sharing lifetime.

Retention affects local storage and respects pins; lifetime sets immutable shareExpiresAt only for new events, including explicit/native paths. Pending capture retries reuse event lifetime. Existing/imported Clips unchanged; no capacity control or lifetime-as-deletion.

The [approved package contract](../../ux-implementation-plan/workspace-delivery-proposal.md#real-local-retention-and-clip-sharing-lifetime) is normative detail for this ticket. Preserve the [shared interfaces](../../ux-implementation-plan/shared-interface-proposal.md) and [specification invariants](../spec.md#preserved-contracts). Update every affected live runtime bridge with its consumer; do not leave a successful helper behind a broken caller.

## Dependencies and integration

- [Repair Chrome preference integrity](01-repair-chrome-preference-integrity.md) — consume its completed, scoped output.
- [Reconcile authoritative History and queries](02-reconcile-authoritative-history.md) — consume its completed, scoped output.
- [Unify local assets and shared controls](17-unify-local-assets-and-shared-controls.md) — consume its completed, scoped output.

Only the output scoped here must be complete to resolve this ticket. Later consumers requalify their changed presentation; broad finding collection is separate and cannot block this ticket on its own descendants. Follow [phase admission](../spec.md#delivery-order-and-completion) rather than treating file numbers as an execution sequence.

## Verification and acceptance

Assert emitted Clip fields for all creation paths, default/max/invalid settings, restart, retained custom values and pending retries. Assert actual local cleanup/pin/unpin/failure effects and current views, not merely stored preferences.

Run the [common candidate gates](../spec.md#verification-and-evidence) plus affected suites/builds/native checks. Record exact revision/dirty state, environment, commands and actual outcomes. Preserve regressions through the owning interface; use rendered/native evidence for the behavior that requires it, not implementation-mirroring helper tests.

## Coverage and closure

Candidate policy/persistence tests; external transfer enforcement qualification stays with existing interop owner. This completes C02 only with early removal evidence.

The [coverage ledger](../validation-coverage.md) specifies Candidate, External and Retained dispositions and fresh native intervals. Required missing evidence leaves the affected portion unqualified; report it explicitly. No old observation or planning approval is a pass. Primary finding collector: C02 Full finding closure requires all [traceability contributions](../traceability.md), not merely this ticket's completion. Separate additions keep their own names and are not counted as new runtime findings.

## Source anchors

- [clipboard.ts](../../../packages/core/runtime/clipboard.ts)
- [store.ts](../../../packages/core/history/store.ts)
- [main.ts](../../../apps/electron/src/main.ts)
- [background.ts](../../../apps/extension/src/background.ts)
- [client.ts](../../../apps/android/src/client.ts)
- [backendConformance.ts](../../../tests/core/history/backendConformance.ts)

## Handoff

Coordinator records the fresh baseline/claim, accepted decision assessment, isolated worktree, integration revision, checks and Standards/Spec review under [project workflow](../../../docs/agents/workflow.md). Preserve unrelated work. No code, native operation, commit, push or deployment has occurred for this planning ticket.
