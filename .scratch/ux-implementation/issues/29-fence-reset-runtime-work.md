# Fence reset runtime work and restart

Type: implementation
**Status:** claimed
Assignee: ux-reset-runtime-29
Priority band: 3
**Blocked by:** [28](28-integrate-durable-reset-storage.md), [30](30-integrate-manual-reset-ui.md)
Dispatch: 2026-10-16 whole-backlog continuation after qualified storage28; two implementers
Parent: [Clipp UX implementation](../spec.md)

## Outcome

Qualify complete integrated reset runtime/restart/ingress/clipboard behavior R29.4–R29.6 after real UI 30, preserving claim `ux-reset-runtime-29`. Actual host-seam output R29.1–R29.3 belongs to [38](38-qualify-reset-host-seam.md).

## Work and boundaries

Re-exercise accepted/manual recovery and startup through actual UI 30 and each supported owning host. Cover late writers and callback fencing, unknown/incomplete acceptance, restart/relaunch failure, strict native queues/ingress/pointer cleanup and preference preservation. Scoped actual host observations from 38 may be reused only with checked applicability.

Observe unchanged synthetic clipboard through reset/restart and later deliberately changed values under ordinary policy. Consume the external Chrome restart-recapture boundary rather than waiving it. The [runtime contract](../../ux-implementation-plan/manual-identity-reset-proposal.md#runtime-responsibilities) remains normative; final matrix ownership stays 31 and no normal reset action is activated by this split.

## Dependencies and integration

- [Integrate durable reset storage adapters](28-integrate-durable-reset-storage.md) — consume its completed, scoped output.
- [Integrate authenticated manual reset actions and UI](30-integrate-manual-reset-ui.md) — consume its completed, scoped output.

Only the output scoped here must be complete. Native collectors keep their own criteria; a proposed allocation, source fixture or unavailable runtime cannot supply their observation. Follow [phase admission](../spec.md#delivery-order-and-completion).

## Verification and acceptance

R29.4: integrated native runtime/restart journeys reproduce the host-seam invariants through the real accepted/manual recovery path. R29.5: actual unchanged/changed synthetic clipboard baseline with external Chrome ownership intact. R29.6: native queue/ingress/pointer cleanup and preserved preferences across replacement, reopen and relaunch failure.

Use [finite candidate preparation and affected gates](../adoption.md#candidate-preparation-and-qualification). Public seams support regression; actual host/native evidence and checked applicability qualify these residual cases. Preserve historical implementation and failed native observations below. F31 remains the sole final whole-reset matrix owner.

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

Coordinator records the fresh baseline/claim, accepted decision assessment, isolated worktree, integration revision, checks and Standards/Spec review under [project workflow](../../../docs/agents/workflow.md). Preserve unrelated work.

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

## Pre-intent preparation rejection recovery — 2026-10-17

The existing real SQLite runtime/lifecycle seam reproduced incomplete startup remaining retired after a conclusive preparation rejection with no intent write. Two post-admission paths were affected: an eligibility read throwing, and eligibility returning false after a transient key-derivation failure. After successful provisional-fence release, both now publish proven nonacceptance so the existing startup owner rebuilds incomplete startup. A completed active runtime remains usable; ambiguous acceptance or failed fence release remains fenced. No reset action is enabled.

Separate RED cases and final focused5-suite/99-test GREEN are preserved, alongside the initial full152-suite/1,152-test pass before the adjacent validation-path correction. Final source/check/hook/latest-tip evidence is in ignored run `resume29-handoff-20261017.json`; mandatory merge, independent reviews and final integrated routine verification are recorded in `resume19-29-integrated-verification-20261017.json`.29 remains claimed for its required actual production/native restart, ingress/queue and clipboard qualification. TT35's bounded acceptance is unchanged; no30 activation or G41/31 completion follows.

## Adopted allocation — 2026-10-29

[38](38-qualify-reset-host-seam.md) owns R29.1–R29.3 actual host output; this claim retains R29.4–R29.6 after 30. Existing historical source/native observations are not upgraded. Original external Chrome baseline ownership and [31](31-qualify-manual-reset-recovery.md) final qualification remain required.
