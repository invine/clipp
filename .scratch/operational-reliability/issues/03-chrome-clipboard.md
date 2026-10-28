# 03: Verify Chrome identity and authorized clipboard use

**What to build:** Run the existing Chrome clipboard acceptance on the exact owned profile and candidate extension, using the user's overwrite permission and reporting effects honestly.

**Blocked by:** None.

**Acceptance blocker:** Cleared by the owned Chrome acceptance on revision `d3eeb3e`.

**Status:** resolved

- [x] Profile/process, loaded extension ID/build/candidate and a visible popup interaction with an observed search result are checked before clipboard assertions.
- [x] Explicit authorization reference and overwrite scope are supplied per invocation; unrelated invocations do not inherit permanent permission.
- [x] Clipboard use and cleanup/restoration outcomes are truthful and retained without private clipboard content; cleanup failures are not swallowed.
- [x] Classified failures and persistent bounded diagnostic attempts follow the approved policy, including deadline enforcement, a required expected observation and durable history outside disposable worktrees; tab-based tests do not claim toolbar-popup acceptance.
- [x] Public command negative cases and an available owned browser demonstration establish successful product interaction and the scoped result.

## Context

The [approved specification](../spec.md) and [decision coverage](../decisions.md) define the complete contract and confirmed public testing seams. Preserve existing product invariants; this ticket changes operational verification only. The coordinator owns claims, integration and resolution.

## Answer

Implemented on the client integration branch. The earlier exhausted Chrome scenarios remain archived. On the user-approved reset, attempts 1 and 2 failed respectively at the offscreen clipboard read and an unrelated retained-copy runner phase. Attempt 3 on `5f5d83f` reached Share Now but did not match the fixture. The subsequent reset and focused candidate at `d3eeb3e09dc3cb2e4a6a5ecf7abc5d1594138185` passed the owned Chrome acceptance on attempt 1: popup search readiness showed its result; the focused popup read matched the synthetic fixture; the background returned success; and a new matching history entry appeared. Candidate build SHA-256 was `a5f909e7d7f9235879b8171509d0561b6072dbcee99cf59625880a5a2e6c08ba`, loaded extension ID `ndomjflpgpjignaflbjdecbknfifjccf`, Chrome `143.0.7499.4`, owned profile/process. The receipt reports synthetic clipboard used/changed and restoration not requested; no prior clipboard contents were read, saved, or restored. This qualifies extension-page acceptance, not Chrome's toolbar popup. The public clipboard contract passes 13/13 and `npm run check` passes 81 suites / 726 tests. Final review found no Standards violations or Spec findings.

## Comments

Reopened after review found that the package script permanently supplied the effort authorization reference, clipboard acceptance did not establish a successful product UI interaction, diagnostic runs could continue beyond the 20-minute budget, expected observations were optional, and attempt history was stored in the checkout. Resolve these against the approved spec before restoring the completion status.

The original review findings are fixed. Earlier, automatic approval review rejected a launch before command execution; that refusal remains historical. The user reset the budget on 2026-10-26; the successful final scenario receipt and all exhausted histories are retained in durable per-user acceptance storage. Final review compared the integration diff from `50799feb` through `d3eeb3e`: Standards found no violations or actionable smells; Spec found no missing requirements, scope creep or incorrect behavior. Ticket 03 is resolved. The extension page flow passed; toolbar popup qualification remains explicitly outside this ticket's evidence.
