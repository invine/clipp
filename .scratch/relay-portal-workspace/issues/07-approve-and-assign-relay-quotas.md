# 07: Approve accounts and manage Relay Quota assignments

Status: resolved
Repository role: relay
Assignee: Unassigned
Execution: integrated
Blocked by: 06

**Parent:** [Clipp Relay portal workspace](../spec.md)
**User stories:** 52, 53, 54, 56, 57, 58, 59, 60.

**What to build:** Named approval, replacement-plan and override forms with accurate effect previews, exact quota inputs and conflict recovery.

## Acceptance criteria

- [ ] Pending approval presents assignable plan selection, the chosen weekly allowance and Relay Session limit, an enumerated reason and a named Approve account submission.
- [ ] Provide action-specific replacement-plan and quota-override forms. Submit only relevant fields and keep the applied assignment preview tied to actual plan data.
- [ ] Distinguish clearing an override from an explicit zero and preserve every byte when an unchanged quantity/unit value is reopened and saved, including large or non-round allowances.
- [ ] Handle no assignable plan and archived/off-page assignments correctly. Preserve immutable saved assignments; do not require the new plan-library slice to use existing seeded plans.
- [ ] Keep current revision, Origin/CSRF, recent-authentication, reason, allowlist and server state validation. A stale edit reloads the affected account safely and retains list context; reauthentication does not replay the write.
- [ ] Preserve safe correction inputs on validation failure and report confirmed success versus uncertainty accurately. Do not claim that changing quota resets Recorded Relay Usage.
- [ ] Extend real portal approval, immutable-plan, exact-override, concurrent-policy and refusal scenarios, including count/selection refresh after mutation; verify desktop/mobile form previews, keyboard operation and no-script completion.

## Validation and boundaries

Every slice lands with functioning real handler-to-UI behavior, its own security/correctness checks, responsive browser acceptance and preservation of unchanged capabilities. Ticket 12 is cross-slice cutover and composition, not deferred feature testing.

Production portal HTTP boundary with local identity provider and disposable PostgreSQL, browser acceptance against the same built service, existing helper tests for arithmetic edge cases.

Use the selected Workspace A references and the parent specification. Preserve existing domain and authorization invariants, including ADR-0012; the prototype is design evidence, not the application. Existing working capabilities remain available until their complete replacements land.

## Blocking rationale

Requires the selected-account detail, plan read data and list-return context from 06; new plan-library maintenance is not a prerequisite.

## Comments

- 2026-10-26 — Published after the user approved the twelve-ticket breakdown and these blockers. Publication only; the user explicitly instructed: “don’t start implementation.”
- 2026-10-27 — Integrated at `a806121` (tree `3688e4b4c94961743ffc620e0b5df39c2baeaabf`). PG18 HTTP tests and complete built-service acceptance passed: named approval, selected plan preview, replacement assignment, exact keyboard override (`12345 B`, `0` sessions), clear-to-plan defaults, stale 409 list context and combined responsive/security/deletion flows. Evidence `/private/tmp/clipp-relay-ticket07-browser-evidence/`; durable run log `/private/tmp/clipp-relay-ticket07-browser-only.log`. Routine verification passed on the ticket branch; integration checks and diff passed.
