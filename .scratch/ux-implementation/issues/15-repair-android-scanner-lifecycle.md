# Repair Android scanner safety and lifecycle

Type: implementation
Status: open
Assignee: none
Priority band: 1
Blocked by: 05, 08, 12, 34, 14
Dispatch: plan approved; awaiting an authorized execution run
Parent: [Clipp UX implementation](../spec.md)

## Outcome

The chosen scanner path is safe and every scan settles with payload, cancellation or typed failure.

## Work and boundaries

Implement the diagnosed remedy and one abortable host scan. Stop tracks/frame work on Cancel, Back, background, replacement or disposal; ignore late acquisition/decode and settle once. Use native bounds and user-initiated permission recovery with Paste alternative.

No automatic camera reopen on resume; error is not cancellation. Scanning never bypasses Pairing validation or cancels an already submitted request.

The [approved package contract](../../ux-implementation-plan/native-host-delivery-proposal.md#android-scanner-safety-and-lifecycle) is normative detail for this ticket. Preserve the [shared interfaces](../../ux-implementation-plan/shared-interface-proposal.md) and [specification invariants](../spec.md#preserved-contracts). Update every affected live runtime bridge with its consumer; do not leave a successful helper behind a broken caller.

## Dependencies and integration

- [Report immediate Pairing and approval results](05-report-immediate-pairing-results.md) — consume its completed, scoped output.
- [Compose actionable recovery issues](08-compose-actionable-recovery-issues.md) — consume its completed, scoped output.
- [Integrate Android content bounds and IME](12-integrate-android-content-bounds.md) — consume its completed, scoped output.
- [Deliver Android and Electron task input against existing tasks](34-deliver-android-electron-task-input.md) — consume its completed, scoped output.
- [Diagnose the Android scanner provider](14-diagnose-android-scanner-provider.md) — consume its completed, scoped output.

Only the output scoped here must be complete to resolve this ticket. Later consumers requalify their changed presentation; broad finding collection is separate and cannot block this ticket on its own descendants. Follow [phase admission](../spec.md#delivery-order-and-completion) rather than treating file numbers as an execution sequence.

## Verification and acceptance

Test deferred permission/acquisition/decode, replacement and every abort path, track disposal and late results. Qualify real camera valid/no-QR, denial/regrant, repeated open/close and native Back in the supported candidate environment; no fixture-only physical-camera claim.

Run the [common candidate gates](../spec.md#verification-and-evidence) plus affected suites/builds/native checks. Record exact revision/dirty state, environment, commands and actual outcomes. Preserve regressions through the owning interface; use rendered/native evidence for the behavior that requires it, not implementation-mirroring helper tests.

## Coverage and closure

Candidate scanner/provider and native geometry/input; unavailable physical environments remain unqualified and cannot justify blanket supported-camera claims.

The [coverage ledger](../validation-coverage.md) specifies Candidate, External and Retained dispositions and fresh native intervals. Required missing evidence leaves the affected portion unqualified; report it explicitly. No old observation or planning approval is a pass. Primary finding collector: A08, A09 Full finding closure requires all [traceability contributions](../traceability.md), not merely this ticket's completion. Separate additions keep their own names and are not counted as new runtime findings.

## Source anchors

- [qrCameraScanner.ts](../../../apps/android/src/qrCameraScanner.ts)
- [main.tsx](../../../apps/android/src/main.tsx)

## Handoff

Coordinator records the fresh baseline/claim, accepted decision assessment, isolated worktree, integration revision, checks and Standards/Spec review under [project workflow](../../../docs/agents/workflow.md). Preserve unrelated work. No code, native operation, commit, push or deployment has occurred for this planning ticket.

## Host delivery allocation — DRAFT 2026-10-14

Proposed under the approved cross-runtime refinement and existing-task/functional-management integration boundaries.34 supplies Android/Electron generic native input against resolved07/12/32;35 co-delivers complete Chrome management and Chrome13 input against resolved02/03/06/07/08/32/33. Original13/11 remain collectors;17/19/15/16/10 keep every residual desktop/navigation/scanner/notification/Pairing gate and contribution. Each consumer retains its own affected presentation/native/cutover gates. Consume genuinely completed scoped outputs only; no source-only resolution or finding closure. Root must accept and apply the full allocation before any new claim.
