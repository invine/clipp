# 04: Manage Portal Sessions and Account-wide Revocation

Status: resolved
Repository role: relay
Assignee: relay-portal-workspace-20261026-ticket-04
Execution: integrated
Blocked by: 01

**Parent:** [Clipp Relay portal workspace](../spec.md)
**User stories:** 33, 34, 35.

**What to build:** A separate Access & security view with working portal-only logout and a reviewed Sign out everywhere operation.

## Acceptance criteria

- [ ] Add a protected navigable Access & security view in the A shell. Preserve any still-unmigrated deletion control or link until its dedicated slice replaces it.
- [ ] Portal-only logout ends the current Portal Session while keeping Clipp Login Grants and relay access intact, as established by the existing service contract.
- [ ] Sign out everywhere names the account and consequences before confirmation, then performs the existing Account-wide Revocation. Its result honors logical invalidation before success and does not claim physical socket closure has already finished.
- [ ] Use the established mutation endpoint and security checks, with working read-only navigation and a no-script confirmation path that cannot bypass the review.
- [ ] Place identity, grant counts and explanation correctly; do not invent a per-device registry or unsupported individual-grant management.
- [ ] Extend the existing owner-security HTTP scenarios and browser checks for confirmation, focus restoration, logout destination, no-script operation and narrow-screen layout. Test refusals and ambiguous results, not just the successful button click.

## Validation and boundaries

Every slice lands with functioning real handler-to-UI behavior, its own security/correctness checks, responsive browser acceptance and preservation of unchanged capabilities. Ticket 12 is cross-slice cutover and composition, not deferred feature testing.

Production portal HTTP boundary with local identity provider and disposable PostgreSQL, browser acceptance against the same built service, existing helper tests for arithmetic edge cases.

Use the selected Workspace A references and the parent specification. Preserve existing domain and authorization invariants, including ADR-0012; the prototype is design evidence, not the application. Existing working capabilities remain available until their complete replacements land.

## Blocking rationale

Uses the working shell/navigation and same authenticated browser fixture from 01.

## Comments

- 2026-10-26 — Published after the user approved the twelve-ticket breakdown and these blockers. Publication only; the user explicitly instructed: “don’t start implementation.”
- 2026-10-26 — Claimed by coordinator after predecessor 01 resolved at relay integration `b7534241d6df5da07090cac1ba7bb197926fd278`. Decision assessment: preserves the established portal-only logout and Account-wide Revocation contracts, authentication guards and logical-versus-physical session invalidation boundary.
- 2026-10-27 — Integrated with ticket 11 at `939f394215ca18aafce9a437b4c9e05dfc8be519`. Exact PG18 security scenario and combined built-service security/recovery browser acceptance passed; evidence `/private/tmp/clipp-relay-04-browser-evidence/` and `/private/tmp/clipp-relay-portal-ticket11-browser-evidence/`. Ticket branch and integration tree were clean at handoff.
