# 06 — Compact Quota Plans and owner security tasks

Status: resolved
Owner: coordinator


Blocked by: None

**Delivers:** Administrators and owners can scan plan and security options in compact, aligned layouts while reviewing consequential operations before confirmation.

**Visual evidence:** [Phone plans before](evidence/implementation-phone-plans-dark.png), [reference desktop plans](evidence/reference-desktop-plans-dark.png), [desktop security before](evidence/implementation-desktop-security-dark.png), [reference security](evidence/reference-desktop-security-dark.png).

**Acceptance:**

- [ ] Present plan values and account-security choices in content-sized aligned rows or contextual task surfaces, reducing repeated labels and expanded confirmations without hiding actual plan values or task destinations.
- [ ] Preserve plan creation validation, immutable assigned allowances, archive consequences, explicit confirmation, reasons, revisions, operation identity and ambiguous-result recovery; existing assignments survive archival.
- [ ] Distinguish Portal Session logout, Account-wide Revocation and Relay Account Deletion with their existing effects, fresh-authentication, explicit review/confirmation, journal, retained-quota and safe recovery behavior.
- [ ] Both themes, phone and desktop layout, keyboard/focus, touch targets, long content, enlarged text and safe no-script forms remain usable; no success is asserted before confirmation.
- [ ] Exercise existing portal HTTP and built-service browser tests with disposable fixtures, excluding connection tests and tests that send Clips.

## Answer

Quota plans and owner security tasks now use compact, aligned layouts while retaining actual values, explanations, review and confirmation paths. Built-service acceptance covered plan creation/archive behavior and owner security/logout, account-wide revocation, deletion confirmation and pending recovery in desktop/phone and no-script flows. The existing recent-authentication and operation validation safeguards remain intact. No real account or Clip was used. See `../run.md`.
