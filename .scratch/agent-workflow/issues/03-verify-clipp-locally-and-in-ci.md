# 03: Verify Clipp locally and in CI

**What to build:** Give contributors one routine verification command whose checks also run for pull requests and main-branch changes, including the lint coverage missing from the current commit path.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

Repository scope: Clipp. Parent: [agent workflow specification](../spec.md). Covers AC3 and AC9, retrospective improvement 3. Test boundaries and ticket graph approved 2026-10-07; implementation has not started.

## Acceptance criteria

- [ ] One documented routine entry point reuses existing ESLint, all shared/runtime typechecks, Jest and production builds for Electron, Android web assets and Chrome; avoid running the same suite twice inside that entry point.
- [ ] Pre-commit retains formatting and existing checks and gains ESLint coverage. Native/device/live checks are not added to every commit.
- [ ] A verification-only workflow runs on ordinary pull requests and main-branch changes using that entry point with read-only permissions and compatible Node/npm tooling. It needs no live account, cluster, registry credentials or protected publication environment.
- [ ] Every constituent failure and missing required tool yields a nonzero result naming the failed check. Existing failures are fixed or reported explicitly without weakening rules or silently skipping gates.
- [ ] Execute the real verification command locally and demonstrate failure propagation through a narrow subprocess fixture or controlled failing input. Validate workflow events, permissions and command wiring.
- [ ] Document the coverage boundary: compilation does not establish native packaging, signed installation, browser login, device instrumentation or forced live relay transfer. Preserve their existing separate acceptance procedures.
- [ ] Record local command/tool results against the candidate revision and label hosted CI execution not run under the no-push constraint. Add the command to the project operations entry point when available.

## Implementation context

Use the [verification inventory](../README.md#routine-verification-inventory). Existing client check already runs typechecks and Jest; reuse it. This ticket can start independently of navigation/workflow documentation. Coordinate any shared documentation edit during integration. Limit changes to verification wiring and necessary verified fixes; broader product defects become explicit blockers or separate work.

## Comments

- Planning publication only; no claim or implementation evidence yet.
