# Integrate durable reset storage adapters

Type: implementation
Status: open
Assignee: none
Priority band: 3
Blocked by: 27
Dispatch: plan approved; awaiting an authorized execution run
Parent: [Clipp UX implementation](../spec.md)

## Outcome

Each reset adapter can prove durable intent and complete cleanup without stale fallback resurrection.

## Work and boundaries

Integrate core with Electron SQLite transaction/reopen, Chrome extension storage plus IndexedDB recovery, and strict Android native commit/error handling. Required receipt and replay guard precede private-marker removal; clean all owned identity/History fallback copies and recovery generations.

No fulfilled memory fallback as durability, inaccessible store as empty or mandatory receipt as best-effort notice. Logical deletion only; preserve installation preferences/configuration/credentials.

The [approved package contract](../../ux-implementation-plan/manual-identity-reset-proposal.md#runtime-responsibilities) is normative detail for this ticket. Preserve the [shared interfaces](../../ux-implementation-plan/shared-interface-proposal.md) and [specification invariants](../spec.md#preserved-contracts). Update every affected live runtime bridge with its consumer; do not leave a successful helper behind a broken caller.

## Dependencies and integration

- [Implement the durable manual reset transition](27-implement-durable-manual-reset.md) — consume its completed, scoped output.

Only the output scoped here must be complete to resolve this ticket. Later consumers requalify their changed presentation; broad finding collection is separate and cannot block this ticket on its own descendants. Follow [phase admission](../spec.md#delivery-order-and-completion) rather than treating file numbers as an execution sequence.

## Verification and acceptance

Use real adapter abrupt-stop/reopen around intent/deletion/candidate/receipt/guard/sanitization. Fault between both final metadata writes. Verify no former keys/membership/History/scoped backups remain after completion and existing automatic paths still pass.

Run the [common candidate gates](../spec.md#verification-and-evidence) plus affected suites/builds/native checks. Record exact revision/dirty state, environment, commands and actual outcomes. Preserve regressions through the owning interface; use rendered/native evidence for the behavior that requires it, not implementation-mirroring helper tests.

## Coverage and closure

Candidate storage-backed reset proof on every host. SQLite transactional fake and web preview alone cannot pass; action remains unavailable.

The [coverage ledger](../validation-coverage.md) specifies Candidate, External and Retained dispositions and fresh native intervals. Required missing evidence leaves the affected portion unqualified; report it explicitly. No old observation or planning approval is a pass. Primary finding collector: Supporting package or separate approved addition; see traceability. Full finding closure requires all [traceability contributions](../traceability.md), not merely this ticket's completion. Separate additions keep their own names and are not counted as new runtime findings.

## Source anchors

- [storage.ts](../../../apps/electron/src/storage.ts)
- [chromeStorage.ts](../../../apps/extension/src/chromeStorage.ts)
- [storage.ts](../../../apps/android/src/storage.ts)
- [identityRotation.ts](../../../packages/core/trust/identityRotation.ts)
- [identityRotationSQLite.test.ts](../../../tests/core/trust/identityRotationSQLite.test.ts)

## Handoff

Coordinator records the fresh baseline/claim, accepted decision assessment, isolated worktree, integration revision, checks and Standards/Spec review under [project workflow](../../../docs/agents/workflow.md). Preserve unrelated work. No code, native operation, commit, push or deployment has occurred for this planning ticket.
