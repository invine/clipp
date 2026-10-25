# 03: Verify Chrome identity and authorized clipboard use

**What to build:** Run the existing Chrome clipboard acceptance on the exact owned profile and candidate extension, using the user's overwrite permission and reporting effects honestly.

**Blocked by:** None (can start immediately).

**Status:** claimed

- [x] Profile/process, loaded extension ID/build/candidate and a visible popup interaction with an observed search result are checked before clipboard assertions.
- [x] Explicit authorization reference and overwrite scope are supplied per invocation; unrelated invocations do not inherit permanent permission.
- [x] Clipboard use and cleanup/restoration outcomes are truthful and retained without private clipboard content; cleanup failures are not swallowed.
- [x] Classified failures and persistent bounded diagnostic attempts follow the approved policy, including deadline enforcement, a required expected observation and durable history outside disposable worktrees; tab-based tests do not claim toolbar-popup acceptance.
- [ ] Public command negative cases and an available owned browser demonstration establish successful product interaction and the scoped result.

## Context

The [approved specification](../spec.md) and [decision coverage](../decisions.md) define the complete contract and confirmed public testing seams. Preserve existing product invariants; this ticket changes operational verification only. The coordinator owns claims, integration and resolution.

## Answer

Implemented on the client integration branch. Public clipboard contract tests passed (12/12), and the exact integration tree passed `npm run check` (81 suites, 726 tests). The owned Chromium run on candidate `d33cbcbae33d57b00537c94b5e75332f8ff75cbb` passed the visible popup interaction preflight, then timed out in the later clipboard-acceptance stage. It used and changed the host clipboard under D4 authorization; it did not read, back up or restore clipboard contents. The three-attempt diagnostic budget is exhausted, so the full owned clipboard acceptance remains unresolved. The toolbar popup itself is not qualified.

## Comments

Reopened after review found that the package script permanently supplied the effort authorization reference, clipboard acceptance did not establish a successful product UI interaction, diagnostic runs could continue beyond the 20-minute budget, expected observations were optional, and attempt history was stored in the checkout. Resolve these against the approved spec before restoring the completion status.

The code findings are fixed. The acceptance history is retained under the private run artifacts and `/private/tmp/clipp-ticket-03-acceptance-state/`; its combined scenario budget is exhausted. No further native/browser attempt may be made under that scenario.
