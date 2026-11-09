# 06: Find and open Relay Account reviews

Status: resolved
Repository role: relay
Assignee: relay-portal-workspace-20261026-ticket-06
Execution: integrated
Blocked by: 01

**Parent:** [Clipp Relay portal workspace](../spec.md)
**User stories:** 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51.

**What to build:** An administrator account list with global search/status filtering, bounded pages, reliable plan names, desktop selection and a focused phone review view.

## Acceptance criteria

- [ ] Enforce current Administrator Identity authority for the view and show administration navigation only when authorized. Keep the nonsecret applied allowlist revision available.
- [ ] Default to All accounts, show a clearly scoped service-wide pending-review finding, and provide Needs review and Suspended filters while keeping all canonical statuses reachable.
- [ ] Apply bounded literal case-insensitive email matching and status selection before pagination over the full eligible dataset. Escape output and parameterize input; punctuation is literal, not a wildcard.
- [ ] Keep a deterministic traversal, validated page limits and scopes, correctly labelled filtered/service-wide counts, empty-result feedback and clear-filter recovery. Reset incompatible cursors when the scope changes.
- [ ] Resolve assigned Quota Plan names and saved effective quota information independently of the current library page, including archived/off-page plans.
- [ ] On desktop, place the selected account beside the list. On phones, keep Review visible and make explicit selection a primary detail view with Back retaining validated list context; initial automatic desktop selection does not hide the mobile list.
- [ ] Preserve working existing action forms and mutations in the detail view until their action-specific replacements land. No capability is removed by this list/navigation slice.
- [ ] Use the existing read-view/HTTP boundary and built-service browser fixture. Seed enough accounts/plans to cross pages; verify off-page matches and selections, role denial, count scopes, mobile action reachability and Back behavior.

## Validation and boundaries

Every slice lands with functioning real handler-to-UI behavior, its own security/correctness checks, responsive browser acceptance and preservation of unchanged capabilities. Ticket 12 is cross-slice cutover and composition, not deferred feature testing.

Production portal HTTP boundary with local identity provider and disposable PostgreSQL, browser acceptance against the same built service, existing helper tests for arithmetic edge cases.

Use the selected Workspace A references and the parent specification. Preserve existing domain and authorization invariants, including ADR-0012; the prototype is design evidence, not the application. Existing working capabilities remain available until their complete replacements land.

## Blocking rationale

Uses the shell, role-aware navigation and common browser acceptance fixture from 01.

## Comments

- 2026-10-26 — Published after the user approved the twelve-ticket breakdown and these blockers. Publication only; the user explicitly instructed: “don’t start implementation.”
- 2026-10-26 — Claimed by coordinator after predecessor 01 resolved at relay integration `d9e02399de073e205474b8773bc7e9d1ad56f2ed`. Decision assessment: adds bounded administrator list/read-view behavior while preserving current allowlist, recent-authentication, revision and mutation guards; existing action forms remain available.
- 2026-10-26 — Resolved by the coordinator after the account-review feature fast-forwarded into relay integration at `7bdea8780d1e6f9ecdd7853a0dc7b54df86811ab` (source feature commit `bb2d42c5c13cef3b733f6cab8c64445591a438bc`); it includes integration tip `4ab61238453dc12592db40100ed78e320b82694b`. PG18 and browser evidence is in `/private/tmp/clipp-relay-portal-browser-ticket06-evidence/acceptance.json` and adjacent screenshots. Details are in [the run record](../run.md).
