# 03: Verify Clipp locally and in CI

**What to build:** Give contributors one routine verification command whose checks also run for pull requests and main-branch changes, including the lint coverage missing from the current commit path.

**Blocked by:** None (can start immediately).

**Status:** resolved

Repository scope: Clipp. Parent: [agent workflow specification](../spec.md). Covers AC3 and AC9, retrospective improvement 3. Test boundaries and ticket graph approved 2026-10-07; implementation and validation are recorded below.

## Acceptance criteria

- [x] One documented routine entry point reuses existing ESLint, all shared/runtime typechecks, Jest and production builds for Electron, Android web assets and Chrome; avoid running the same suite twice inside that entry point.
- [x] Pre-commit retains formatting and existing checks and gains ESLint coverage. Native/device/live checks are not added to every commit.
- [x] A verification-only workflow runs on ordinary pull requests and main-branch changes using that entry point with read-only permissions and compatible Node/npm tooling. It needs no live account, cluster, registry credentials or protected publication environment.
- [x] Every constituent failure and missing required tool yields a nonzero result naming the failed check. Existing failures are fixed or reported explicitly without weakening rules or silently skipping gates.
- [x] Execute the real verification command locally and demonstrate failure propagation through a narrow subprocess fixture or controlled failing input. Validate workflow events, permissions and command wiring.
- [x] Document the coverage boundary: compilation does not establish native packaging, signed installation, browser login, device instrumentation or forced live relay transfer. Preserve their existing separate acceptance procedures.
- [x] Record local command/tool results against the candidate revision and label hosted CI execution not run under the no-push constraint. Add the command to the project operations entry point when available.

## Implementation context

Use the [verification inventory](../README.md#routine-verification-inventory). Existing client check already runs typechecks and Jest; reuse it. This ticket can start independently of navigation/workflow documentation. Coordinate any shared documentation edit during integration. Limit changes to verification wiring and necessary verified fixes; broader product defects become explicit blockers or separate work.

## Comments

- Planning publication only; no claim or implementation evidence yet.

## Coordinator dispatch — 2026-10-07

Owner: verification-03; coordinator: agent-workflow-20261007.

Requested outcome: one client routine verification command, matching read-only CI, and lint coverage in pre-commit. Invariant assessment: preserve all current checks and runtime acceptance gates; accepted ADR 0012 and product behavior remain unchanged. Necessary harness lint repair must preserve cleanup and primary failure reporting. No new architectural decision is required.

Decision reference: [accepted fallback ADR](../../../docs/adr/0012-relay-transport-fallback-and-concurrent-sessions.md). Approved seams: public verification/subprocess commands, real current suites and CI/hook wiring, per parent specification.

Client integration branch: `codex/agent-workflow-integration`; isolated `codex/agent-workflow-03` starts at `d929abf`. Coordinator owns claims/resolution. Local commits only; maximum two active implementers.

## Answer

Implemented `npm run verify`, pre-commit ESLint coverage and read-only PR/main CI using the same public command. Production compilation for Electron, Android web and Chrome follows existing lint/check exactly once. The harness lint repair retains controller/node cleanup while preserving a primary failure.

Source equals integrated client `181606d0c2b32e494f6a07acf87f0307ea6fa0af`. Actual exact-candidate verification passed: Node 24.16.0/npm 11.13.0, zero lint errors (624 existing warnings), all typechecks, 78 suites/671 tests and all three builds. Eleven public command/hook/semantic CI fixtures passed; post-integration combined tooling tests (17), 55 maintained links and five walkthroughs passed. Focused Standards/Spec scope assessments have no outstanding findings; final effort review remains required.

[Verification contract](../../../docs/agents/verification.md) and [evidence index](../run.md#dispatch-and-evidence): local artifacts `client-03-handoff.md`, `client-03-handoff-candidate-verify.log` and `ticket-03-integration-receipt.json`. Hosted CI/native packaging/signed installation/browser login/device instrumentation/forced live transfers remain not run.

Final whole-effort acceptance: [review record](../review.md); exact current revisions and artifact availability are checked by the durable local ledger, rather than treating earlier receipts as current checkout truth.
