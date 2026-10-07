# 04: Verify relay locally and in CI

**What to build:** Run the relay's existing Go, chart and operator fixture checks through one local verification command and routine CI without entering the image publication flow.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

Repository scope: clipp-relay; canonical claim remains in Clipp. Parent: [agent workflow specification](../spec.md). Covers AC4 and AC9, retrospective improvement 3. Test boundaries and ticket graph approved 2026-10-07; implementation has not started.

## Acceptance criteria

- [ ] Routine verification runs failing-on-diff Go formatting, dependency verification, tests, vet and build, and every existing deterministic suite enumerated in the planning inventory.
- [ ] Reuse the current script bodies and fixture seams; provision/document compatible Go, Helm, Python, Ruby and shell requirements. Race checks have a supported CI job or explicit verification profile with a distinct result.
- [ ] A verification-only workflow runs for ordinary pull requests and main-branch changes with read-only permissions, invokes the same entry point and requires no registry write credentials, kubeconfig, OCI identity or live OAuth account.
- [ ] Preserve the existing separately authorized manual image publication workflow. Routine verification cannot publish an image or deploy resources.
- [ ] Missing prerequisites and failed constituent checks fail with actionable diagnostics. Run actual suites locally and prove failure propagation at the public command boundary.
- [ ] Validate workflow configuration and record tool versions/results against the candidate revision. Hosted CI execution is explicitly not run until an authorized push.
- [ ] Real PostgreSQL/image execution, provider qualification and live cluster checks retain their separate gates; deterministic contract checks do not claim those passes. Connect the entry point to project navigation when available.

## Implementation context

Use the [verification inventory](../README.md#routine-verification-inventory). The existing manually dispatched workflow already has Go/image checks; it does not provide routine PR verification or run the entire chart/operator inventory. Do not duplicate publication credentials or its protected-environment dependency into the new routine path. This ticket needs no other feature ticket to begin.

## Comments

- Planning publication only; no claim or implementation evidence yet.
