# 04: Verify relay locally and in CI

**What to build:** Run the relay's existing Go, chart and operator fixture checks through one local verification command and routine CI without entering the image publication flow.

**Blocked by:** None (can start immediately).

**Status:** resolved

Repository scope: clipp-relay; canonical claim remains in Clipp. Parent: [agent workflow specification](../spec.md). Covers AC4 and AC9, retrospective improvement 3. Test boundaries and ticket graph approved 2026-10-07; implementation has not started.

## Acceptance criteria

- [x] Routine verification runs failing-on-diff Go formatting, dependency verification, tests, vet and build, and every existing deterministic suite enumerated in the planning inventory.
- [x] Reuse the current script bodies and fixture seams; provision/document compatible Go, Helm, Python, Ruby and shell requirements. Race checks have a supported CI job or explicit verification profile with a distinct result.
- [x] A verification-only workflow runs for ordinary pull requests and main-branch changes with read-only permissions, invokes the same entry point and requires no registry write credentials, kubeconfig, OCI identity or live OAuth account.
- [x] Preserve the existing separately authorized manual image publication workflow. Routine verification cannot publish an image or deploy resources.
- [x] Missing prerequisites and failed constituent checks fail with actionable diagnostics. Run actual suites locally and prove failure propagation at the public command boundary.
- [x] Validate workflow configuration and record tool versions/results against the candidate revision. Hosted CI execution is explicitly not run until an authorized push.
- [x] Real PostgreSQL/image execution, provider qualification and live cluster checks retain their separate gates; deterministic contract checks do not claim those passes. Connect the entry point to project navigation when available.

## Implementation context

Use the [verification inventory](../README.md#routine-verification-inventory). The existing manually dispatched workflow already has Go/image checks; it does not provide routine PR verification or run the entire chart/operator inventory. Do not duplicate publication credentials or its protected-environment dependency into the new routine path. This ticket needs no other feature ticket to begin.

## Comments

- Planning publication only; no claim or implementation evidence yet.

## Coordinator dispatch — 2026-10-07

Owner: verification-04; coordinator: agent-workflow-20261007.

Requested outcome and invariant assessment: Expose existing deterministic relay checks through local/CI verification. Preserve accepted single-session admission and the manual publication boundary. No product or infrastructure policy change; ADR 0012 remains unchanged.

Decision reference: [accepted fallback ADR](../../../docs/adr/0012-relay-transport-fallback-and-concurrent-sessions.md). Test seams: approved public CLI/subprocess and navigation boundaries in the parent specification.

Integration branches: `codex/agent-workflow-integration` in each participating repository. Local preparation only; maximum two implementers. Coordinator owns claim, integration and resolution.

## Answer

Implemented and integrated relay routine/race verification at `65fad9d3ce2a1117022fca751bd58b0bc54b8502` (source equals integrated revision). Actual routine and race profiles passed on that exact clean commit; all eleven inventoried deterministic suites and eleven new public command/CI fixtures passed. Merger rechecked public fixtures, shell syntax and scope after integration. Focused Standards/Spec assessment has no outstanding findings; whole-effort review remains the coordinator's final gate.

[Run evidence index](../run.md#dispatch-and-evidence): local artifacts `relay-04-evidence.md` and `relay-04-integration-evidence.md`, with command logs alongside. Tools include Go 1.27.1, Helm 4.3.0, Python 3.14.8, Ruby 2.6.10 and jq 1.8.2. CI configuration is locally validated; hosted execution, real PostgreSQL/images and native/live qualification are not run. No publication workflow or product behavior changed.
