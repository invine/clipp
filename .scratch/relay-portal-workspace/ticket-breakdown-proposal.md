# Proposed Clipp Relay portal tickets

Status: approved and published — implementation not started
Date: 2026-10-26
Repository role: relay

This is the approved review outline, not a combined issue file. The twelve slices are now separate issues, linked from the backlog. The parent specification is unchanged.

Each slice includes real handler-to-UI behavior, feature-level tests and responsive acceptance. No implementation is started.

1. **Read Relay Account capacity in Workspace A**
   - **Blocked by:** None (can start immediately).
   - **Delivers:** A working account overview with the selected shell, real allowance and capacity, restricted-account states, folded phone navigation and a reusable browser fixture around the built service.

2. **Read recent Recorded Relay Usage on every screen size**
   - **Blocked by:** 01.
   - **Delivers:** The latest four weeks by default, all thirteen retained weeks on demand, a visible current week on phones and accessible exact totals.

3. **Connect Clipp and sign in from a compact entry page**
   - **Blocked by:** 01.
   - **Delivers:** A first-screen Connect Clipp action, reliable discovery URL copying and setup help, plus the compact signed-out Google sign-in page.

4. **Manage Portal Sessions and Account-wide Revocation**
   - **Blocked by:** 01.
   - **Delivers:** A separate Access & security view with working portal-only logout and a reviewed Sign out everywhere operation.

5. **Delete a Relay Account with truthful lifecycle results**
   - **Blocked by:** 04.
   - **Delivers:** Deliberate account deletion from Access & security, including recent-authentication guidance, pending/completed views and accurate re-registration copy.

6. **Find and open Relay Account reviews**
   - **Blocked by:** 01.
   - **Delivers:** An administrator account list with global search/status filtering, bounded pages, reliable plan names, desktop selection and a focused phone review view.

7. **Approve accounts and manage Relay Quota assignments**
   - **Blocked by:** 06.
   - **Delivers:** Named approval, replacement-plan and override forms with accurate effect previews, exact quota inputs and conflict recovery.

8. **Restrict relay access and complete recovery review**
   - **Blocked by:** 06.
   - **Delivers:** State-appropriate suspend, reactivate, deny, return-to-review, credential-revocation and Recovery Review Hold actions without losing the existing operator controls.

9. **Maintain immutable Quota Plans in their own view**
   - **Blocked by:** 01.
   - **Delivers:** A separate bounded plan library with working plan creation, reviewed archival and safe retry of an uncertain creation.

10. **Authorize or cancel a registered Clipp app**
   - **Blocked by:** 01.
   - **Delivers:** Compact consent that identifies the actual app, account and relay, with real authorization and a safe one-use Cancel operation.

11. **Recover failed portal requests without misleading actions**
   - **Blocked by:** 01.
   - **Delivers:** Task-sized setup and failure pages whose recovery action matches the actual failure while preserving statuses and fail-closed uncertainty.

12. **Complete Workspace cutover and verify combined journeys**
   - **Blocked by:** 02, 03, 05, 07, 08, 09, 10, 11.
   - **Delivers:** One coherent production portal with all selected A views connected, temporary legacy UI removed and complete owner/admin journeys proven against the built artifact.

## Dependency decisions

- 01 establishes a working account view, the shared A presentation and the real application browser launcher; it is not a styles-only foundation ticket.
- 02, 03, 04, 06, 09, 10 and 11 are independently eligible after 01.
- 05 needs 04; 07 and 08 need 06. Neither 07 nor 08 needs 09, and they do not block each other. Existing plan operations and seeded plans remain usable.
- 12 waits for the eight terminal slices. Earlier tickets must already pass their own checks; final testing is for complete journeys and cutover.
- Shared files or possible merge conflicts are coordination concerns, not extra dependency edges.
- No preliminary wide refactor is justified. Preserve working older routes/controls until each complete replacement lands.

## Approval and publication

The user approved the granularity and blockers on 2026-10-26 and instructed publication without starting implementation. All twelve separate issues are ready-for-agent; none is claimed or started. See [the published backlog](backlog.md).
