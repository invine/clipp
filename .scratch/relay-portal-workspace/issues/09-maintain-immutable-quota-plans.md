# 09: Maintain immutable Quota Plans in their own view

Status: resolved
Repository role: relay
Assignee: relay-portal-workspace-20261026-ticket-09
Execution: integrated
Blocked by: 01

**Parent:** [Clipp Relay portal workspace](../spec.md)
**User stories:** 61, 62, 63, 64.

**What to build:** A separate bounded plan library with working plan creation, reviewed archival and safe retry of an uncertain creation.

## Acceptance criteria

- [ ] Provide a separate authorized Quota Plans view with names, weekly allowance, Relay Session limits, availability and bounded stable pagination; existing account-review operations remain reachable during migration.
- [ ] Create plans through the real validated quantity/unit, reason and authority contract. Do not introduce in-place edits or client self-selection.
- [ ] Explain archival before confirmation: no new assignments use the archived plan, and existing saved assignments remain unchanged and correctly presented.
- [ ] Preserve creation operation identity/proof through ambiguous results and retry the same operation; never silently generate a new creation attempt or duplicate plan.
- [ ] Handle zero/large values, invalid fields, archived states, no plans, stale revisions, fresh-authentication requirements and authority changes with safe correction/recovery.
- [ ] Reuse immutable-plan and lost-commit-acknowledgment integration scenarios; verify real forms, confirmation/retry destinations, numeric alignment, keyboard/no-script paths and readable phone plan rows in the built service.

## Validation and boundaries

Every slice lands with functioning real handler-to-UI behavior, its own security/correctness checks, responsive browser acceptance and preservation of unchanged capabilities. Ticket 12 is cross-slice cutover and composition, not deferred feature testing.

Production portal HTTP boundary with local identity provider and disposable PostgreSQL, browser acceptance against the same built service, existing helper tests for arithmetic edge cases.

Use the selected Workspace A references and the parent specification. Preserve existing domain and authorization invariants, including ADR-0012; the prototype is design evidence, not the application. Existing working capabilities remain available until their complete replacements land.

## Blocking rationale

Uses the common A presentation/navigation and browser fixture from 01; account-list redesign and approval forms are not prerequisites.

## Comments

- 2026-10-26 — Published after the user approved the twelve-ticket breakdown and these blockers. Publication only; the user explicitly instructed: “don’t start implementation.”
- 2026-10-27 — Claimed on relay integration `939f394215ca18aafce9a437b4c9e05dfc8be519`; dedicated branch `codex/relay-portal-workspace-09`, worktree `/private/tmp/clipp-relay-portal-09`.
- 2026-10-27 — Integrated into relay `codex/relay-portal-workspace-integration` at `8712d26` (tree `8ceb8a1c4150ed58142208f43a50ccef9fb0ed42`). Final integrated PG18 and built-service browser acceptance passed, including plan create/archive result identity, stale archive/account conflicts, no-script paths and 1440/768/390/320 layouts. Evidence `/private/tmp/clipp-relay-portal-ticket09-browser-evidence/acceptance.json`; persistent runner log `/private/tmp/clipp-relay-integration-acceptance.log`.
