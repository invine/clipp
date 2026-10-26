# 03: Verify Chrome identity and authorized clipboard use

**What to build:** Run the existing Chrome clipboard acceptance on the exact owned profile and candidate extension, using the user's overwrite permission and reporting effects honestly.

**Blocked by:** None.

**Acceptance blocker:** The owned Chrome acceptance remains unresolved. The reset scenario used all three allowed attempts at the Share Now history-effect check; another scenario requires a fresh budget reset.

**Status:** claimed

- [x] Profile/process, loaded extension ID/build/candidate and a visible popup interaction with an observed search result are checked before clipboard assertions.
- [x] Explicit authorization reference and overwrite scope are supplied per invocation; unrelated invocations do not inherit permanent permission.
- [x] Clipboard use and cleanup/restoration outcomes are truthful and retained without private clipboard content; cleanup failures are not swallowed.
- [x] Classified failures and persistent bounded diagnostic attempts follow the approved policy, including deadline enforcement, a required expected observation and durable history outside disposable worktrees; tab-based tests do not claim toolbar-popup acceptance.
- [ ] Public command negative cases and an available owned browser demonstration establish successful product interaction and the scoped result.

## Context

The [approved specification](../spec.md) and [decision coverage](../decisions.md) define the complete contract and confirmed public testing seams. Preserve existing product invariants; this ticket changes operational verification only. The coordinator owns claims, integration and resolution.

## Answer

Implemented on the client integration branch. At the current candidate revision, public clipboard contract tests passed (12/12), `npm run verify` passed 81 suites / 726 tests and all three production builds, and Standards/Spec reviews passed. After the user directly confirmed a new Chrome budget and the existing D4 clipboard scope on 2026-10-26, the owned Chromium runner reached the clipboard stage on all three attempts. Attempts 1, 2 and 3 timed out at `verify_share_history_effect` after the popup search interaction passed. Attempt 2 widened that history observer to 30 seconds; attempt 3 checked for generic Share Now UI feedback. The final attempt recorded no UI error code. All three receipts report the host clipboard was used and changed under D4; the runner read back only its synthetic fixture writes and did not read, save, or restore the prior clipboard contents. The three-attempt budget is exhausted. No successful Share Now history effect is established, and the toolbar popup itself is not qualified. The native-dialog observer added after the final attempt remains unverified in a browser run.

## Comments

Reopened after review found that the package script permanently supplied the effort authorization reference, clipboard acceptance did not establish a successful product UI interaction, diagnostic runs could continue beyond the 20-minute budget, expected observations were optional, and attempt history was stored in the checkout. Resolve these against the approved spec before restoring the completion status.

The code findings are fixed. Earlier, automatic approval review rejected a launch before command execution because it did not accept the stored D4 reference as trusted current-user evidence; this refusal is retained as historical evidence. The user later directly confirmed both a budget reset and the same D4 scope, after which the owned runner completed three attempts. All receipts and command logs are retained under the private run artifacts and the runner's durable per-user acceptance directory. The attempt cap is now exhausted, so Ticket 03 remains open pending a future budget reset and successful owned acceptance.
