# Implement the durable manual reset transition

Type: implementation
Status: claimed
Assignee: ux-reset-27
Priority band: 3
Blocked by: none
Dispatch: 2026-10-15 user-directed non-native work; two coordinated implementers under one core claim
Parent: [Clipp UX implementation](../spec.md)

## Outcome

A manual reset has one durable acceptance boundary, one candidate and recoverable roll-forward semantics.

## Work and boundaries

Extend the existing transition owner with typed begin/reconcile/resume and selected one-reminder policy. Validate journal/candidate key material, reviewed Peer ID and opaque operation; preserve unknown acceptance until reconciliation. Require cleanup, public receipt and bounded replay guard before completion.

Accepted manual reset suspends old local work/capture, no Undo. Automatic immediate safety, revoked local-only recovery and optional notices remain unchanged. No private candidate/backups in public state; no predecessor network revocation.

The [approved package contract](../../ux-implementation-plan/manual-identity-reset-proposal.md#private-durable-state-and-public-interface) is normative detail for this ticket. Preserve the [shared interfaces](../../ux-implementation-plan/shared-interface-proposal.md) and [specification invariants](../spec.md#preserved-contracts). Update every affected live runtime bridge with its consumer; do not leave a successful helper behind a broken caller.

## Dependencies and integration

No technical predecessor. The approved phase admission rule still applies.

Only the output scoped here must be complete to resolve this ticket. Later consumers requalify their changed presentation; broad finding collection is separate and cannot block this ticket on its own descendants. Follow [phase admission](../spec.md#delivery-order-and-completion) rather than treating file numbers as an execution sequence.

## Verification and acceptance

Test offline/preaccept failure, lost reply/unknown storage, duplicate/stale requests, automatic races, candidate reuse and every cleanup/finalization seam. Test receipt until dismissal, second reset refusal pending disposition and later automatic preservation. This package does not enable any user action.

Run the [common candidate gates](../spec.md#verification-and-evidence) plus affected suites/builds/native checks. Record exact revision/dirty state, environment, commands and actual outcomes. Preserve regressions through the owning interface; use rendered/native evidence for the behavior that requires it, not implementation-mirroring helper tests.

## Coverage and closure

Candidate core failure invariants; actual durable adapter and native restart proof remain dependent packages.

The [coverage ledger](../validation-coverage.md) specifies Candidate, External and Retained dispositions and fresh native intervals. Required missing evidence leaves the affected portion unqualified; report it explicitly. No old observation or planning approval is a pass. Primary finding collector: Supporting package or separate approved addition; see traceability. Full finding closure requires all [traceability contributions](../traceability.md), not merely this ticket's completion. Separate additions keep their own names and are not counted as new runtime findings.

## Source anchors

- [identityRotation.ts](../../../packages/core/trust/identityRotation.ts)
- [identityInitialization.ts](../../../packages/core/runtime/identityInitialization.ts)
- [identityRotation.test.ts](../../../tests/core/trust/identityRotation.test.ts)
- [identityInitialization.test.ts](../../../tests/core/runtime/identityInitialization.test.ts)

## Handoff

Coordinator records the fresh baseline/claim, accepted decision assessment, isolated worktree, integration revision, checks and Standards/Spec review under [project workflow](../../../docs/agents/workflow.md). Preserve unrelated work. No code, native operation, commit, push or deployment has occurred for this planning ticket.


## Non-native dispatch — 2026-10-15

The user explicitly requested continuing with two implementers on work not blocked by native checks, preserving failed gates and avoiding further harness preparation. This supplies scheduling direction for this independent core package while earlier native-qualified outputs remain incomplete. It changes no behavior, dependency or validation disposition. Tickets17/18/19/20/25/26/34/35 keep every failed/unqualified native gate; dependent storage/runtime/UI reset packages28–31 remain unavailable.

Claim ux-reset-27, baseline37bfe9990fdbcb8bdaa7f67cc991388ee23fcf14 on codex/ux-implementation-integration. One canonical owner, two coordinated source assignments in isolated worktrees: transition/journal/coordinator and core startup/recovery consumer. Both contributions must be integrated and verified together before core27 resolves. No artificial separate source-only ticket or gate waiver is created.

Accepted public test seams are the specified beginIdentityReset/reconcile/resume/dismiss-reminder actions on the existing core transition owner, injected authoritative repository/storage/cleanup/fence ports, and the existing runtime lifecycle/service-start owner. Use owning TDD through these seams, including failure/ambiguous acceptance, one candidate, cleanup/finalization/replay/reminder policy and automatic coexistence. Preserve ADR0004 automatic immediate shutdown/remove-wins/Identity Loss/revoked local-only behavior and ADR0008 key privacy/storage boundaries. Manual accepted recovery seals old local work, uses roll-forward, and requires durable receipt plus replay guard before private journal sanitization. One shared serialization owner; no second router, UI store or transition lock.

No user action is enabled and no host storage adapter/ingress capability is advertised by core-only completion. Actual strict adapters, queues, restart and UI stay with28–31 and their original gates. No native/CUA/SDK/clipboard/global settings/harness changes. Npm check before code commits; both source reviews, mandatory merger and fresh integrated verify required. Existing approvals persist; no push/PR/deploy/sign-in.
