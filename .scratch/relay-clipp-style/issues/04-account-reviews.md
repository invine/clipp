# 04: Account reviews

**What to build:** Give administrators the approved account review experience with real account status, quota assignments and existing management actions, while maintaining authorization and review context.

**Blocked by:** 01 — Account overview and responsive workspace.

**Status:** resolved

- [x] Only authorized administrators can access administrative views and actions; the list shows the actual scoped pending count and all canonical statuses, including Denied.
- [x] Literal case-insensitive email search and status filters operate over the eligible dataset before bounded paging, retain validated list context through review and Back, and handle empty results.
- [x] Account review presents real status, effective allowance and overrides, usage, assigned plan and Recovery Review Hold, including archived or off-page assignments.
- [x] Existing state-appropriate approval, suspension, reactivation, denial, return-to-pending, grant revocation, plan assignment, quota overrides and recovery-review flows remain reachable with their existing policy checks; zero and cleared overrides remain distinct.
- [x] Stale, rejected and uncertain operations retain safe recovery and do not imply success; desktop and phone users can reach review actions using keyboard and no-script paths.
- [ ] Exercise the established portal HTTP and built-service browser seams using synthetic fixtures; do not run connection tests or tests that send Clips.

## Answer

Integrated in Relay at `0e57c573da14bb7f25fcf822644d2c9f744eeec1` (source `eed1e50c2707e2d7c0545046d506c2780787c7f9`). Account review now has clearer status, plan, effective quota, explicit override, usage and recovery-hold summaries, with responsive styling. Existing handlers, search, filters, forms and review context remain intact.

`go test ./internal/portal`, `go vet ./internal/auth ./internal/portal`, `go build ./...` and diff checks passed. PostgreSQL-backed override and built-service browser checks were unavailable because `CLIPP_TEST_SERVING_CONFIG`, database, serving/TLS and Chrome setup were absent. No connection or Clip-sending tests were run; ticket 07 owns remaining integrated UI inspection.
