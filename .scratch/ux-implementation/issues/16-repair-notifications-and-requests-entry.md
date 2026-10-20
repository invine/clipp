# Repair notifications, permissions and Requests entry

Type: implementation
Status: claimed
Assignee: ux-notifications-16
Priority band: 1
Blocked by: 07, 08, 35, 34, 36
Dispatch: 2026-10-20 coordinator claim after resolved07/08/35/34/36
Parent: [Clipp UX implementation](../spec.md)

## Outcome

Notification permission recovery is reachable and selecting a real request opens Requests after readiness.

## Work and boundaries

Implement app/channel availability and user-initiated settings return; route selection through the existing host destination owner. Retain readiness entry, coalesce duplicates and reconcile expired requests. Chrome consumes secure full-page handoff; Android reconnect notifications retain their distinct purpose.

Denial is not a new continuity prerequisite. Arrival alone does not navigate, selection is not Pairing success, and dirty task context is preserved.

The [approved package contract](../../ux-implementation-plan/native-host-delivery-proposal.md#notifications-permission-recovery-and-requests-entry) is normative detail for this ticket. Preserve the [shared interfaces](../../ux-implementation-plan/shared-interface-proposal.md) and [specification invariants](../spec.md#preserved-contracts). Update every affected live runtime bridge with its consumer; do not leave a successful helper behind a broken caller.

## Dependencies and integration

- [Preserve session tasks and editor recovery](07-preserve-session-tasks-and-editor-recovery.md) — consume its completed, scoped output.
- [Compose actionable recovery issues](08-compose-actionable-recovery-issues.md) — consume its completed, scoped output.
- [Deliver complete Chrome management, secure handoff and task input](35-deliver-chrome-management-and-task-input.md) — consume its completed, scoped output.
- [Deliver Android and Electron task input against existing tasks](34-deliver-android-electron-task-input.md) — consume its completed, scoped output.

Only the output scoped here must be complete to resolve this ticket. Later consumers requalify their changed presentation; broad finding collection is separate and cannot block this ticket on its own descendants. Follow [phase admission](../spec.md#delivery-order-and-completion) rather than treating file numbers as an execution sequence.

## Verification and acceptance

Separately verify permission/destination wiring and real delivery/selection with a genuine request on each host. Diagnose Electron OS error without assuming cause. Cover cold/resumed/hidden hosts, worker wake, stale request, denial/regrant and repeated selection.

Run the [common candidate gates](../spec.md#verification-and-evidence) plus affected suites/builds/native checks. Record exact revision/dirty state, environment, commands and actual outcomes. Preserve regressions through the owning interface; use rendered/native evidence for the behavior that requires it, not implementation-mirroring helper tests.

## Coverage and closure

Candidate delivered notification/permission journeys and Android request routing. Requires new coordinated permission interval where global settings change; callbacks alone do not pass.

The [coverage ledger](../validation-coverage.md) specifies Candidate, External and Retained dispositions and fresh native intervals. Required missing evidence leaves the affected portion unqualified; report it explicitly. No old observation or planning approval is a pass. Primary finding collector: A07 Full finding closure requires all [traceability contributions](../traceability.md), not merely this ticket's completion. Separate additions keep their own names and are not counted as new runtime findings.

## Source anchors

- [notifications.ts](../../../packages/core/runtime/notifications.ts)
- [main.ts](../../../apps/electron/src/main.ts)
- [background.ts](../../../apps/extension/src/background.ts)
- [client.ts](../../../apps/android/src/client.ts)
- [notifications.test.ts](../../../tests/core/runtime/notifications.test.ts)

## Handoff

Coordinator records the fresh baseline/claim, accepted decision assessment, isolated worktree, integration revision, checks and Standards/Spec review under [project workflow](../../../docs/agents/workflow.md). Preserve unrelated work. No code, native operation, commit, push or deployment has occurred for this planning ticket.

## Host delivery allocation — DRAFT 2026-10-14

Proposed under the approved cross-runtime refinement and existing-task/functional-management integration boundaries.34 supplies Android/Electron generic native input against resolved07/12/32;35 co-delivers complete Chrome management and Chrome13 input against resolved02/03/06/07/08/32/33. Original13/11 remain collectors;17/19/15/16/10 keep every residual desktop/navigation/scanner/notification/Pairing gate and contribution. Each consumer retains its own affected presentation/native/cutover gates. Consume genuinely completed scoped outputs only; no source-only resolution or finding closure. Root must accept and apply the full allocation before any new claim.

## Host dependency allocation — 2026-10-20

Consume resolved[36](36-deliver-android-task-input.md) for Android and retain[34](34-deliver-android-electron-task-input.md) for all remaining Electron requirements. Existing Chrome35 and every original collector/native gate remain unchanged.

## Dispatch assessment — 2026-10-20

Claim ux-notifications-16 after genuinely complete07/08/35/34/36. Preserve accepted notification/session/continuity authority and ADR0012: arrival never navigates, actual selection reaches the existing destination owner after readiness, duplicate selection coalesces, expired targets reconcile, dirty tasks remain, permission denial is not a new continuity prerequisite. No reset30 action, second router, fake request or speculative Electron OS-error remedy.

Use a fresh isolated client worktree/branch from this coordinator commit; root supplies its exact identity/baseline and bounded source/native evidence pointers before dispatch. Apply TDD through actual public notification availability/selection and destination/session owners, with external native notification/permission ports controlled only at their existing boundary. Prove actual consuming host/bridge paths across Electron/Chrome/Android. Diagnose the concrete Electron error before changing behavior. Source tests are supporting evidence, never actual delivery/selection qualification.

Root alone owns broad-check serialization, actual SDK/CUA/clipboard/notification/permission/native intervals, mandatory merger, independent Standards/Spec and fresh integrated verification. No source author may launch native tools, change host permissions/global settings, fabricate storage/preferences/requests, use private UI/store/bridge hooks, enable30 or mutate an operator/account/relay profile. Standing user authorizations persist; no repeated approval request. At most two active source implementers: scanner15 diagnostic-stage work and16.29 source is frozen/reviewed/integrated; its Android-shell continuation stays prepared but undispatched. Preserve all native failures, external/retained qualifications and TT35-only acceptance.
