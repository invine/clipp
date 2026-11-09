# 05: Delete a Relay Account with truthful lifecycle results

Status: resolved
Repository role: relay
Assignee: relay-portal-workspace-20261027-ticket-05
Execution: integrated
Blocked by: 04

**Parent:** [Clipp Relay portal workspace](../spec.md)
**User stories:** 36, 37, 38, 39.

**What to build:** Deliberate account deletion from Access & security, including recent-authentication guidance, pending/completed views and accurate re-registration copy.

## Acceptance criteria

- [ ] Integrate the A deletion control into Access & security with an explicit account-naming confirmation and an equivalent safe no-script path.
- [ ] Preserve recent Google authentication, Origin/CSRF, account generation and existing journal/operation safeguards; guide the owner through required reauthentication without silently replaying deletion.
- [ ] Honor the existing deletion contract through real handlers: pending is not complete, status observation is read-only, and closing the browser does not cancel an admitted operation.
- [ ] Use task-sized pending/completed/error surfaces with their correct HTTP semantics and safe destinations. Preserve uncertainty rather than manufacturing success.
- [ ] Explain that re-registration creates a new Pending Relay Account and may import Retained Quota Usage for the current window; do not promise a fresh allowance or restore the deleted account state.
- [ ] Reuse deletion/journal doubles, disposable database integration and existing lifecycle scenarios, then verify browser confirmation, status links, keyboard focus and responsive rendering. Do not require live OCI resources or a production deletion.

## Validation and boundaries

Every slice lands with functioning real handler-to-UI behavior, its own security/correctness checks, responsive browser acceptance and preservation of unchanged capabilities. Ticket 12 is cross-slice cutover and composition, not deferred feature testing.

Production portal HTTP boundary with local identity provider and disposable PostgreSQL, browser acceptance against the same built service, existing helper tests for arithmetic edge cases.

Use the selected Workspace A references and the parent specification. Preserve existing domain and authorization invariants, including ADR-0012; the prototype is design evidence, not the application. Existing working capabilities remain available until their complete replacements land.

## Blocking rationale

Installs the deletion interaction into the separate Access & security view delivered by 04.

## Comments

- 2026-10-26 — Published after the user approved the twelve-ticket breakdown and these blockers. Publication only; the user explicitly instructed: “don’t start implementation.”
- 2026-10-27 — Claimed after ticket 04 resolved; branch `codex/relay-portal-workspace-05`, worktree `/private/tmp/clipp-relay-portal-05`, base `939f394215ca18aafce9a437b4c9e05dfc8be519`.
- 2026-10-27 — Integrated at `3c671f1` (tree `01b7d273d286f6a6836b63f529b726ad5b22e010`). PG18 deletion lifecycle/stale-auth tests, portal/auth/diagnostic tests, vet/build and diff checks passed. Built-service browser acceptance passed at 1440/768/390/320 with named confirmation, blocked invalid submission, no-script POST pending result and read-only status; evidence `/private/tmp/clipp-relay-portal-ticket05-browser-evidence/`. The later merged-tree rerun collided with another fixture on fixed port 18444; combined runner remains part of final cutover acceptance.
