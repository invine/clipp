# Preserve session tasks and editor recovery

Type: implementation
**Status:** resolved
Assignee: ux-session-07
Priority band: 1
**Blocked by:** [03](03-confirm-clear-all-history.md), [04](04-retain-name-and-alias-edits.md), [05](05-report-immediate-pairing-results.md)
Dispatch: authorized UX implementation run `ux-implementation-20261010`; claim and branch details in [run record](../run.md)
Parent: [Clipp UX implementation](../spec.md)

## Outcome

Live tasks retain drafts and context across responsive presentation and dismissal; relay results remain honest.

## Work and boundaries

Extend the existing session owner above layout mounts for relay/name/alias/Pairing editors, query, focus/scroll and task stack. Back/Close retain, Cancel/Discard clears. Relay writes are entity/field-scoped; await Edit/Remove/Login/Retry and reconcile partial credential/configuration effects.

No restart/popup-destruction draft persistence. Explicit Save overwrites edited fields only. Browser opening is not authenticated success; removing relay is not sign-out or revocation. Empty defaults and single-session fallback remain.

The [approved package contract](../../ux-implementation-plan/correctness-delivery-proposal.md#session-tasks-and-remaining-editor-recovery) is normative detail for this ticket. Preserve the [shared interfaces](../../ux-implementation-plan/shared-interface-proposal.md) and [specification invariants](../spec.md#preserved-contracts). Update every affected live runtime bridge with its consumer; do not leave a successful helper behind a broken caller.

## Dependencies and integration

- [Confirm and recover Clear all local history](03-confirm-clear-all-history.md) — consume its completed, scoped output.
- [Retain Device Name and alias edits](04-retain-name-and-alias-edits.md) — consume its completed, scoped output.
- [Report immediate Pairing and approval results](05-report-immediate-pairing-results.md) — consume its completed, scoped output.

Only the output scoped here must be complete to resolve this ticket. Later consumers requalify their changed presentation; broad finding collection is separate and cannot block this ticket on its own descendants. Follow [phase admission](../spec.md#delivery-order-and-completion) rather than treating file numbers as an execution sequence.

## Verification and acceptance

Test remount/resize/dismiss/reopen, late Save with new typing, removed target and credential deletion followed by persistence failure. Cover shared Electron/Android Auto Sync rejection/unconfirmed feedback through the same action contract. Controlled auth cancellation/failure is required; real sign-in stays deferred.

Run the [common candidate gates](../spec.md#verification-and-evidence) plus affected suites/builds/native checks. Record exact revision/dirty state, environment, commands and actual outcomes. Preserve regressions through the owning interface; use rendered/native evidence for the behavior that requires it, not implementation-mirroring helper tests.

## Coverage and closure

Candidate draft/action/credential partial-effect checks; external real auth/credential-store lifecycle. Collect E11 only after edits, approval and relay portions pass.

The [coverage ledger](../validation-coverage.md) specifies Candidate, External and Retained dispositions and fresh native intervals. Required missing evidence leaves the affected portion unqualified; report it explicitly. No old observation or planning approval is a pass. Primary finding collector: E05, E11 Full finding closure requires all [traceability contributions](../traceability.md), not merely this ticket's completion. Separate additions keep their own names and are not counted as new runtime findings.

## Source anchors

- [ManagedRelaySettings.tsx](../../../packages/ui/src/ManagedRelaySettings.tsx)
- [managedRelayAction.ts](../../../packages/ui/src/managedRelayAction.ts)
- [managedRelayConfiguration.ts](../../../apps/extension/src/managedRelayConfiguration.ts)
- [managedRelayConfiguration.test.ts](../../../tests/extension/managedRelayConfiguration.test.ts)
- [ClipboardApp.tsx](../../../packages/ui/src/ClipboardApp.tsx)

## Handoff

Coordinator records the fresh baseline/claim, accepted decision assessment, isolated worktree, integration revision, checks and Standards/Spec review under [project workflow](../../../docs/agents/workflow.md). Preserve unrelated work.

## Dispatch assessment — 2026-10-11

Preserves the accepted session/task, field-scoped Save and truthful partial-result contracts, glossary Admission/Device Identity/Relay Configuration semantics, and ADR-0012 single retained-session fallback. Predecessors 03/04/05 are resolved. All first-milestone source is integrated and reviewed; ticket 06 retains priority in the other implementer slot for its still-required Android payload Copy gate. The first checkpoint remains incomplete until that qualification passes. This next independent correctness ticket consumes no unqualified ticket 06 output and creates no exemption or new dependency. No more than two implementers are active.

Coordinator-owned claim: `ux-session-07`, client branch `codex/ux-07-session-recovery`, isolated worktree `/Users/invine/src/js/clipp/.local/ux-implementation/worktrees/ticket-07`, created from the claim commit on `codex/ux-implementation-integration`. Read-only preparation: `/private/tmp/clipp-ux-implementation-20261010/ticket-07-prep.md`. Required native intervals must be scheduled with the coordinator; ticket 06 currently owns the isolated emulator. Real sign-in remains deferred. Host clipboard intervals are closed.

## Answer

Resolved 2026-10-11 by the coordinator at clean integration `da0e947f7ea8c898582284506d4cad9a2baebdfb`, containing source `ba7956cc1b8e8dc112de00a5f17a3d77bcdf19b1`. The document-lived UI session preserves tasks, drafts, query/scope and logical context; Close retains and explicit Cancel/Discard clears. Entity/field-scoped relay writes and awaited actions report partial or unconfirmed credential/configuration and Auto Sync effects truthfully. The review repairs preserve untouched Name during Type changes and reconcile unknown Add through its original key and owning Refresh.

Source check and integrated verify passed 107 suites/796 tests and all three production builds. Incremental Standards/Spec and final required-evidence review passed. Earlier actual Electron/options and the directly authorized 16-case toolbar interval contribute only their demonstrated unchanged action/session semantics; changed presentation is not a current desktop controls, cold-popup or G13/G14 pass.

The new exact Android acceptance APK SHA-256 `39c9868d6a5d0039983e97a04e8bbd77de45f9c2e3ce379c24647b49f391a68f` passed all 19 scoped native cases in interval `ticket-07-native-remaining-ba795-20261011-c015e9a2`. The real single native denial intent naturally clears pending and reports authorization_denied through the exact production callback guard; recorded WebView custom-scheme parsing motivated the raw pinned-redirect/query correction. Actual current default12px to OS2 24px, real relay/Pairing IME portrait/landscape, draft retention, native credential erase/independent retention, rejected persistence, unknown Add and visible controlled Retry are recorded with their actual-versus-controlled boundaries.

The guest, forwards, callbacks/listeners/temporary ports, scalars and bounded helper stopped/restored; prior absent host sharing preference was restored only after confirmed emulator stop and serial absence. Host clipboard intervals are closed. Evidence remains outside disposable worktrees at `/Users/invine/src/js/clipp/.local/ux-implementation/run-20261010/`: `ticket-07-final-evidence-index.json`, `ticket-07-final-evidence-index.md`, `ticket-07-ba795-native-c015-summary.json`, `ticket-07-da0e-final-evidence-review.md`, source/package/merge/gate receipts and immutable submitted assignments/helpers. All failed attempts remain preserved.

Narrow Android Search was unavailable and was not manipulated; visible navigation/Search and native Back retain their later owners. No destroyed-popup/restart draft persistence, real sign-in, provider/camera, assistive/hardware or whole-platform qualification is claimed. E05/E11 remain open for their traceability contributions from navigation/input and terminal Pairing. Required controls and desktop scaling gates remain with tickets 32/17 and affected consumers.
