# Compose actionable recovery issues

Type: implementation
**Status:** resolved
Assignee: ux-issues-08
Priority band: 1
**Blocked by:** [05](05-report-immediate-pairing-results.md), [07](07-preserve-session-tasks-and-editor-recovery.md)
Dispatch: authorized UX implementation run `ux-implementation-20261010`; claim in [run record](../run.md)
Parent: [Clipp UX implementation](../spec.md)

## Outcome

Simultaneous problems remain readable and actionable without covering the app.

## Work and boundaries

Compose stable scoped issues, one compact summary and task-local failures; expandable diagnostics stay inside a bounded task. Wire actual wrapper/runtime faults, including first-launch identity unavailable, retry and ongoing capture recovery. Coalesce duplicates without dropping independent faults.

Dismissal does not resolve a fault or hide active recovery. Disconnected trusted devices and deliberately empty relays are not failures. Preserve copied-without-clip and pending-capture semantics.

The [approved package contract](../../ux-implementation-plan/correctness-delivery-proposal.md#actionable-issue-composition) is normative detail for this ticket. Preserve the [shared interfaces](../../ux-implementation-plan/shared-interface-proposal.md) and [specification invariants](../spec.md#preserved-contracts). Update every affected live runtime bridge with its consumer; do not leave a successful helper behind a broken caller.

## Dependencies and integration

- [Report immediate Pairing and approval results](05-report-immediate-pairing-results.md) — consume its completed, scoped output.
- [Preserve session tasks and editor recovery](07-preserve-session-tasks-and-editor-recovery.md) — consume its completed, scoped output.

Only the output scoped here must be complete to resolve this ticket. Later consumers requalify their changed presentation; broad finding collection is separate and cannot block this ticket on its own descendants. Follow [phase admission](../spec.md#delivery-order-and-completion) rather than treating file numbers as an execution sequence.

## Verification and acceptance

Test combined History/Pairing/initialization/relay problems, Retry/dismiss rules, long errors and enlarged text in the actual short popup and Android task. Verify cold initialization failure cannot enable falsely ready actions.

Run the [common candidate gates](../spec.md#verification-and-evidence) plus affected suites/builds/native checks. Record exact revision/dirty state, environment, commands and actual outcomes. Preserve regressions through the owning interface; use rendered/native evidence for the behavior that requires it, not implementation-mirroring helper tests.

## Coverage and closure

Candidate combined-failure geometry and initialization recovery. Android IME/safe bounds and final navigation sizing contribute to A13 closure.

The [coverage ledger](../validation-coverage.md) specifies Candidate, External and Retained dispositions and fresh native intervals. Required missing evidence leaves the affected portion unqualified; report it explicitly. No old observation or planning approval is a pass. Primary finding collector: E02, C04, A13, A17 Full finding closure requires all [traceability contributions](../traceability.md), not merely this ticket's completion. Separate additions keep their own names and are not counted as new runtime findings.

## Source anchors

- [ClipboardApp.tsx](../../../packages/ui/src/ClipboardApp.tsx)
- [main.tsx](../../../apps/android/src/main.tsx)
- [clipboardActionFeedback.ts](../../../packages/ui/src/clipboardActionFeedback.ts)
- [clipboardActionFeedback.test.ts](../../../tests/ui/clipboardActionFeedback.test.ts)

## Handoff

Coordinator records the fresh baseline/claim, accepted decision assessment, isolated worktree, integration revision, checks and Standards/Spec review under [project workflow](../../../docs/agents/workflow.md). Preserve unrelated work.

## Dispatch assessment — 2026-10-11

Predecessors 05 and 07 are resolved. The requested compact scoped issue summary, task-local failures and real cold-initialization/capture recovery preserve runtime authority, one live UI session, truthful partial/unconfirmed action results and ADR-0012. Empty relays/disconnected trusted devices are not failures; dismissal does not hide active recovery. No accepted product invariant changes.

Coordinator claim `ux-issues-08`: client branch `codex/ux-08-recovery-issues`, isolated worktree `/Users/invine/src/js/clipp/.local/ux-implementation/worktrees/ticket-08`, based on this claim commit. Preparation is `/private/tmp/clipp-ux-implementation-20261010/ticket-08-10-prep.md`. Implement through the actual shared shell/task and all affected runtime/wrapper consumers, using owning-interface test-first slices. All required short actual-toolbar/enlarged Android/initialization gates remain required; no fixture-only replacement. Native/clipboard/global-settings intervals require fresh coordinator assignment; no interval is granted by this claim. Real sign-in and external/hardware/assistive deferrals remain unchanged. At most two source implementers; ticket 32 qualification is coordinated separately.

## Native candidate refresh — 2026-10-11

Reviewed recovery source `ea83`, integrated at `52624599` and its111 suite / 807 test routine gate remain preserved. The initial actual fault-popup attempt `ticket-08-toolbar-faults-20261011-81e503cf` stopped before popup scripts resumed on an unexpected paused `about:blank` target; no font change or host clipboard access occurred. Its owned browser/profile/helper and assignment are CLOSED, with exact failure/closure receipts retained. This is not a native fault-presentation pass.

Ticket 10's reviewed authority integration `ee759cab` and the bounded17 clipping repair supersede frozen `52624599` native preparation/APK `0cbb948b` for changed presentation. Regenerate exact reviewed source/build/packaged-asset mappings, authority-compatible early memory ports, native readiness and root assignment after the layout repair is integrated. Old packages/receipts remain historical; no unrun old candidate qualifies the new consumer. Actual short-popup, enlarged Android task and owning initialization failure/Retry gates remain required. The generation-producer fault plan establishes its scoped initialization path, not strict all-store durability (ticket 28).

## Actual toolbar presentation qualification — 2026-10-12

Independent evidence review passes the exact frozen `8673a9bd91f9469d73c4c34474d0a0c21bfe807f` Chrome interval `ticket-08-toolbar-faults-20261012-6a047bc9`: ordinary Clip/Copy and combined six-issue presentation at default, 24px, 32px and restored fonts; long diagnostics, Retry/Close/reopen and cold Identity recovery. Full bounds, clipping ancestors, stable geometry, painted hit ownership and negative overlay rejection/restoration are recorded. The corrected probes use measured normalized radii; earlier failed fixed-corner and entrance-animation attempts remain preserved. Root closed the profile/browser/power/assignment and restored fonts.

Reports `ticket-08-17-v10-native-evidence-review.md/.json` and the versioned v10 interval remain in the ignored run evidence directory. This protected early-port presentation does not qualify real capture, actual Pairing, Android, G14 or the newly integrated theme presentation. Android boot/install passed before an approval rejection stopped UI startup; that guest closed with exact scalar/Qt restoration. The user subsequently approved guest-only root/firewall checks. A fresh current APK, assignment and effective isolation proof remain required. Ticket 08 stays claimed.

## Answer — 2026-10-13

Resolved scoped issue/recovery foundation on client integration `ea09b20882614656b378432a19edee8f66aceb08`, tree `2489d98ccc316b17436a385f30368bfb7803d3e6`. Mandatory integration includes independently reviewed08 compatibility940e and20 feedback2c89. Combined verification passes125 suites/903 tests/all three builds/zero lint errors. Both source/mapping and completion audits pass.

Current Android rootv27/149c1e1c on APKd1ea passes genuine generation failure, failed Retry, genuine recovery and combined fault/diagnostics/control journeys at default, enlarged, rotated and restored text. Matched glyph growth, same-document continuity,36 control witnesses and all16 screenshots are independently audited. Exact raw settings, owned forwards, guest/PID/serial/CDP/log/consumer and Qt restoration pass; root independently confirms resource absence. Preserved c832/unroot and every prior failure are not promoted. Qualified historical Chrome8673/v10 supplies its earlier recorded foundation scope.

Evidence outside disposable worktrees: `ticket-08-v27-149c1e1c-spec-evidence-audit.md/.json`, `ticket-08-v27-149c1e1c-standards-evidence-audit.md`, `ticket-08-completion-checklist.md`, rootv27/current-v21 interval receipts and `repairs-combined-verification.json`. Local run mapping supplies paths.

No finding closes here. Later themes18/navigation19/native input13/current management/clipboard09/Pairing10/G14 and external hardware/account/assistive/transport owners retain their required gates. This scoped output no longer blocks its consumers; changed presentation remains subject to their requalification.
