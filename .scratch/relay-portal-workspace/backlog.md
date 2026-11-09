# Clipp Relay portal workspace backlog

Published: 2026-10-26
Repository role: relay
Execution: active — issue `Status` and `Blocked by` fields are authoritative; see [implementation run](run.md)

[Parent specification](spec.md) · [Selected Workspace A prototype](reference/prototype.html) · [Style reference](reference/styles.html)

The user approved these twelve slices and their blockers. Each issue file owns its current status, assignee and blocking edges. This index records the approved structure; it is not a separate execution ledger.

| Ticket | Blocked by | What it delivers |
| --- | --- | --- |
| [01: Read Relay Account capacity in Workspace A](issues/01-read-relay-account-capacity-in-workspace.md) | None | A working account overview with the selected shell, real allowance and capacity, restricted-account states, folded phone navigation and a reusable browser fixture around the built service. |
| [02: Read recent Recorded Relay Usage on every screen size](issues/02-read-recent-recorded-relay-usage.md) | 01 | The latest four weeks by default, all thirteen retained weeks on demand, a visible current week on phones and accessible exact totals. |
| [03: Connect Clipp and sign in from a compact entry page](issues/03-connect-clipp-and-sign-in.md) | 01 | A first-screen Connect Clipp action, reliable discovery URL copying and setup help, plus the compact signed-out Google sign-in page. |
| [04: Manage Portal Sessions and Account-wide Revocation](issues/04-manage-portal-and-account-wide-access.md) | 01 | A separate Access & security view with working portal-only logout and a reviewed Sign out everywhere operation. |
| [05: Delete a Relay Account with truthful lifecycle results](issues/05-delete-relay-account-with-truthful-results.md) | 04 | Deliberate account deletion from Access & security, including recent-authentication guidance, pending/completed views and accurate re-registration copy. |
| [06: Find and open Relay Account reviews](issues/06-find-and-review-relay-accounts.md) | 01 | An administrator account list with global search/status filtering, bounded pages, reliable plan names, desktop selection and a focused phone review view. |
| [07: Approve accounts and manage Relay Quota assignments](issues/07-approve-and-assign-relay-quotas.md) | 06 | Named approval, replacement-plan and override forms with accurate effect previews, exact quota inputs and conflict recovery. |
| [08: Restrict relay access and complete recovery review](issues/08-restrict-relay-access-and-complete-recovery-review.md) | 06 | State-appropriate suspend, reactivate, deny, return-to-review, credential-revocation and Recovery Review Hold actions without losing the existing operator controls. |
| [09: Maintain immutable Quota Plans in their own view](issues/09-maintain-immutable-quota-plans.md) | 01 | A separate bounded plan library with working plan creation, reviewed archival and safe retry of an uncertain creation. |
| [10: Authorize or cancel a registered Clipp app](issues/10-authorize-or-cancel-clipp-app-consent.md) | 01 | Compact consent that identifies the actual app, account and relay, with real authorization and a safe one-use Cancel operation. |
| [11: Recover failed portal requests without misleading actions](issues/11-recover-failed-portal-requests.md) | 01 | Task-sized setup and failure pages whose recovery action matches the actual failure while preserving statuses and fail-closed uncertainty. |
| [12: Complete Workspace cutover and verify combined journeys](issues/12-complete-workspace-cutover-and-journeys.md) | 02, 03, 05, 07, 08, 09, 10, 11 | One coherent production portal with all selected A views connected, temporary legacy UI removed and complete owner/admin journeys proven against the built artifact. |

## Graph and acceptance

- Ticket 01 is the initial entry point in the approved graph.
- After 01, the independently eligible slices are 02, 03, 04, 06, 09, 10 and 11.
- 05 waits for 04. Both 07 and 08 wait for 06; neither waits for 09 or for the other.
- 12 waits for 02, 03, 05, 07, 08, 09, 10 and 11. Its other predecessors are transitive.
- Every feature slice includes its own real HTTP and responsive browser acceptance. Final cutover checks combined journeys; it does not defer earlier feature testing.
- Shared files and possible merge conflicts require coordination, not additional blocking edges.
- No standalone horizontal prefactor is needed. Narrow layout extraction and the built-service browser launcher are part of the first complete account slice.

## Authorization record

- User, 2026-10-26: “Looks good. Publish the 12 tickets with these blockers. don't start implementation”
- Published one local Markdown issue per approved slice with Status ready-for-agent.
- The parent specification is unchanged. No implementation run, ticket claim, code change, commit, deployment or live acceptance was started.
- The user later directly requested implementation of this backlog with `implement-spec`; the coordinator started the run recorded in [run.md](run.md). The publication-only instruction above records the earlier planning turn.

## Coverage

All 74 parent user stories have a primary ticket owner in [ticket coverage](ticket-coverage.json). All shared style, accessibility, security, embedded-delivery and validation requirements remain governed by the parent specification and each slice’s acceptance criteria.
