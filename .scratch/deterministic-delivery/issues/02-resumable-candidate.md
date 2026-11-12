# 02: Prepare and verify a resumable isolated candidate

**What to build:** A caller can run a saved plan through isolated preparation and common local verification, interrupt it, inspect durable status and resume without changing the candidate or repeating valid work. Platform delivery remains incomplete until its adapter is available.

**Blocked by:** 01.

**Status:** resolved

**Specification coverage:** Command interface; Source selection and candidate identity; Run lifecycle; Verification contract; Artifacts and records; Resumption and concurrency; Architecture and reuse.

**Acceptance scenarios:** A02; A03 (resume); A04 (common prerequisites); A05 (common gates); A13 (integrity); A14 (run ownership); A15 (status/replay); A16; A17; A18.

- [ ] Running a plan creates one associated run; running the same plan or its run ID resumes that run. Source, tool and configuration identities remain fixed, including after remote main advances.
- [ ] Preparation uses an isolated committed checkout with its own dependency installation, validates the declared Mac toolchain/storage/output prerequisites, and preserves the primary checkout, index, edits, pre-existing worktrees and installations.
- [ ] Common verification runs locally through existing lint, typecheck, Jest, candidate-tooling, production-compilation and dedicated shared UI behavior commands. A failed, missing, skipped or empty required result cannot admit a dependent stage; green hosted CI is not a substitute.
- [ ] Successful production outputs are inventoried for downstream reuse rather than rebuilt merely to enter packaging. Unexpected source mutations fail the candidate; source-adapter incompatibility is an explicit prerequisite failure.
- [ ] Durable atomic records preserve stage states, attempts, exact inputs, commands/check IDs, times, environment/tool identities, cleanup outcomes and evidence references. Corrupt records, unsupported schemas and mismatched identities are rejected.
- [ ] Resume revalidates evidence and artifact inputs before reuse, preserves failed attempts, rejects tampering/missing outputs, and handles partial builds only in owned temporary output. Signing or repackaging is represented as a successor artifact.
- [ ] Exclusive run ownership survives competing processes and interruption. Lock recovery proves the prior owner stopped and reconciles unfinished operations instead of assuming expiry means permission; provide reusable ownership behavior for platform adapters without performing a delivery here.
- [ ] Read-only status reports recorded progress, observation times, blocked/failed/uncertain stages and next actions in human/JSON form without contacting destinations, retrieving credentials or mutating the run. Execution uses stable result codes and distinguishes successful status queries from unsuccessful delivery.
- [ ] Reuse existing source/candidate/evidence behavior where suitable, preserving native isolation and budgets. Private logs and shareable summaries protect secret values; retained receipts/artifacts survive cleanup of only run-owned temporary resources.
- [ ] Public-interface tests cover interruption, concurrent invocation, source/profile changes, invalid records, changed artifacts, failed checks and cleanup ownership. A real Mac run supplies common preparation/verification evidence without marking an unimplemented target complete.

## Comments

Published on 2026-11-10 with the approved breakdown. Implementation was deferred at publication.

Claimed on 2026-11-10 by the deterministic-delivery coordinator for the ticket-02 implementer. Baseline: client `2b493c8ab0b996b72270f218da38b20756c67c95`; integration: `codex/deterministic-delivery-integration`; ticket: `codex/deterministic-delivery-02`. The user's implementation request supersedes the prior deferral.

Resolved on 2026-11-10 at client integration `d3afb218b1e6d51cd19ad0dcf1dfe0866fd31b08` after reviewed fixes for run-record checkout containment, output preflight, generated-test output accounting and two stale UI test navigation assumptions. Full `npm run check` passed. A fresh isolated Mac run on this exact commit passed all nine common checks: Jest 1695 cases, candidate tooling 133, delivery tooling 24, three production builds and shared UI behavior 68. Replay retained nine attempts. The run correctly reports `delivery_incomplete` because platform adapters are pending; no destination was changed.
