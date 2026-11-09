# 10: Authorize or cancel a registered Clipp app

Status: resolved
Repository role: relay
Assignee: relay-portal-workspace-20261027-ticket-10
Execution: integrated
Blocked by: 01

**Parent:** [Clipp Relay portal workspace](../spec.md)
**User stories:** 65, 66, 67.

**What to build:** Compact consent that identifies the actual app, account and relay, with real authorization and a safe one-use Cancel operation.

## Acceptance criteria

- [ ] Display the verified registered public-client type in the heading and action, and the authenticated verified presentation email and configured relay host from trusted view data.
- [ ] Explain relay permission within the saved account allowance without implying Device Identity binding or Device Network membership changes.
- [ ] Preserve the existing authorization flow and add Cancel through the native issuer error-response mechanism, returning access_denied and the original state only to its validated callback.
- [ ] Cancel consumes only a valid current one-use continuation after Portal Session, Origin/CSRF, account, browser binding, generation and expiry checks. It issues no code, Login Grant or Relay Access Token.
- [ ] Refuse replay, expired/mismatched/consumed flows and invalid callback destinations safely. In an authorize/cancel race only the first valid consumed operation succeeds; cancellation cannot undo an authorization that already won.
- [ ] Keep PKCE, registered callback/CSP policy, continuation bounds and exact client behavior. Do not add an arbitrary query-derived redirect or weaken protection for a visual Cancel button.
- [ ] Extend existing consent one-use, generation and callback-policy HTTP tests for all registered client families, plus the focused browser form, keyboard and no-script authorize/cancel flows. No live Google or native runtime is required.

## Validation and boundaries

Every slice lands with functioning real handler-to-UI behavior, its own security/correctness checks, responsive browser acceptance and preservation of unchanged capabilities. Ticket 12 is cross-slice cutover and composition, not deferred feature testing.

Production portal HTTP boundary with local identity provider and disposable PostgreSQL, browser acceptance against the same built service, existing helper tests for arithmetic edge cases.

Use the selected Workspace A references and the parent specification. Preserve existing domain and authorization invariants, including ADR-0012; the prototype is design evidence, not the application. Existing working capabilities remain available until their complete replacements land.

## Blocking rationale

Uses the settled embedded style tokens and production browser acceptance fixture from 01; it does not wait for account administration or plan maintenance.

## Comments

- 2026-10-26 — Published after the user approved the twelve-ticket breakdown and these blockers. Publication only; the user explicitly instructed: “don’t start implementation.”
- 2026-10-27 — Claimed by `/root/ticket_10` on branch `codex/relay-portal-workspace-10`, worktree `/private/tmp/clipp-relay-portal-10`, based on integration `3c671f11878dc7b014e6aa2f8612c16fc1a9219f`.
- 2026-10-27 — Integrated with the portal acceptance updates at relay integration `8712d26`. The final PG18 + built-service browser acceptance passed in `/private/tmp/clipp-relay-integration-acceptance.log`, with `acceptance.json` and responsive screenshots at `/private/tmp/clipp-relay-portal-ticket09-browser-evidence/`. It verified real client/account/relay identity, authorizing and cancelling callbacks, one-use state behavior, keyboard focus/activation, no-script form submission and 320/390/768/1440 layouts. Focused auth/persistence/portal tests, scoped vet, full build and diff checks passed.
