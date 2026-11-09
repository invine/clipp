# 02: Read recent Recorded Relay Usage on every screen size

Status: resolved
Repository role: relay
Assignee: relay-portal-workspace-20261026-ticket-02
Execution: integrated
Blocked by: 01

**Parent:** [Clipp Relay portal workspace](../spec.md)
**User stories:** 16, 17, 18, 19.

**What to build:** The latest four weeks by default, all thirteen retained weeks on demand, a visible current week on phones and accessible exact totals.

## Acceptance criteria

- [ ] Render the latest four available weekly observations in chronological order by default and allow selection of all retained thirteen without changing the underlying data or retention.
- [ ] Identify the current week as incomplete, with the A green/neutral chart treatment, zero baseline and readable binary-unit scale. Do not invent growth deltas or a completed-week comparison.
- [ ] Make the current week available on a phone without page-wide horizontal scrolling or hover, including when the full range is selected.
- [ ] Provide an accessible table with complete week dates and exact corresponding totals; meaningful history remains available without scripting.
- [ ] Keep zero and missing observations distinct, preserve absolute history after allowance changes, and cover year rollover and large recorded values.
- [ ] Extend existing HTTP/profile-history and high-value formatting/geometry tests, plus responsive browser interaction checks against the built application. Do not assert every SVG coordinate.

## Validation and boundaries

Every slice lands with functioning real handler-to-UI behavior, its own security/correctness checks, responsive browser acceptance and preservation of unchanged capabilities. Ticket 12 is cross-slice cutover and composition, not deferred feature testing.

Production portal HTTP boundary with local identity provider and disposable PostgreSQL, browser acceptance against the same built service, existing helper tests for arithmetic edge cases.

Use the selected Workspace A references and the parent specification. Preserve existing domain and authorization invariants, including ADR-0012; the prototype is design evidence, not the application. Existing working capabilities remain available until their complete replacements land.

## Blocking rationale

Uses the new account overview, A presentation and shared built-service browser fixture from 01.

## Comments

- 2026-10-26 — Published after the user approved the twelve-ticket breakdown and these blockers. Publication only; the user explicitly instructed: “don’t start implementation.”
- 2026-10-26 — Claimed by coordinator after predecessor 01 resolved at relay integration `d9e02399de073e205474b8773bc7e9d1ad56f2ed`. Decision assessment: extends only the rendered history range and presentation; preserves retained observations, UTC windows, and absolute usage semantics.
- 2026-10-26 — Resolved by the coordinator after integration at relay `4ab61238453dc12592db40100ed78e320b82694b`. Source commit `e980d4eaa4f6891c0fb8f7880c7e769a557d7625` is integrated with the same tree. Full-history phone, responsive and no-script evidence is in `/private/tmp/clipp-relay-portal-02-evidence/acceptance.json` and its adjacent screenshots; the PG18 owner-profile test passed. Details are in [the run record](../run.md).
