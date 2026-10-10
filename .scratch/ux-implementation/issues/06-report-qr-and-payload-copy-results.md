# Report QR generation and payload Copy results

Type: implementation
Status: open
Assignee: none
Priority band: 1
Blocked by: 01
Dispatch: plan approved; awaiting an authorized execution run
Parent: [Clipp UX implementation](../spec.md)

## Outcome

QR generation and payload Copy expose pending, ready, failure and truthful Retry.

## Work and boundaries

Repair shared and options consumers, valid oversized text fallback and late-result guards. Copy reports actual clipboard-write result or uncertainty; a failed generation cannot leave an empty Hide state.

Payload Copy does not invoke retained-Clip reuse or Send; normal observation policy may capture copied text. Never auto-repeat an unconfirmed write or label decode/Copy as completed Pairing.

The [approved package contract](../../ux-implementation-plan/correctness-delivery-proposal.md#truthful-qr-generation-and-payload-copy) is normative detail for this ticket. Preserve the [shared interfaces](../../ux-implementation-plan/shared-interface-proposal.md) and [specification invariants](../spec.md#preserved-contracts). Update every affected live runtime bridge with its consumer; do not leave a successful helper behind a broken caller.

## Dependencies and integration

- [Repair Chrome preference integrity](01-repair-chrome-preference-integrity.md) — consume its completed, scoped output.

Only the output scoped here must be complete to resolve this ticket. Later consumers requalify their changed presentation; broad finding collection is separate and cannot block this ticket on its own descendants. Follow [phase admission](../spec.md#delivery-order-and-completion) rather than treating file numbers as an execution sequence.

## Verification and acceptance

Test deferred/no-target/rejected generation, fallback, Retry, close/identity change, clipboard rejection and lost acknowledgement through real UI actions. Qualify actual payload writes on affected native hosts with fresh synthetic markers. Native file import belongs to immediate Pairing results; OS permission and native-camera qualifications remain separately scoped.

Run the [common candidate gates](../spec.md#verification-and-evidence) plus affected suites/builds/native checks. Record exact revision/dirty state, environment, commands and actual outcomes. Preserve regressions through the owning interface; use rendered/native evidence for the behavior that requires it, not implementation-mirroring helper tests.

## Coverage and closure

Candidate QR/clipboard branches; final QR sizing/Back and camera paths are contributed by navigation/native packages.

The [coverage ledger](../validation-coverage.md) specifies Candidate, External and Retained dispositions and fresh native intervals. Required missing evidence leaves the affected portion unqualified; report it explicitly. No old observation or planning approval is a pass. Primary finding collector: C08 Full finding closure requires all [traceability contributions](../traceability.md), not merely this ticket's completion. Separate additions keep their own names and are not counted as new runtime findings.

## Source anchors

- [qrCode.ts](../../../packages/core/pairing/qrCode.ts)
- [ClipboardApp.tsx](../../../packages/ui/src/ClipboardApp.tsx)
- [options.tsx](../../../apps/extension/src/options.tsx)
- [qrCode.test.ts](../../../tests/core/pairing/qrCode.test.ts)

## Handoff

Coordinator records the fresh baseline/claim, accepted decision assessment, isolated worktree, integration revision, checks and Standards/Spec review under [project workflow](../../../docs/agents/workflow.md). Preserve unrelated work. No code, native operation, commit, push or deployment has occurred for this planning ticket.
