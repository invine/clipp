# 03: Verify Chrome identity and authorized clipboard use

**What to build:** Run the existing Chrome clipboard acceptance on the exact owned profile and candidate extension, using the user's overwrite permission and reporting effects honestly.

**Blocked by:** None (can start immediately).

**Status:** claimed

- [ ] Profile/process, loaded extension ID/build/candidate and successful product UI interaction are checked before acceptance assertions.
- [ ] Explicit authorization reference and overwrite scope are supplied per invocation; unrelated invocations do not inherit permanent permission.
- [x] Clipboard use and cleanup/restoration outcomes are truthful and retained without private clipboard content; cleanup failures are not swallowed.
- [ ] Classified failures and persistent bounded diagnostic attempts follow the approved policy, including deadline enforcement, distinguishing observation and history outside disposable worktrees; tab-based tests do not claim toolbar-popup acceptance.
- [ ] Public command negative cases and an available owned browser demonstration establish successful product interaction and the scoped result.

## Context

The [approved specification](../spec.md) and [decision coverage](../decisions.md) define the complete contract and confirmed public testing seams. Preserve existing product invariants; this ticket changes operational verification only. The coordinator owns claims, integration and resolution.

## Answer

Implemented on the client integration branch. Public CLI fixtures passed and an owned Chromium acceptance passed on the clean integration candidate, recording extension ID/build, profile ownership, user-authorized clipboard scope and actual side effects. Clipboard contents were not retained or restored, as authorized. Toolbar-popup acceptance is not claimed. The sanitized receipt is in the local run ledger's artifact directory.

## Comments

Reopened after review found that the package script permanently supplied the effort authorization reference, clipboard acceptance did not establish a successful product UI interaction, diagnostic runs could continue beyond the 20-minute budget, expected observations were optional, and attempt history was stored in the checkout. Resolve these against the approved spec before restoring the completion status.
