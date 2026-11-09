# 11: Recover failed portal requests without misleading actions

Status: resolved
Repository role: relay
Assignee: relay-portal-workspace-20261026-ticket-11
Execution: integrated
Blocked by: 01

**Parent:** [Clipp Relay portal workspace](../spec.md)
**User stories:** 68, 69.

**What to build:** Task-sized setup and failure pages whose recovery action matches the actual failure while preserving statuses and fail-closed uncertainty.

## Acceptance criteria

- [ ] Apply the compact A message presentation to service setup, expired sign-in, forbidden action, missing page, conflict, rate limiting, service unavailability and uncertain account results.
- [ ] A conflict reloads the affected object; an expired sign-in reauthenticates; rate limits preserve authoritative retry hints; no state offers an unrelated sign-in loop or arbitrary return URL.
- [ ] Keep HTTP status, safe destinations, response headers, authority checks and access-closing uncertainty intact. Never show a success toast for an unconfirmed saved result or blindly retry a POST.
- [ ] Provide usable safe read-only recovery links without JavaScript and honest task-sized sparse content. Specific plan-creation retry identity stays owned by the plan-maintenance slice; deletion lifecycle stays owned by the deletion slice.
- [ ] Check these responses through the real HTTP boundary and built-service browser views at the accepted widths, including focus, readable text and no page overflow. Existing per-feature mutation/conflict tests remain required in their own slices.

## Validation and boundaries

Every slice lands with functioning real handler-to-UI behavior, its own security/correctness checks, responsive browser acceptance and preservation of unchanged capabilities. Ticket 12 is cross-slice cutover and composition, not deferred feature testing.

Production portal HTTP boundary with local identity provider and disposable PostgreSQL, browser acceptance against the same built service, existing helper tests for arithmetic edge cases.

Use the selected Workspace A references and the parent specification. Preserve existing domain and authorization invariants, including ADR-0012; the prototype is design evidence, not the application. Existing working capabilities remain available until their complete replacements land.

## Blocking rationale

Uses the settled shared presentation and authenticated application fixture from 01; it can validate existing failure operations independently of their later UI migrations.

## Comments

- 2026-10-26 — Published after the user approved the twelve-ticket breakdown and these blockers. Publication only; the user explicitly instructed: “don’t start implementation.”
- 2026-10-26 — Claimed by coordinator after predecessor 01 resolved at relay integration `b7534241d6df5da07090cac1ba7bb197926fd278`. Decision assessment: preserves existing HTTP statuses, fail-closed uncertainty, safe return targets and authorization decisions; changes only the message and recovery presentation/actions.
- 2026-10-27 — Integrated into `codex/relay-portal-workspace-integration` at `a60bfc3def74e0b1ca57d688447747a7ea3e43d0` (integration tree `13d1fdd392b729cff92e88711d516a84bbb4c9f7`). Focused PG18 schema/security integration and built-service OIDC/browser acceptance passed; portal, auth and diagnostic Go tests and `git diff --check` passed. Browser evidence: `/private/tmp/clipp-relay-portal-ticket11-browser-evidence/`. Broad auth/relay test attempt had host-load timing flakes outside ticket 11; it is not claimed as passing.
