# Fence reset runtime work and restart

Type: implementation
Status: claimed
Assignee: ux-reset-runtime-29
Priority band: 3
Blocked by: 28
Dispatch: 2026-10-16 whole-backlog continuation after qualified storage28; two implementers
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

## Dispatch — 2026-10-16

Storage28 is genuinely complete at6c0e26fc3567bda701ea6b2e4b70c80664a0974a after real cross-host durable-store crash/reopen proof, both reviews and fresh146/1033/all-build verification. Existing claim29 ux-reset-runtime-29 has two coordinated fresh isolated contributors: shared core admission/drain plus Electron/Chrome host integration; Android native ingress/continuity plus client integration. Root records exact new worktree/baseline branches in the supplied run artifacts before assignment.

Decision assessment: preserve approved ADR0004/0008 and the manual-reset runtime responsibilities. One transition owner, no old-writer repopulation, no fresh candidate during recovery, durable native refusal/queue cleanup, preference-preserving suspension and rebuilt owners after completion. Unknown acceptance remains fenced. Changes to the shared seam include every consuming bridge. Production user actions/UI remain unavailable until their complete qualified path; package30 is separate.

Approved public seams are actual runtime action/storage/writer ownership, offscreen wake/proxy generations and native ingress/continuity queues, plus the existing core lifecycle ports. Use meaningful TDD and actual host tests; native fixtures/builds cannot waive actual required behavior. External Chrome restart-recapture remains owned separately and must be demonstrably satisfied where consumed. Real system-clipboard tests use fresh synthetic marker intervals under the user's existing write/retry authorization; do not repeat Ready/approval questions. Root serializes native/global resources and preserves all earlier failed gates/deferrals. No real sign-in, operator profile mutation, push/PR/publication/deployment.

## Reviewed implementation and available native checks — 2026-10-16

Two isolated contributors delivered the common admission/drain lifecycle and all three runtime integrations. Mandatory merges culminate in source `f3e1a531bef8d746126a6af39c386608f44fb840`, tree `ade0101744696b4e7e4b1c80fc60fcfc329a9a5a`. Ordinary cached writers, delayed startup and auth results are fenced; raw recovery and read-only notification teardown remain possible. Chrome validates generation envelopes and retires surviving offscreen work before cold recovery readiness. Android durably fences native ingress, clears both queues, refuses cached/no-op proof after a failed commit, preserves preferences/credentials, and recreates the Activity to rebuild native plugin owners. Cold conclusive nonacceptance requests a fresh bootstrap; an active rejected begin resumes existing services.

Independent Standards and Spec reviews and their final incremental follow-through have zero outstanding source findings. Earlier findings and RED evidence are retained. Fresh integrated `npm run verify` passes 150 suites / 1,063 tests, all typechecks and all three production builds; lint has 0 errors / 850 warnings. Exact commits, source mappings, logs and report hashes are bound in ignored run `ticket29-integrated-verification.json`.

Actual isolated Android execution passed 18 methods: nine existing native continuity regressions and nine native reset admission/queue/process/recreation cases, including real commit failure and poisoned-cache retry refusal. Native queues and provisional/accepted metadata survive force-stop and are reopened in distinct processes; visible and dismissed five-field receipts are covered. Guest closure and exact original emulator clipboard-sharing restoration are independently recorded. These are supporting native seams tested on Android2489/core2257; the final shared-JS cold-ordering correction has separate tests/reviews. They do not qualify the complete production client/UI reset or clipboard path. Raw evidence: `ticket29-native-runtime-7cea228b54/receipt.json`, manifest, audit and independent closure receipt in the ignored run directory.

**Status remains claimed.** Actual production Electron reset/relaunch/clipboard, Chrome worker/offscreen/handoff/reset baseline and the complete Android reset-to-replacement/clipboard journey remain unqualified. No package30 consumer release, action activation or full G41/31 completion follows. External Chrome restart-recapture ownership remains unchanged. All prior failures, G14/no alternate host, Chrome G01/no owned public peer, sign-in and retained/external deferrals persist.

## Remaining source work — 2026-10-16

Resume existing ux-reset-runtime-29 claim for Android continuity controls/events that pass assertOpen before asynchronous work but are not held in workFence.run. Prove the admitted Start/Auto Sync/notification/activity work cannot complete after accepted reset teardown and reactivate old native service/capture or publish stale state. Use real Android client/coordinator/fence seams and existing tests; drain the complete admitted operation while retaining reset-only teardown and ordinary stop behavior. Preserve settings/native epoch/receipt guards, ADR0004/0008/0012 and all original gates; no manual-reset action activation.

Dispatch baseline `d8a08b93e19bfbaafefe6beb6e3f5428dd505ae0`; two isolated implementers maximum. Fresh contributor context, npm owning-interface TDD/check/actual sanitized hook, current-tip incorporation and mandatory integration/review/verification. Native checks and harness preparation are excluded from this assignment. Existing authorizations persist; no repeated approval request.

## Remaining continuity source race repaired — 2026-10-16

Two parallel source assignments resumed29 and35 without native/harness work. Android source `03e15ed534cbc83ee2612e2b4d9d50b01ea829fd` fixes reproduced races where delayed Start or an admitted heartbeat/Activity operation could outlive reset suspension. The coordinator drains its admitted control queue before final native stop and uses the existing core work fence for ordinary complete operations; snapshot/diagnostic and shutdown/reset/rotation teardown stay available. AndroidClient holds complete public control and Activity/notification chains, including deferred feedback, in that same fence. Saved background mode/Auto Sync and all native epoch/receipt/poison contracts remain.

Public coordinator and actual AndroidIdentityResetRuntime regressions provide RED/GREEN; the existing client fixture remains unchanged. A trial that would have required private state or deferred reset activation was reverted and retained as failed evidence. Mandatory merge preserves exact source ancestry. Both review axes report zero findings on final joint source `253dfeeaed503f4e64edc6625832345aeaf0b4fa`; fresh root verify passes152 suites/1,107 tests, all typechecks/all3builds, lint0errors/875warnings. Ignored run `ticket29-continuity-source-handoff.json`, `remaining29-merge-receipt.json`, both `remaining-source-*-review.md` and `remaining-source-integrated-verification.json` bind source/logs/reviews.

This closes the reproduced source gaps only.29 remains claimed for complete current production/native restart/clipboard qualification. Previous native observations stay bound to their original revisions; no new native pass, G41/31 closure,30 UI activation, dependency release or gate waiver follows. No native/SDK/CUA/clipboard/global-setting operation or harness preparation occurred.

## Rejected-reset startup recovery repaired — 2026-10-17

Source `6246c382f78b455636fb4fae8e891c7c66ee3500` repairs reproduced rejection during incomplete ordinary startup. Identity loading no longer counts as completed service startup. Each initialize resets readiness; the existing startup owner reports applicable local/network completion only after its generation check. Electron, Chrome and Android all consume that notification. The reset coordinator now publishes its already-classified conclusive nonacceptance even from idle; unknown acceptance still stays fenced. Incomplete/reused startup is sealed and requests a fresh bootstrap, while a completed active runtime resumes after rejection. Existing real SQLite coordinator tests preserve identity/History and cover restart failure.

Three original RED records, the initial loopback sandbox failure, pre-refinement pass and final focused 10-suite/138-test pass remain bound separately. Author check/actual unchanged sanitized hook pass 152 suites/1,145 tests. Mandatory merger preserves exact ancestry. After the independent TT18 settings repair was incorporated, both review axes report zero findings and fresh root verify on `080d71d123d4ab259cacd6b1ca48d187e3919fdf` / tree `8481bb3edb4b73a559e2c4899d2d433c7dbbe29a` passes 152 suites/1,149 tests, all typechecks/all three production builds, lint 0 errors/896 warnings. Exact ignored receipt: `source18-29-integrated-verification-20261017.json`, author handoff and both unique merge receipts.

29 remains claimed for its required production/native restart, queues/ingress and clipboard qualification; no30 action activation or full G41/31 closure follows. TT35 stays resolved by explicit user acceptance, with original actual/deferred provenance intact. No new harness, native/SDK/CUA/clipboard/global setting, real account/operator/relay action or renewed approval request occurred. Earlier failures, deferrals and preserved work remain.
