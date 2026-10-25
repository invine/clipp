# 03: Verify Chrome identity and authorized clipboard use

**What to build:** Run the existing Chrome clipboard acceptance on the exact owned profile and candidate extension, using the user's overwrite permission and reporting effects honestly.

**Blocked by:** None (can start immediately).

**Status:** claimed

- [ ] Profile/process, loaded extension ID/build/candidate and basic interaction are checked before acceptance assertions.
- [ ] Explicit authorization reference and overwrite scope permit host clipboard writes without backup or restoration prerequisites; unrelated invocations do not inherit permanent permission.
- [ ] Clipboard use and cleanup/restoration outcomes are truthful and retained without private clipboard content; cleanup failures are not swallowed.
- [ ] Classified failures and persistent bounded diagnostic attempts follow the approved policy; tab-based tests do not claim toolbar-popup acceptance.
- [ ] Public command negative cases and an available owned browser/clipboard demonstration establish the scoped result.

## Context

The [approved specification](../spec.md) and [decision coverage](../decisions.md) define the complete contract and confirmed public testing seams. Preserve existing product invariants; this ticket changes operational verification only. The coordinator owns claims, integration and resolution.
