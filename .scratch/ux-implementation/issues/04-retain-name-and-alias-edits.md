# Retain Device Name and alias edits

Type: implementation
Status: claimed
Assignee: ux-edits-04
Priority band: 1
Blocked by: 01
Dispatch: authorized UX implementation run `ux-implementation-20261010`; claim and branch details in [run record](../run.md)
Parent: [Clipp UX implementation](../spec.md)

## Outcome

Failed Device Name and alias saves retain editable raw input with accurate recovery.

## Work and boundaries

Introduce reusable draft/result primitives with these editors; update all affected runtime callbacks/promises. Pending saves prevent duplicates, late success cannot erase newer typing, and removed targets cannot be recreated. Preserve same-field draft until explicit Save applies its edited value.

Device Name and Local Device Alias remain distinct; no conflict-review prompt, identity transfer or alias-clear addition here.

The [approved package contract](../../ux-implementation-plan/correctness-delivery-proposal.md#retained-device-name-and-alias-edits) is normative detail for this ticket. Preserve the [shared interfaces](../../ux-implementation-plan/shared-interface-proposal.md) and [specification invariants](../spec.md#preserved-contracts). Update every affected live runtime bridge with its consumer; do not leave a successful helper behind a broken caller.

## Dependencies and integration

- [Repair Chrome preference integrity](01-repair-chrome-preference-integrity.md) — consume its completed, scoped output.

Only the output scoped here must be complete to resolve this ticket. Later consumers requalify their changed presentation; broad finding collection is separate and cannot block this ticket on its own descendants. Follow [phase admission](../spec.md#delivery-order-and-completion) rather than treating file numbers as an execution sequence.

## Verification and acceptance

Test valid/invalid/normalized names and aliases, whitespace and limits, external updates, missing reply, removed target and input after Save. Verify actual authoritative state plus visible retained draft across affected hosts.

Run the [common candidate gates](../spec.md#verification-and-evidence) plus affected suites/builds/native checks. Record exact revision/dirty state, environment, commands and actual outcomes. Preserve regressions through the owning interface; use rendered/native evidence for the behavior that requires it, not implementation-mirroring helper tests.

## Coverage and closure

Candidate remaining name/alias boundaries. Assistive VoiceOver/TalkBack/hardware paths retain their individual dispositions.

The [coverage ledger](../validation-coverage.md) specifies Candidate, External and Retained dispositions and fresh native intervals. Required missing evidence leaves the affected portion unqualified; report it explicitly. No old observation or planning approval is a pass. Primary finding collector: Supporting package or separate approved addition; see traceability. Full finding closure requires all [traceability contributions](../traceability.md), not merely this ticket's completion. Separate additions keep their own names and are not counted as new runtime findings.

## Source anchors

- [ClipboardApp.tsx](../../../packages/ui/src/ClipboardApp.tsx)
- [identity.ts](../../../packages/core/trust/identity.ts)
- [preload.ts](../../../apps/electron/src/preload.ts)
- [client.ts](../../../apps/android/src/client.ts)
- [background.ts](../../../apps/extension/src/background.ts)
- [presentation.test.ts](../../../tests/core/pairing/presentation.test.ts)

## Handoff

Coordinator records the fresh baseline/claim, accepted decision assessment, isolated worktree, integration revision, checks and Standards/Spec review under [project workflow](../../../docs/agents/workflow.md). Preserve unrelated work. No code, native operation, commit, push or deployment has occurred for this planning ticket.
