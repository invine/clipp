# Implement the durable manual reset transition

Type: implementation
**Status:** resolved
Assignee: ux-reset-27
Priority band: 3
**Blocked by:** None.
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

Coordinator records the fresh baseline/claim, accepted decision assessment, isolated worktree, integration revision, checks and Standards/Spec review under [project workflow](../../../docs/agents/workflow.md). Preserve unrelated work.

## Non-native dispatch — 2026-10-15

The user explicitly requested continuing with two implementers on work not blocked by native checks, preserving failed gates and avoiding further harness preparation. This supplies scheduling direction for this independent core package while earlier native-qualified outputs remain incomplete. It changes no behavior, dependency or validation disposition. Tickets17/18/19/20/25/26/34/35 keep every failed/unqualified native gate; dependent storage/runtime/UI reset packages28–31 remain unavailable.

Claim ux-reset-27, baseline37bfe9990fdbcb8bdaa7f67cc991388ee23fcf14 on codex/ux-implementation-integration. One canonical owner, two coordinated source assignments in isolated worktrees: transition/journal/coordinator and core startup/recovery consumer. Both contributions must be integrated and verified together before core27 resolves. No artificial separate source-only ticket or gate waiver is created.

Accepted public test seams are the specified beginIdentityReset/reconcile/resume/dismiss-reminder actions on the existing core transition owner, injected authoritative repository/storage/cleanup/fence ports, and the existing runtime lifecycle/service-start owner. Use owning TDD through these seams, including failure/ambiguous acceptance, one candidate, cleanup/finalization/replay/reminder policy and automatic coexistence. Preserve ADR0004 automatic immediate shutdown/remove-wins/Identity Loss/revoked local-only behavior and ADR0008 key privacy/storage boundaries. Manual accepted recovery seals old local work, uses roll-forward, and requires durable receipt plus replay guard before private journal sanitization. One shared serialization owner; no second router, UI store or transition lock.

No user action is enabled and no host storage adapter/ingress capability is advertised by core-only completion. Actual strict adapters, queues, restart and UI stay with28–31 and their original gates. No native/CUA/SDK/clipboard/global settings/harness changes. Npm check before code commits; both source reviews, mandatory merger and fresh integrated verify required. Existing approvals persist; no push/PR/deploy/sign-in.

## Answer — 2026-10-15

Resolved for the approved core transition and startup/recovery scope. Two isolated implementers co-delivered one canonical claim. Transition commits `bdd17793aabce58d1060cb406a4c42bb425b9dff` and `a18f5599a14c6f219066de0f40c69f74304e3662`, plus startup commit `4cd6fc94fc25f76f636f776712c4122eb799e9f5`, were fast-forward integrated by the mandatory merger on `codex/ux-implementation-integration`. Integrated/reviewed/tested source is `4cd6fc94fc25f76f636f776712c4122eb799e9f5`, tree `b935425152c43502cf8b9afdaabc79e5d4872a50`, clean. Baseline: `2ce3c5f3c1547b9602de4fa618e7a5e2c9e8f078`.

The common owner now supplies typed begin/reconcile/resume/dismiss actions, validated same-candidate durable intent, ambiguous acceptance reconciliation, reversible provisional fencing, accepted roll-forward checkpoints, required receipt/replay metadata before journal sanitization, and explicit reminder policy. Immediate automatic safety, optional notices and automatic recovery semantics remain intact. Independent public snapshots protect policy and lifecycle observers. Core lifecycle prevents cached identity loading, local services and networking during manual recovery; only proven non-acceptance releases provisional suspension, while completed old processes stay sealed pending restart. No host reset capability or UI action is enabled.

TDD source contributions cover the acceptance/failure/replay/reminder/automatic race boundaries and actual core coordinator/lifecycle composition. Both independent Standards and Spec reviews passed with zero findings against the exact integrated tree. Fresh root `npm run verify` using Node 24.16.0 / npm 11.13.0 passed all typechecks, 140 suites / 999 tests, all three production builds and lint with 0 errors / 839 warnings. Source checks and narrower final 89-test union are retained separately; earlier source checks are not relabelled as final integration evidence.

Ignored run artifacts: `ticket27-transition-handoff.md`, `ticket-27-startup-handoff.json`, `ticket-27-merge-receipt.json`, `ticket-27-standards-review.md`, `ticket-27-spec-review.md`, `ticket-27-integrated-verify.log`, and hash-bound `ticket-27-integrated-verification.json` under the run-20261010 artifact root supplied in the coordinator handoff. Source ancestries and unrelated primary/relay work are preserved.

G41 has its core contribution only. Actual host durability, fallback cleanup, writer/native ingress fencing, clipboard baseline, restart and authenticated UI remain with 28–31; the Generate new identity addition remains open. All prior failed/native gates, G14 no alternate host, Chrome G01 no owned public endpoint and recorded deferrals remain unchanged. No native/CUA/SDK/clipboard/global setting or harness work ran in this continuation; no push/PR/deployment/sign-in.
