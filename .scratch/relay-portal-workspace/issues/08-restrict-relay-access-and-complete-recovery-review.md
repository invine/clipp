# 08: Restrict relay access and complete recovery review

Status: resolved
Repository role: relay
Assignee: relay-portal-workspace-20261027-ticket-08
Execution: integrated
Blocked by: 06

**Parent:** [Clipp Relay portal workspace](../spec.md)
**User stories:** 55.

**What to build:** State-appropriate suspend, reactivate, deny, return-to-review, credential-revocation and Recovery Review Hold actions without losing the existing operator controls.

## Acceptance criteria

- [ ] Replace the remaining generic action selection with readable, state-appropriate account-access actions while retaining every existing supported transition and explicit recovery-review operation.
- [ ] Name the target account, effect and reason before access-closing confirmations. A Recovery Review Hold remains distinct from canonical status and can only be cleared through the existing explicit status/quota review contract.
- [ ] Keep account and Login Grant/Relay Session consequences exactly as enforced by the service. Successful invalidation remains logically acknowledged before success; physical closure can follow asynchronously.
- [ ] Revalidate authoritative allowlist, recent authentication, reason, Origin/CSRF, current revision and server-side state eligibility for every write. Browser visibility or stale form selection is never authority.
- [ ] Retain safe conflict, denied, expired-authentication and uncertain-outcome recovery through the existing operations, including a working no-script confirmation path.
- [ ] Exercise real transition/revocation/recovery-hold behavior and refusal/concurrency cases through the accepted HTTP/database seam; verify that the revised controls remain reachable and explained at all three browser widths.

## Validation and boundaries

Every slice lands with functioning real handler-to-UI behavior, its own security/correctness checks, responsive browser acceptance and preservation of unchanged capabilities. Ticket 12 is cross-slice cutover and composition, not deferred feature testing.

Production portal HTTP boundary with local identity provider and disposable PostgreSQL, browser acceptance against the same built service, existing helper tests for arithmetic edge cases.

Use the selected Workspace A references and the parent specification. Preserve existing domain and authorization invariants, including ADR-0012; the prototype is design evidence, not the application. Existing working capabilities remain available until their complete replacements land.

## Blocking rationale

Requires the selected-account detail and retained existing operations from 06; quota-form redesign in 07 is not a prerequisite.

## Comments

- 2026-10-26 — Published after the user approved the twelve-ticket breakdown and these blockers. Publication only; the user explicitly instructed: “don’t start implementation.”
- 2026-10-27 — Claimed by `/root/ticket_08` on branch `codex/relay-portal-workspace-08`, worktree `/private/tmp/clipp-relay-portal-08`, baseline integration `a806121` (ticket06 predecessor resolved).
- 2026-10-27 — Integrated at `b41822e556303ba8e2048b62214148a9ce8cd2d5` (tree `672fa65d75145be994c1bc666647f893df3adb78`). Routine profile passed; focused PG18 state-specific access/Recovery Review Hold tests and final built-service browser acceptance passed at 1440/768/390. Evidence `/private/tmp/clipp-relay-portal-ticket08-browser-evidence/acceptance.json`, logs `/private/tmp/clipp-relay-ticket08-routine-elevated.log` and `/private/tmp/clipp-relay-ticket08-acceptance-final-3width.log`. Focused integration tests, build, vet, syntax and diff checks passed.
