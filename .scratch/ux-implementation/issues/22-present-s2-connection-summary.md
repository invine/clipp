# Present the S2 connection summary

Type: implementation
Status: open
Assignee: none
Priority band: 2
Blocked by: 02, 08, 17, 19
Dispatch: plan approved; awaiting an authorized execution run
Parent: [Clipp UX implementation](../spec.md)

## Outcome

One header icon gives an honest S2 connection summary and opens useful detail.

## Work and boundaries

Derive trusted direct/relayed/offline and configured-relay faults from real runtime state, preserving unknown. Use original green triangle for direct, accepted amber/attention distinctions and grey offline/unknown. Expose an accessible status name and expandable panel.

Direct connectivity does not suppress a configured relay fault. No healthy count from untrusted transport; Auto Sync is separate and no Synced/delivery guarantee. Devices retains text statuses.

The [approved package contract](../../ux-implementation-plan/workspace-delivery-proposal.md#s2-connection-summary-and-panel) is normative detail for this ticket. Preserve the [shared interfaces](../../ux-implementation-plan/shared-interface-proposal.md) and [specification invariants](../spec.md#preserved-contracts). Update every affected live runtime bridge with its consumer; do not leave a successful helper behind a broken caller.

## Dependencies and integration

- [Reconcile authoritative History and queries](02-reconcile-authoritative-history.md) — consume its completed, scoped output.
- [Compose actionable recovery issues](08-compose-actionable-recovery-issues.md) — consume its completed, scoped output.
- [Unify local assets and shared controls](17-unify-local-assets-and-shared-controls.md) — consume its completed, scoped output.
- [Deliver accessible navigation and task reflow](19-deliver-accessible-navigation-and-reflow.md) — consume its completed, scoped output.

Only the output scoped here must be complete to resolve this ticket. Later consumers requalify their changed presentation; broad finding collection is separate and cannot block this ticket on its own descendants. Follow [phase admission](../spec.md#delivery-order-and-completion) rather than treating file numbers as an execution sequence.

## Verification and acceptance

Test direct/routed/mixed/offline/unknown, partial relay failure, intentionally no relay and changing trust, with real projection consumers. Verify shape/name/contrast in every theme and compact header without requiring a permanent panel.

Run the [common candidate gates](../spec.md#verification-and-evidence) plus affected suites/builds/native checks. Record exact revision/dirty state, environment, commands and actual outcomes. Preserve regressions through the owning interface; use rendered/native evidence for the behavior that requires it, not implementation-mirroring helper tests.

## Coverage and closure

Candidate status presentation; authenticated relay lifecycle/transfer remains external, not fabricated from fixtures.

The [coverage ledger](../validation-coverage.md) specifies Candidate, External and Retained dispositions and fresh native intervals. Required missing evidence leaves the affected portion unqualified; report it explicitly. No old observation or planning approval is a pass. Primary finding collector: Supporting package or separate approved addition; see traceability. Full finding closure requires all [traceability contributions](../traceability.md), not merely this ticket's completion. Separate additions keep their own names and are not counted as new runtime findings.

## Source anchors

- [ClipboardApp.tsx](../../../packages/ui/src/ClipboardApp.tsx)
- [orchestrator.ts](../../../packages/core/runtime/orchestrator.ts)
- [main.ts](../../../apps/electron/src/main.ts)
- [background.ts](../../../apps/extension/src/background.ts)
- [client.ts](../../../apps/android/src/client.ts)

## Handoff

Coordinator records the fresh baseline/claim, accepted decision assessment, isolated worktree, integration revision, checks and Standards/Spec review under [project workflow](../../../docs/agents/workflow.md). Preserve unrelated work. No code, native operation, commit, push or deployment has occurred for this planning ticket.
