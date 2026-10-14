# Recover Chrome focus capture

Type: implementation
Status: resolved
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

## Answer — 2026-10-15

Resolved scoped Chrome capture recovery on clean integrated candidate `c94994b53ad1efeb6c4ff221f3632f54c7edc822`, tree `68796d2579d29e928fdb54ef8fb084d0b2677133`. Reviewed source272b83e is mandatory-FF integrated; current combined verification passes138 suites/961 tests/all three builds/zero lint errors. Both source and current native evidence axes pass.

Actual toolbar intervalbf147979 records genuine root native Tab focus and document focus, original synthetic-marker read, actual background acknowledgement, controlled rejection with visible recovery context, repeated focus without additional reads, a real dropped reply with truthful unconfirmed state, ordinary unchanged Retry retaining one Clip/ID, and held pending handoff disposal. Exact known popup target absence was observed2380ms before the conservative original deadline. Five case JSON and four renderer PNG witnesses are retained; disposal is JSON-only. Controlled fault injection/CDP Retry are labelled separately from actual native focus/read/background behavior.

Original `PARTIAL_TICKET09_CLOSED_REQUIRES_NATIVE_EVIDENCE_REVIEW` receipt and its stale toolbar placeholder are unchanged. Separate root inventory annotations, independent closure and both evidence reviews support scoped completion. All earlier failures retain their original status. Browser exited0 gracefully; owned PID/profile/read grants closed. Standing user approval now authorizes automatic synthetic-marker writes and retries without readiness prompts; each new attempt still requires its own guarded interval and closure.

Evidence outside disposable worktrees: `ticket-09-completion-decision-20261014.json`, `ticket-09-native-bf14-{standards,spec}-evidence-review.md`, `ticket-09-native-bf14-root-inventory-annotations.json`, bf147979 original receipt/root closure and `ticket-35-integrated-verification.json` under the ignored run evidence directory in [run](../run.md). C16 is assessed separately in [finding status](../finding-status.md). Other Chrome management/cutover/native Pairing/G01/G14/G36 and external restart/content-script owners retain their gates; later changed consumers must requalify affected recovery.
