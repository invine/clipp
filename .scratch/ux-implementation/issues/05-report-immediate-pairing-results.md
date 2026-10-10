# Report immediate Pairing and approval results

Type: implementation
Status: open
Assignee: none
Priority band: 1
Blocked by: 01
Dispatch: plan approved; awaiting an authorized execution run
Parent: [Clipp UX implementation](../spec.md)

## Outcome

Read, import, submission and approval failures cannot appear as Pairing success.

## Work and boundaries

Return awaited typed results through every affected wrapper/current options callback. Retain failed input and contain immediate Android diagnostics. Publish an opaque incoming-envelope version and compare it within serialized approval; cut over all live approval consumers together.

Approval is local Admission, not response delivery. Identical retransmission keeps its version; replaced envelopes invalidate old review. No response retry job, policy weakening or outgoing protocol correlation.

The [approved package contract](../../ux-implementation-plan/correctness-delivery-proposal.md#immediate-pairing-and-approval-outcomes) is normative detail for this ticket. Preserve the [shared interfaces](../../ux-implementation-plan/shared-interface-proposal.md) and [specification invariants](../spec.md#preserved-contracts). Update every affected live runtime bridge with its consumer; do not leave a successful helper behind a broken caller.

## Dependencies and integration

- [Repair Chrome preference integrity](01-repair-chrome-preference-integrity.md) — consume its completed, scoped output.

Only the output scoped here must be complete to resolve this ticket. Later consumers requalify their changed presentation; broad finding collection is separate and cannot block this ticket on its own descendants. Follow [phase admission](../spec.md#delivery-order-and-completion) rather than treating file numbers as an execution sequence.

## Verification and acceptance

Test invalid/import/transport failure, explicit false, lost response, expiry/replacement, admission persistence and failure after Admission. Guard duplicates; reconcile real effects. Exercise actual desktop QR-file import separately from camera decode.

Run the [common candidate gates](../spec.md#verification-and-evidence) plus affected suites/builds/native checks. Record exact revision/dirty state, environment, commands and actual outcomes. Preserve regressions through the owning interface; use rendered/native evidence for the behavior that requires it, not implementation-mirroring helper tests.

## Coverage and closure

Candidate QR import and immediate actions; full native Pairing qualification is collected by authoritative outcomes; scanner and account paths remain separate.

The [coverage ledger](../validation-coverage.md) specifies Candidate, External and Retained dispositions and fresh native intervals. Required missing evidence leaves the affected portion unqualified; report it explicitly. No old observation or planning approval is a pass. Primary finding collector: Supporting package or separate approved addition; see traceability. Full finding closure requires all [traceability contributions](../traceability.md), not merely this ticket's completion. Separate additions keep their own names and are not counted as new runtime findings.

## Source anchors

- [pending.ts](../../../packages/core/pairing/pending.ts)
- [options.tsx](../../../apps/extension/src/options.tsx)
- [main.tsx](../../../apps/android/src/main.tsx)
- [pending.test.ts](../../../tests/core/pairing/pending.test.ts)
- [pairingConformance.test.ts](../../../tests/core/runtime/pairingConformance.test.ts)

## Handoff

Coordinator records the fresh baseline/claim, accepted decision assessment, isolated worktree, integration revision, checks and Standards/Spec review under [project workflow](../../../docs/agents/workflow.md). Preserve unrelated work. No code, native operation, commit, push or deployment has occurred for this planning ticket.
