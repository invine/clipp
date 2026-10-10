# Fence reset runtime work and restart

Type: implementation
Status: open
Assignee: none
Priority band: 3
Blocked by: 28
Dispatch: plan approved; awaiting an authorized execution run
Parent: [Clipp UX implementation](../spec.md)

## Outcome

Accepted reset prevents all stale identity work and restarts only after finalization.

## Work and boundaries

Gate/drain cached writers, capture/Pairing/QR/notification callbacks and every startup path. Chrome background fences offscreen creation/retries/storage writes and old handoffs. Android durably fences/clears native explicit ingress and pending clipboard pointer; suspend continuity without changing preferences.

Unknown/incomplete reset cannot start old/new services. Reject new native ingress during incomplete setup rather than queue it for replacement. Rebuild cached manager after cleanup; normal baseline does not reattribute old clipboard content.

The [approved package contract](../../ux-implementation-plan/manual-identity-reset-proposal.md#runtime-responsibilities) is normative detail for this ticket. Preserve the [shared interfaces](../../ux-implementation-plan/shared-interface-proposal.md) and [specification invariants](../spec.md#preserved-contracts). Update every affected live runtime bridge with its consumer; do not leave a successful helper behind a broken caller.

## Dependencies and integration

- [Integrate durable reset storage adapters](28-integrate-durable-reset-storage.md) — consume its completed, scoped output.

Only the output scoped here must be complete to resolve this ticket. Later consumers requalify their changed presentation; broad finding collection is separate and cannot block this ticket on its own descendants. Follow [phase admission](../spec.md#delivery-order-and-completion) rather than treating file numbers as an execution sequence.

## Verification and acceptance

Exercise late writers, worker/service/activity restart, independent native enqueue and relaunch failure through actual host seams. Qualify strict native queue cleanup and preferences. Consume/revalidate external Chrome restart baseline guarantee before claiming it for reset.

Run the [common candidate gates](../spec.md#verification-and-evidence) plus affected suites/builds/native checks. Record exact revision/dirty state, environment, commands and actual outcomes. Preserve regressions through the owning interface; use rendered/native evidence for the behavior that requires it, not implementation-mirroring helper tests.

## Coverage and closure

Candidate runtime/queue/restart checks; external restart-recapture dependency must be resolved or demonstrably satisfied where consumed. New clipboard marker interval required.

The [coverage ledger](../validation-coverage.md) specifies Candidate, External and Retained dispositions and fresh native intervals. Required missing evidence leaves the affected portion unqualified; report it explicitly. No old observation or planning approval is a pass. Primary finding collector: Supporting package or separate approved addition; see traceability. Full finding closure requires all [traceability contributions](../traceability.md), not merely this ticket's completion. Separate additions keep their own names and are not counted as new runtime findings.

## Source anchors

- [identity.ts](../../../packages/core/trust/identity.ts)
- [identityInitialization.ts](../../../packages/core/runtime/identityInitialization.ts)
- [main.ts](../../../apps/electron/src/main.ts)
- [background.ts](../../../apps/extension/src/background.ts)
- [runtimeMessageStorage.ts](../../../apps/extension/src/runtimeMessageStorage.ts)
- [client.ts](../../../apps/android/src/client.ts)
- [backgroundContinuity.ts](../../../apps/android/src/backgroundContinuity.ts)
- [ExplicitTextIngressStore.java](../../../apps/android/android/app/src/main/java/com/clipp/app/ExplicitTextIngressStore.java)
- [runtimeMessageStorage.test.ts](../../../tests/extension/runtimeMessageStorage.test.ts)

## Handoff

Coordinator records the fresh baseline/claim, accepted decision assessment, isolated worktree, integration revision, checks and Standards/Spec review under [project workflow](../../../docs/agents/workflow.md). Preserve unrelated work. No code, native operation, commit, push or deployment has occurred for this planning ticket.
