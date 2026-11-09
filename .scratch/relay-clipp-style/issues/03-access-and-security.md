# 03: Access and security

**What to build:** Present the existing Relay Account security actions in the approved design while preserving their separate consequences, confirmations and recovery journeys.

**Blocked by:** 01 — Account overview and responsive workspace.

**Status:** resolved

- [x] Portal-only sign-out, Account-wide Revocation and Relay Account Deletion are distinct and clearly explain their actual scopes and consequences before an existing confirmation step.
- [x] Existing Origin, CSRF, session generation, recent-authentication, deletion-journal and authoritative result requirements remain enforced; the UI never reports an unconfirmed operation as successful.
- [x] Pending, completed, restricted, failed and uncertain outcomes retain safe recovery, including current-window retained quota and the existing re-registration behavior.
- [ ] Both themes, keyboard/focus handling, narrow layouts and essential no-script forms remain usable and accessible.
- [ ] Exercise the established real portal HTTP and built-service browser seams with disposable fixtures; do not run connection tests or tests that send Clips.

## Answer

Integrated in Relay at `d4f92d5a4c7a35a748745f7f8d615795a4d91072` (source `6ea9336401bddf17eb44f09eb05eefb92e1dc0b4`). The security page clarifies the scopes, revocation timing and deletion/re-registration consequences while preserving existing forms and confirmations. No handler or operation semantics changed.

`go test ./internal/portal`, browser acceptance script syntax and `git diff --check` passed. PostgreSQL-backed account-security HTTP and built-service browser checks were unavailable because the disposable database and serving/TLS/Chrome setup are absent. No connection or Clip-sending tests were run; full responsive and theme inspection remains in ticket 07.
