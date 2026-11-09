# 06: Sign-in, consent, and service messages

**What to build:** Apply the Clipp-aligned design to signed-out entry, app authorization and existing service messages while preserving their safe destinations and security guarantees.

**Blocked by:** 01 — Account overview and responsive workspace.

**Status:** resolved

- [x] Signed-out, consent, restricted, conflict, rate-limit, service-failure, deletion and recovery states use the shared visual language and retain their correct explanations, status codes, retry hints and safe next actions.
- [x] Authorization and cancellation show the trusted account and registered client type and preserve callback validation, PKCE, one-use continuation, CSRF, Origin, expiry and credential-generation safeguards.
- [x] Essential navigation, forms and recovery work without JavaScript, and enhanced dialogs and controls provide accessible names, keyboard focus, dismissal and restoration in both themes and responsive layouts.
- [ ] Test observable HTTP responses, safe redirects and committed or unchanged state alongside built-service browser interaction with local fixtures; do not run connection tests or tests that send Clips.

## Answer

Integrated in Relay at `4083401862e266d8ec4f953746784547a89bbdc6` (source `3db4e4d7b34feae0284cb853b3f4010872d6879c`). Shared appearance controls were added to standalone service states; consent remains script-free under its existing restrictive CSP. Existing auth/consent handlers, status codes, redirects and security checks remain intact.

Portal tests, selected safe auth/consent tests, Go build, gofmt and diff checks passed. Built-service browser acceptance was unavailable because the dedicated Chrome and local service/TLS fixture were not configured. No connection, Clip-sending, forced-transfer, live Google or native-client tests ran; ticket 07 retains the integrated UI inspection.
