# Agent workflow improvement plan

**Status:** resolved

Canonical tracker for retrospective improvements 1, 3, 5 and 7 across Clipp and clipp-relay. The [specification](spec.md) defines behavior; the five tickets below are the sole claimable tasks. The operator approved the test boundaries and dependency graph on 2026-10-07.

## Tickets and dependencies

| Ticket                                                                                                  | Scope                                           | Blocked by | Delivers                                                                |
| ------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ---------- | ----------------------------------------------------------------------- |
| [01: Find authoritative project operations](issues/01-find-authoritative-project-operations.md)         | Both repositories; lookup tool in Clipp         | None       | Short navigation, corrected current pointers and bounded source lookup  |
| [02: Apply the architectural decision checkpoint](issues/02-apply-architectural-decision-checkpoint.md) | Both repositories; canonical workflow in Clipp  | 01         | A project-specific dispatch/review procedure tied to accepted decisions |
| [03: Verify Clipp locally and in CI](issues/03-verify-clipp-locally-and-in-ci.md)                       | Clipp                                           | None       | Existing lint/check/build commands under one local and CI contract      |
| [04: Verify relay locally and in CI](issues/04-verify-relay-locally-and-in-ci.md)                       | clipp-relay                                     | None       | Existing Go/chart/operator checks under one local and CI contract       |
| [05: Resume centrally coordinated work](issues/05-resume-centrally-coordinated-work.md)                 | Both repositories; coordinator tooling in Clipp | 02         | Ledger, current Git/ticket status, eligible frontier and recovery proof |

Tickets 03 and 04 do not depend on documentation changes: their verification behavior is defined by the spec and existing commands. Ticket 05 uses the ownership and decision lifecycle established by 02. There are no artificial sequencing edges for agent capacity or convenient file ownership.

## Implementation handoff

Invoke `/implement-spec` with this specification and ticket directory. Use at most two concurrent implementation agents, fresh context per ticket and isolated worktrees. The coordinator alone claims/resolves tickets and integrates each result before assigning newly eligible work. Start with 01 and 04 as a suggested pair; other eligible scheduling is valid within the two-agent bound.

Maintain one integration branch in each repository touched, with coordinated revision/evidence records. Do not merge branches belonging to unrelated work. Recheck current tips and dirty state before creating worktrees; retain pre-existing work. A ticket branch must incorporate the relevant current integration tip before handoff without resetting uncommitted files. Require applicable TDD, integration checks and final Standards/Spec review. Local commits only; no PR creation, push, publication or deployment is authorized.

The new tickets do not claim, supersede or resolve the managed-relay qualification backlog. Capacity ticket 33 remains deferred. Existing blocked work is not a reason to stop an unrelated eligible ticket.

## Planning baseline observed 2026-10-07

- Clipp primary checkout: `main` at `9df162a12386ce0d336f793a980c7053e770e1bd`, clean.
- Relay primary checkout: `main` at `e881c62ec271836d46d64081a4e4011d7e488676`, clean.
- Existing worktrees and recovery stashes were not changed. Historical main hashes and claims in earlier handoffs are evidence of earlier runs, not current status.
- Both projects now have `GLOSSARY.md`. Some current Clipp agent pointers still name the former `CONTEXT.md`; ticket 01 corrects current navigation while preserving dated evidence.

## Existing sources to reuse

Clipp sources are relative to this checkout. Relay sources below are repository-relative and should be opened in the explicitly selected companion checkout; do not assume a particular sibling directory or home path.

- [Local tracker](../../docs/agents/issue-tracker.md), [triage labels](../../docs/agents/triage-labels.md), [domain pointers](../../docs/agents/domain.md), [agent guide](../../docs/agent-guide.md), [glossary](../../GLOSSARY.md), and [accepted fallback ADR](../../docs/adr/0012-relay-transport-fallback-and-concurrent-sessions.md).
- [Client scripts](../../package.json), [pre-commit hook](../../.husky/pre-commit), [Electron acceptance](../../docs/electron-relay-acceptance.md), [Android native acceptance](../../docs/android-managed-relay-native-acceptance.md), and [Chrome acceptance](../../apps/extension/README-managed-relays.md).
- Relay: `GLOSSARY.md`, `README.md`, `go.mod`, `docs/operator/README.md`, `docs/install-qualification.md`, `docs/image-build.md` and `.github/workflows/relay-image.yml`.
- Relay canonical existing backlog: `.scratch/managed-relay-implementation/README.md`, `frontier-20261004.md`, `34-single-session-fallback-evidence.md` and the individual issue files in that feature directory.

### Routine verification inventory

The client currently exposes `npm run lint`, `npm run check`, and production builds for the Electron, Android and extension workspaces. `check` already runs shared/runtime typechecks and Jest. The pre-commit hook runs lint-staged formatting and `check`; lint-staged does not currently run ESLint. There is no checked-in client GitHub workflow at the planning baseline.

Relay routine checks to reuse: `go mod verify`, a failing-on-diff `gofmt` check, `go test ./...`, `go vet ./...`, `go build ./...`, plus these existing deterministic suites:

- `scripts/test-image-build.sh`
- `scripts/test-image-smoke.sh`
- `scripts/test-image-index.sh`
- `scripts/test-image-values.sh`
- `scripts/test-chart.sh`
- `scripts/test-chart-bundled.sh`
- `scripts/test-chart-test-network.sh`
- `scripts/test-postgres-init-guard.sh`
- `scripts/test-preflight-image-inputs.sh`
- `scripts/test-isolated-test-chart.py`
- `scripts/test-install-metadata.py`

Inventory each script's prerequisites during implementation. The `test-image-smoke` contract fixture is distinct from building and running a real image. The current image workflow is manually dispatched and includes Go/image checks, but not all chart/operator suites. Routine CI must not require the publication environment's variables or credentials merely to run verification.

Real PostgreSQL smokes, native image execution, browser/runtime fixtures, Android instrumentation, OCI/provider tests and forced live relay transfers retain their separate documented environments and acceptance scope. Record unexecuted profiles as not run. Do not quietly remove a required routine check when its prerequisite is missing.

## Confirmation record

Approved by the operator on 2026-10-07: public CLI/Git-fixture verification boundaries, the five-ticket breakdown, the stated blocking edges and at most two implementation agents. No planning decision remains open. The implementation decisions are synthesized from the selected retrospective improvements and the operator's local-only constraint.
