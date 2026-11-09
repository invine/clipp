# 01: Read Relay Account capacity in Workspace A

Status: resolved
Repository role: relay
Assignee: relay-portal-workspace-20261026-ticket-01
Execution: integrated
Blocked by: None (can start immediately)

**Parent:** [Clipp Relay portal workspace](../spec.md)
**User stories:** 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 20, 26, 27, 28, 29, 30.

**What to build:** A working account overview with the selected shell, real allowance and capacity, restricted-account states, folded phone navigation and a reusable browser fixture around the built service.

## Acceptance criteria

- [ ] Serve the selected Workspace A account view using real authenticated handler data, embedded assets and the existing template stack; introduce shared layout/tokens without breaking unmigrated portal surfaces.
- [ ] Lead with remaining allowance, Recorded Relay Usage against effective allowance, the authoritative UTC Weekly Quota Window/reset, Relay Sessions and Login Grants. Put the week in the allowance area on phones.
- [ ] Preserve exact recorded totals for zero allowance and overruns; remaining allowance and available slots are nonnegative without hiding above-limit observations. Known zero and independently unavailable capacity samples remain different.
- [ ] Render Pending, Suspended, Denied, first-run and Recovery Review Hold states honestly; an Active label or capacity count never claims Device Network membership or connectivity. First registration may retain current-week consumption.
- [ ] Provide read-only state refresh and an accessible accounting explanation with truthful confirmation-lag language; omit unsupported sampled timestamps.
- [ ] Apply the A type, color, spacing and focus rules to this view, keep real links to currently available areas, and fold navigation at tablet/phone widths. Do not expose unfinished destinations or remove old controls before their replacements land.
- [ ] Reuse the existing production HTTP handler, local identity-provider and disposable PostgreSQL fixtures. Add only the minimal launcher needed to exercise that same built application in a browser, without a public test-login endpoint or UI-only account store.
- [ ] Verify the delivered account cases through HTTP and the built browser view at 1440, 768 and 390 pixels, including keyboard/menu behavior, 320px reflow, enlarged text and no-script account facts. Preserve the accepted relay/accounting/authorization invariants.

## Validation and boundaries

Every slice lands with functioning real handler-to-UI behavior, its own security/correctness checks, responsive browser acceptance and preservation of unchanged capabilities. Ticket 12 is cross-slice cutover and composition, not deferred feature testing.

Production portal HTTP boundary with local identity provider and disposable PostgreSQL, browser acceptance against the same built service, existing helper tests for arithmetic edge cases.

Use the selected Workspace A references and the parent specification. Preserve existing domain and authorization invariants, including ADR-0012; the prototype is design evidence, not the application. Existing working capabilities remain available until their complete replacements land.

## Blocking rationale

No new prefactor is needed before a complete read-only account slice; the existing embedded templates and HTTP integration seam are reusable.

## Comments

- 2026-10-26 — Published after the user approved the twelve-ticket breakdown and these blockers. Publication only; the user explicitly instructed: “don’t start implementation.”
- 2026-10-26 — Claimed by coordinator for implementation after the user's direct request to implement `backlog.md`. Run record: [relay portal workspace implementation](../run.md). Decision assessment: preserves ADR-0012 and the existing account, authorization, session and accounting invariants; proceed within the accepted variant A and confirmed production HTTP/PostgreSQL/browser seams.
- 2026-10-26 — Resolved by the coordinator after integration at relay `d9e02399de073e205474b8773bc7e9d1ad56f2ed`, focused integrated package tests/vet/build passed, and review found no outstanding ticket-01 issue. Source commits `79ada1602a5168876b4fc9df4f3fe86af28eaa87` and `1753792a53ede4081faacc2c17e8a93fbc4859ca` are integrated with the same tree. PG18 and browser acceptance evidence: `/private/tmp/clipp-relay-portal-browser-evidence/acceptance.json` and adjacent screenshots. Details are in [the run record](../run.md).
