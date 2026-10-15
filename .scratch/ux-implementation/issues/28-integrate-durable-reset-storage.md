# Integrate durable reset storage adapters

Type: implementation
Status: claimed
Assignee: ux-reset-storage-28
Priority band: 3
Blocked by: 27
Dispatch: 2026-10-15 user-directed durable adapters with two implementers; qualification gaps retained
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


## Dispatch — 2026-10-15

The user explicitly requested ticket 28 implementation with two implementers, available checks and preservation of unqualified native gates. Core 27 is resolved at source4cd6fc94fc25f76f636f776712c4122eb799e9f5; current clean integration before dispatch is b86785d14dfa58a9d7f2258decf8016e0155e162 on codex/ux-implementation-integration. One claim ux-reset-storage-28 has two coordinated isolated source assignments: Electron SQLite plus Chrome storage/IndexedDB adapters; Android strict native persistence plus web fallback reconciliation. Coordinator owns all shared-file arbitration, integration and qualification.

Decision assessment: preserve accepted ADR0004 automatic rotation and ADR0008 application-owned key storage. Consume the existing serialized reset owner and accepted private intent/public receipt/replay boundaries. Do not create a second transition owner, accept fallback promises as durable proof, erase installation preferences or credentials, or activate a runtime without its complete writer/native ingress fences. Runtime admission/queue/restart remains29 and actions/UI30. Adapter composition must include its owning consumer without enabling an unsafe capability.

Approved test seams are the specified real SQLite store/reopen transaction, Chrome storage plus owning IndexedDB history generations, Android strict native storage commit/error interface with reconciliation of Preferences/localStorage/memory, and actual core coordinator composition. TDD at these already accepted seams requires no repeated approval. Available source, adapter, build and native unit checks run now; real browser/native abrupt-stop qualification is recorded separately and may remain unqualified. No reset of an operator profile, account/sign-in, host clipboard or global setting. Use disposable synthetic stores. All earlier failed gates/deferrals and standing approvals persist; no new harness preparation, push, PR or deployment.
