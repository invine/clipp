# Agent workflow implementation map

## Notes

[Specification](spec.md) and [canonical tickets](README.md#tickets-and-dependencies) define this effort across client and relay repository roles. Ticket Status and Blocked by fields own lifecycle and eligibility. [Run record](run.md) records the locally approved baselines and preservation scope.

## Decisions-so-far

- The operator's approved five-ticket graph and CLI/Git/subprocess test boundaries are recorded in the [specification](spec.md#testing-decisions).
- Accepted [ADR 0012](../../docs/adr/0012-relay-transport-fallback-and-concurrent-sessions.md) governs fallback; this tooling effort preserves Relay Session policy.

- [04 resolved](issues/04-verify-relay-locally-and-in-ci.md#answer): relay verification integrated and exact-candidate routine/race passed; external acceptance remains separate.

- [01 resolved](issues/01-find-authoritative-project-operations.md#answer): navigation and bounded lookup integrated in both repositories, enabling the decision checkpoint.

- [02 resolved](issues/02-apply-architectural-decision-checkpoint.md#answer): accepted-decision checkpoint and coordinator lifecycle integrated, enabling ledger/status recovery.

- [03 resolved](issues/03-verify-clipp-locally-and-in-ci.md#answer): client routine verification and commit lint coverage integrated; actual lint/type/test/build checks passed.

- [05 resolved](issues/05-resume-centrally-coordinated-work.md#answer): versioned ledger/status and recovery demonstration integrated; all independent review findings corrected.
- [Whole-effort review](review.md): Standards and Spec pass at the code checkpoint; final current metadata/evidence are reconciled locally after the closure commit.

## Fog

Hosted CI, live/native runtime acceptance, publication and deployment remain outside this local-only implementation run. Tooling completion must retain their independent gates and the managed-relay backlog's existing outcomes.
