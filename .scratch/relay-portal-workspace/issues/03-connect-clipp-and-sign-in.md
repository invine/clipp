# 03: Connect Clipp and sign in from a compact entry page

Status: resolved
Repository role: relay
Assignee: relay-portal-workspace-20261026-ticket-03
Execution: integrated
Blocked by: 01

**Parent:** [Clipp Relay portal workspace](../spec.md)
**User stories:** 21, 22, 23, 24, 25, 31, 32.

**What to build:** A first-screen Connect Clipp action, reliable discovery URL copying and setup help, plus the compact signed-out Google sign-in page.

## Acceptance criteria

- [ ] Connect Clipp from the account header reaches the actual canonical Relay Discovery Endpoint and current client setup instructions; a compact connection panel sits near history on desktop.
- [ ] Announce copy success only after clipboard success. A denied or unavailable Clipboard API leaves a readable selectable URL and a manual-copy path.
- [ ] Keep instructions reachable by keyboard and without scripting, and explain the distinction between a Portal Session and each app authorization. Never expose credentials or claim connection success from copying.
- [ ] Serve the compact signed-out Google sign-in view with the relay purpose, approval requirement and setup help for already approved visitors. Wire sign-in to the existing real continuation rather than the prototype simulation.
- [ ] Keep setup usable for restricted accounts while accurately explaining that approval or restoration is still required; an ordinary browser discovery error is not treated as failed setup.
- [ ] Check HTTP sign-in/continuation compatibility and browser entry, setup disclosure, focus, clipboard success/refusal and mobile reachability at the accepted widths. Preserve CSP and no-script navigation.

## Validation and boundaries

Every slice lands with functioning real handler-to-UI behavior, its own security/correctness checks, responsive browser acceptance and preservation of unchanged capabilities. Ticket 12 is cross-slice cutover and composition, not deferred feature testing.

Production portal HTTP boundary with local identity provider and disposable PostgreSQL, browser acceptance against the same built service, existing helper tests for arithmetic edge cases.

Use the selected Workspace A references and the parent specification. Preserve existing domain and authorization invariants, including ADR-0012; the prototype is design evidence, not the application. Existing working capabilities remain available until their complete replacements land.

## Blocking rationale

Hooks into the first-screen account action and A entry presentation introduced by 01.

## Comments

- 2026-10-26 — Published after the user approved the twelve-ticket breakdown and these blockers. Publication only; the user explicitly instructed: “don’t start implementation.”
- 2026-10-27 — Integrated at `91b7e0b` (tree `c34570bb47676a5a9ec8e7fbb845bc4583e333d3`). Focused portal/auth tests, diff checks, and the PG18 built-service OIDC/browser acceptance passed, including copy success/refusal, native Space activation, signed-out setup guidance and 1440/768/390/320 reflow. Evidence: `/private/tmp/clipp-relay-portal-ticket03-browser-evidence/`.
- 2026-10-27 — Claimed after predecessor 01 resolved. Branch `codex/relay-portal-workspace-03`, worktree `/private/tmp/clipp-relay-portal-03`, based on relay integration `13d1fdd392b729cff92e88711d516a84bbb4c9f7`. Feature commit `b435ff8`; merged latest integration `939f394` into the ticket branch before handoff. Focused auth/portal package tests and PG18 built-service browser acceptance passed; evidence `/private/tmp/clipp-relay-portal-ticket03-browser-evidence/`. Integration and final resolution remain coordinator-owned.
