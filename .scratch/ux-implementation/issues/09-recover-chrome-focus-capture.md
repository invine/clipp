# Recover Chrome focus capture

Type: implementation
Status: claimed
Assignee: ux-focus-capture-09
Priority band: 1
Blocked by: 01, 08
Dispatch: authorized UX implementation run `ux-implementation-20261010`; claim in [run record](../run.md)
Parent: [Clipp UX implementation](../spec.md)

## Outcome

Chrome focus-capture failures have deliberate, usable recovery distinct from network status and Send.

## Work and boundaries

Observe read health and background handoff acknowledgement; do not advance the observed-value reference on an unconfirmed handoff. Retry uses ordinary clipboardUpdate/processLocalText and handles new, empty, unchanged and baseline observations accurately.

No forced new Clip, Auto Sync bypass, persisted capture-baseline invention or content-script capability change. Copy success cannot clear read failure. Keep popup-only focused reads/offscreen writes.

The [approved package contract](../../ux-implementation-plan/correctness-delivery-proposal.md#chrome-automatic-capture-recovery) is normative detail for this ticket. Preserve the [shared interfaces](../../ux-implementation-plan/shared-interface-proposal.md) and [specification invariants](../spec.md#preserved-contracts). Update every affected live runtime bridge with its consumer; do not leave a successful helper behind a broken caller.

## Dependencies and integration

- [Repair Chrome preference integrity](01-repair-chrome-preference-integrity.md) — consume its completed, scoped output.
- [Compose actionable recovery issues](08-compose-actionable-recovery-issues.md) — consume its completed, scoped output.

Only the output scoped here must be complete to resolve this ticket. Later consumers requalify their changed presentation; broad finding collection is separate and cannot block this ticket on its own descendants. Follow [phase admission](../spec.md#delivery-order-and-completion) rather than treating file numbers as an execution sequence.

## Verification and acceptance

Test read rejection, repeated focus without alerts, deliberate Retry, background failure/lost reply and popup destruction. Require a genuinely focused toolbar-popup native read/recovery in a new synthetic-marker interval; record document focus.

Run the [common candidate gates](../spec.md#verification-and-evidence) plus affected suites/builds/native checks. Record exact revision/dirty state, environment, commands and actual outcomes. Preserve regressions through the owning interface; use rendered/native evidence for the behavior that requires it, not implementation-mirroring helper tests.

## Coverage and closure

Candidate Chrome read/Retry; external unchanged-restart recapture and content-script policy are not blanket blockers for this repair.

The [coverage ledger](../validation-coverage.md) specifies Candidate, External and Retained dispositions and fresh native intervals. Required missing evidence leaves the affected portion unqualified; report it explicitly. No old observation or planning approval is a pass. Primary finding collector: C16 Full finding closure requires all [traceability contributions](../traceability.md), not merely this ticket's completion. Separate additions keep their own names and are not counted as new runtime findings.

## Source anchors

- [popup.tsx](../../../apps/extension/src/popup.tsx)
- [background.ts](../../../apps/extension/src/background.ts)
- [service.ts](../../../packages/core/clipboard/service.ts)
- [explicitClipActionsConformance.test.ts](../../../tests/core/runtime/explicitClipActionsConformance.test.ts)

## Handoff

Coordinator records the fresh baseline/claim, accepted decision assessment, isolated worktree, integration revision, checks and Standards/Spec review under [project workflow](../../../docs/agents/workflow.md). Preserve unrelated work. No code, native operation, commit, push or deployment has occurred for this planning ticket.

## Dispatch assessment — 2026-10-13

Predecessors01/08 are resolved. Focused read health and background acknowledgement preserve runtime authority, ordinary baseline semantics, immutable Clip events and ADR-0012. Retry uses the existing ordinary processing route; no forced Clip, Auto Sync bypass, persisted baseline, popup-read/offscreen-write change or external restart/content-script ownership change.

Coordinator claim `ux-focus-capture-09`: client-only isolated branch `codex/ux-09-focus-capture`, based on this claim commit. Read local preparation `ticket-09-current-prep.md`. Owning-interface TDD, current integration incorporation, mandatory merger, both source reviews/common verification and genuine focused toolbar read/recovery remain required. Root assigns a fresh synthetic-marker interval only after readiness; all old intervals are closed. At most two implementers. No native/account/push/publication authority follows from this source claim.
