# Diagnose the Android scanner provider

Type: implementation
Status: open
Assignee: none
Priority band: 1
Blocked by: none
Dispatch: plan approved; awaiting an authorized execution run
Parent: [Clipp UX implementation](../spec.md)

## Outcome

A bounded diagnosis identifies a safe scanner remedy and the environments still unqualified.

## Work and boundaries

Reproduce the recorded provider crash in an isolated candidate. Record Android/WebView/provider/dependency/manifest versions and failing stage; compare implicated environment with intended supported provider. Evaluate the availability probe itself, then justify the smallest provider correction or safe existing decoder route.

Do not infer a universal Android fix from exception text, force broad upgrades or treat overridden provider fixtures as unmodified acceptance. No production scanner enablement from diagnosis alone.

The [approved package contract](../../ux-implementation-plan/native-host-delivery-proposal.md#android-scanner-provider-diagnosis) is normative detail for this ticket. Preserve the [shared interfaces](../../ux-implementation-plan/shared-interface-proposal.md) and [specification invariants](../spec.md#preserved-contracts). Update every affected live runtime bridge with its consumer; do not leave a successful helper behind a broken caller.

## Dependencies and integration

No technical predecessor. The approved phase admission rule still applies.

Only the output scoped here must be complete to resolve this ticket. Later consumers requalify their changed presentation; broad finding collection is separate and cannot block this ticket on its own descendants. Follow [phase admission](../spec.md#delivery-order-and-completion) rather than treating file numbers as an execution sequence.

## Verification and acceptance

Deliver a reproducible sanitized diagnostic receipt and supported remedy choice, or an exact environmental blocker. Separate construction, camera acquisition/permission and real decoding; use public synthetic Pairing Targets.

Run the [common candidate gates](../spec.md#verification-and-evidence) plus affected suites/builds/native checks. Record exact revision/dirty state, environment, commands and actual outcomes. Preserve regressions through the owning interface; use rendered/native evidence for the behavior that requires it, not implementation-mirroring helper tests.

## Coverage and closure

Candidate provider diagnosis; missing physical/provider evidence stays named, and only blocks affected support claims. Diagnosis does not close A08.

The [coverage ledger](../validation-coverage.md) specifies Candidate, External and Retained dispositions and fresh native intervals. Required missing evidence leaves the affected portion unqualified; report it explicitly. No old observation or planning approval is a pass. Primary finding collector: Supporting package or separate approved addition; see traceability. Full finding closure requires all [traceability contributions](../traceability.md), not merely this ticket's completion. Separate additions keep their own names and are not counted as new runtime findings.

## Source anchors

- [qrCameraScanner.ts](../../../apps/android/src/qrCameraScanner.ts)
- [AndroidManifest.xml](../../../apps/android/android/app/src/main/AndroidManifest.xml)

## Handoff

Coordinator records the fresh baseline/claim, accepted decision assessment, isolated worktree, integration revision, checks and Standards/Spec review under [project workflow](../../../docs/agents/workflow.md). Preserve unrelated work. No code, native operation, commit, push or deployment has occurred for this planning ticket.
