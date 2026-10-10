# Confirm and recover Clear all local history

Type: implementation
Status: resolved
Assignee: ux-clear-03
Priority band: 1
Blocked by: 02
Dispatch: integrated and reviewed in UX implementation run `ux-implementation-20261010`; branch and evidence in [run record](../run.md)
Parent: [Clipp UX implementation](../spec.md)

## Outcome

Clear all has an explicit local destructive review and truthful recovery on existing surfaces.

## Work and boundaries

Introduce the accessible shared task frame with this real consumer. Explain pinned and filtered-out history, local scope and no Undo. Cancel invokes nothing; Confirm awaits cleanup and preserves query. Keep existing working entry until Advanced/full-page cutover.

Durable history cleanup precedes pending-capture clearing. Single Delete remains immediate; no new Undo or remote deletion.

The [approved package contract](../../ux-implementation-plan/correctness-delivery-proposal.md#explicit-clear-all-local-history) is normative detail for this ticket. Preserve the [shared interfaces](../../ux-implementation-plan/shared-interface-proposal.md) and [specification invariants](../spec.md#preserved-contracts). Update every affected live runtime bridge with its consumer; do not leave a successful helper behind a broken caller.

## Dependencies and integration

- [Reconcile authoritative History and queries](02-reconcile-authoritative-history.md) — consume its completed, scoped output.

Only the output scoped here must be complete to resolve this ticket. Later consumers requalify their changed presentation; broad finding collection is separate and cannot block this ticket on its own descendants. Follow [phase admission](../spec.md#delivery-order-and-completion) rather than treating file numbers as an execution sequence.

## Verification and acceptance

Cancel and confirm with pinned/filtered entries; fail durable deletion and retry while capture recovery is pending. Verify suppression-capacity behavior and live second-view reconciliation. Check reachable review/actions at the candidate sizes claimed by this change.

Run the [common candidate gates](../spec.md#verification-and-evidence) plus affected suites/builds/native checks. Record exact revision/dirty state, environment, commands and actual outcomes. Preserve regressions through the owning interface; use rendered/native evidence for the behavior that requires it, not implementation-mirroring helper tests.

## Coverage and closure

Candidate destructive action/failure checks. Final placement is verified again by Settings and Chrome management; native permissions are separate.

The [coverage ledger](../validation-coverage.md) specifies Candidate, External and Retained dispositions and fresh native intervals. Required missing evidence leaves the affected portion unqualified; report it explicitly. No old observation or planning approval is a pass. Primary finding collector: E09 Full finding closure requires all [traceability contributions](../traceability.md), not merely this ticket's completion. Separate additions keep their own names and are not counted as new runtime findings.

## Source anchors

- [ClipboardApp.tsx](../../../packages/ui/src/ClipboardApp.tsx)
- [captureCoordinator.ts](../../../packages/core/clipboard/captureCoordinator.ts)
- [captureCoordinator.test.ts](../../../tests/core/clipboard/captureCoordinator.test.ts)
- [backendConformance.ts](../../../tests/core/history/backendConformance.ts)

## Handoff

The coordinator recorded the baseline, claim, isolated worktree, integration revision, candidate checks and two-axis review under [project workflow](../../../docs/agents/workflow.md). The unrelated primary-checkout work remains untouched.

## Answer

Clear all now uses the shared accessible review task, names pinned and filtered-out local Clips, explains local-only scope and no Undo, and invokes no mutation on Cancel. Confirm awaits real cleanup; durable history clearing still precedes pending-capture discard. Query/scope remains intact and live views reconcile the resulting History. After a failed or unconfirmed Clear, stale counts are hidden and another destructive attempt stays disabled until an explicit refresh confirms current History.

Integrated candidate: `0644d7d79d06faf62a9c544ac77bca6d8036f9bc`, clean at review, with the same tree as its final tested source. Pre-merge `npm run check` and integrated `npm run verify` passed 93 suites/733 tests and all three builds. Actual Electron passed 18 cases and hash-verified Android API 31 passed 14 cases, including failure, refresh-before-Retry, filtered/pinned scope and bounded review actions. A fresh user-authorized exact-marker interval passed 20 actual Chrome toolbar cases with two options views; its fixed Clear code and relevant slices are byte-identical in the integrated tree. The final combined popup bundle was not separately opened during that interval; this provenance limit is retained in the receipt. Owned profiles/emulator/forwards were closed, clipboard-sharing preference restored and normal copying released.

Standards and Spec reviews both passed at this revision against dispatch baseline `788d6c2c0c4a1210e1bf0f2aa2de8c5fe5fedcaa`. Candidate receipts, source mapping, logs and interval closure live in the ignored evidence directory named in [run.md](../run.md). The scoped ticket is resolved; E09's final Advanced placement and broader G35/native/layout qualifications retain their separate collectors in [finding status](../finding-status.md) and the accepted coverage ledger.
