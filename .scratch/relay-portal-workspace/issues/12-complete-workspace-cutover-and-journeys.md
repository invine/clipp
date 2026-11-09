# 12: Complete Workspace cutover and verify combined journeys

Status: resolved
Repository role: relay
Assignee: relay-portal-workspace-20261027-ticket-12
Execution: integrated
Blocked by: 02, 03, 05, 07, 08, 09, 10, 11

**Parent:** [Clipp Relay portal workspace](../spec.md)
**User stories:** 70, 71, 72, 73, 74.

**What to build:** One coherent production portal with all selected A views connected, temporary legacy UI removed and complete owner/admin journeys proven against the built artifact.

## Acceptance criteria

- [x] Finish navigation and compatibility cutover only after every replacement view and action exists; retain safe handling/redirects for established entry points. Remove temporary legacy presentation and any prototype-only controls or sample data without losing a supported capability.
- [x] Walk the combined local journeys across separate owner and administrator sessions: sign in and prepare setup, review/approve with a saved plan, authorize or cancel the app, inspect account data/history, change a plan/override, restrict/restore/review access, revoke, sign out and exercise deletion pending/completion as appropriate.
- [x] Check links, Back/filter/page context, status/count/plan agreement, real mutation results and expected authority boundaries after crossing views. Fix integration defects rather than changing or duplicating the domain contracts.
- [x] Complete keyboard, semantic naming, focus restoration, announcements, 320px reflow, enlarged-text, reduced-motion and no-script acceptance across the joined views. Each earlier slice remains responsible for its own feature-level accessibility and tests.
- [x] Capture all final built-service account/list/detail/plan/security/sign-in/consent/restricted/error/retry/deletion states at 1440×900, 768×1024 and 390×844. Require zero app-inspector FAIL findings, inspect the images and explain retained warnings by actual impact without hiding content or inventing records.
- [x] Run and record the relay routine profile, the required local PostgreSQL 17/18 integration/smoke executions and race checks applicable to changed shared state, with source revision and skipped checks explicit. Static prototype checks do not establish application acceptance.
- [x] Complete Standards and Spec review of the integrated result and record any remaining acceptance boundary. Do not publish, deploy, mutate live infrastructure, require live OAuth accounts or start native client/forced-transfer qualification.

## Validation and boundaries

Every slice lands with functioning real handler-to-UI behavior, its own security/correctness checks, responsive browser acceptance and preservation of unchanged capabilities. Ticket 12 is cross-slice cutover and composition, not deferred feature testing.

Production portal HTTP boundary with local identity provider and disposable PostgreSQL, browser acceptance against the same built service, existing helper tests for arithmetic edge cases.

Use the selected Workspace A references and the parent specification. Preserve existing domain and authorization invariants, including ADR-0012; the prototype is design evidence, not the application. Existing working capabilities remain available until their complete replacements land.

## Blocking rationale

Needs all replacement areas before compatibility cleanup and combined acceptance; transitive blockers 01, 04 and 06 are deliberately omitted.

## Comments

- 2026-10-26 — Published after the user approved the twelve-ticket breakdown and these blockers. Publication only; the user explicitly instructed: “don’t start implementation.”
- 2026-10-27 — Claimed by `/root/ticket_12` on dedicated branch/worktree based on integration `b41822e` after all listed predecessors resolved.
- 2026-10-27 — Resolved by the coordinator after implementation `8a2737d` and review fix `96df597` were integrated into `codex/relay-portal-workspace-integration` at `96df597f1583bf8d69b0f6630f6be7977d2c74ba` (tree `7b77042ecff9aaf2d265c089c1309a708d87ee15`). The cutover uses the Workspace shell for security and administration, separates account reviews and Quota Plans, removes the duplicated plan panel/global footer, and preserves `/admin` plus legacy `plans_after` and `#quota-plans` entry handling. Combined journeys and final responsive evidence are recorded in `run.md` and `/private/tmp/clipp-relay-portal-ticket12-final-evidence/run.md`.
- 2026-10-27 — Final integrated `bash scripts/verify.sh routine` passed on `96df597` with Go 1.27.3, including tests, vet, build and repository scripts. Focused auth/portal/PostgreSQL tests, scoped vet, build, browser-runner syntax, `git diff --check`, and auth/portal race checks passed. Disposable PG17 smoke/database integration and full PG17 built-service browser journey passed; PG18 smoke/database integration passed. Later local Chrome retries intermittently failed during no-script consent navigation after the viewport checks; final consent metrics were separately persisted. App inspector: zero FAIL across seven routes; three explained WARNs. Standards review: no documented violations and one optional duplication suggestion was addressed by `96df597`; Spec review: no findings. Remaining qualification boundaries are outside this local portal ticket (live OAuth, deployment/cluster, native client and forced live transfer).
