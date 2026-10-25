# 03: Verify Chrome identity and authorized clipboard use

**What to build:** Run the existing Chrome clipboard acceptance on the exact owned profile and candidate extension, using the user's overwrite permission and reporting effects honestly.

**Blocked by:** None (can start immediately).

**Status:** resolved

- [x] Profile/process, loaded extension ID/build/candidate and basic interaction are checked before acceptance assertions.
- [x] Explicit authorization reference and overwrite scope permit host clipboard writes without backup or restoration prerequisites; unrelated invocations do not inherit permanent permission.
- [x] Clipboard use and cleanup/restoration outcomes are truthful and retained without private clipboard content; cleanup failures are not swallowed.
- [x] Classified failures and persistent bounded diagnostic attempts follow the approved policy; tab-based tests do not claim toolbar-popup acceptance.
- [x] Public command negative cases and an available owned browser/clipboard demonstration establish the scoped result.

## Context

The [approved specification](../spec.md) and [decision coverage](../decisions.md) define the complete contract and confirmed public testing seams. Preserve existing product invariants; this ticket changes operational verification only. The coordinator owns claims, integration and resolution.

## Answer

Implemented on the client integration branch. Public CLI fixtures passed and an owned Chromium acceptance passed on the clean integration candidate, recording extension ID/build, profile ownership, user-authorized clipboard scope and actual side effects. Clipboard contents were not retained or restored, as authorized. Toolbar-popup acceptance is not claimed. The sanitized receipt is in the local run ledger's artifact directory.
