# 05 — Full-width account reviews and contextual details

Status: resolved
Owner: coordinator


Blocked by: None

**Delivers:** Administrators can scan the account list without a permanently empty half-width editor and open the complete review task on demand while preserving list context.

**Visual evidence:** [Desktop accounts before](evidence/implementation-desktop-accounts-dark.png), [desktop selected review before](evidence/implementation-desktop-review-dark.png), [phone accounts before](evidence/implementation-phone-accounts-dark.png), [reference accounts](evidence/reference-desktop-accounts-dark.png).

**Acceptance:**

- [ ] When no account is selected, the list uses the available width so email identity, status, plan and Review action are scannable. On selection, use an accessible contextual dialog, focused detail or equivalent; maintain a safe no-script path and return/focus/list context.
- [ ] Retain bounded literal case-insensitive server-side search before paging, all canonical statuses including Denied, scoped pending counts, stable paging, long email readability and accurate archived/off-page plan lookup.
- [ ] Preserve complete review facts, effective quota and zero-versus-cleared overrides, Recovery Review Hold and state-appropriate approval, suspend, reactivate, deny, revoke, reassign and recovery actions.
- [ ] Preserve authorization/allowlist, reason, revision, Origin/CSRF, validation, stale-conflict and uncertain-result handling; no dialog, synthetic data or toast substitutes for confirmed server state.
- [ ] Exercise account list and review using production HTTP and built-service browser fixtures at desktop and phone, keyboard and no-script paths; do not run connection or Clip-sending tests.

## Answer

When no account is selected, the review list uses the available width; details and real review forms remain available on demand with list/search context. Built-service browser acceptance covered desktop and phone list/detail, bounded search/filter and paging, plan/override choices, account status actions and recovery facts. Existing authorization, validation, revision and no-script handling remain in the production routes. Light and dark admin list/detail screens were inspected at desktop and phone; no real account was changed. See `../run.md`.
