# 03: Verify Chrome identity and authorized clipboard use

**What to build:** Run the existing Chrome clipboard acceptance on the exact owned profile and candidate extension, using the user's overwrite permission and reporting effects honestly.

**Blocked by:** None.

**Acceptance blocker:** The 2026-10-26 reset scenario used all three allowed attempts without a successful Share Now history effect. Another owned acceptance scenario requires a fresh budget reset.

**Status:** claimed

- [x] Profile/process, loaded extension ID/build/candidate and a visible popup interaction with an observed search result are checked before clipboard assertions.
- [x] Explicit authorization reference and overwrite scope are supplied per invocation; unrelated invocations do not inherit permanent permission.
- [x] Clipboard use and cleanup/restoration outcomes are truthful and retained without private clipboard content; cleanup failures are not swallowed.
- [x] Classified failures and persistent bounded diagnostic attempts follow the approved policy, including deadline enforcement, a required expected observation and durable history outside disposable worktrees; tab-based tests do not claim toolbar-popup acceptance.
- [ ] Public command negative cases and an available owned browser demonstration establish successful product interaction and the scoped result.

## Context

The [approved specification](../spec.md) and [decision coverage](../decisions.md) define the complete contract and confirmed public testing seams. Preserve existing product invariants; this ticket changes operational verification only. The coordinator owns claims, integration and resolution.

## Answer

Implemented on the client integration branch. On 2026-10-26, the user explicitly reset the Chrome budget. Attempt 1 on `119d9621` again timed out at `verify_share_history_effect`. Attempt 2 on `c9653bac` tried a Playwright permission override for the opaque extension origin and failed because Chrome does not permit grants to opaque origins. Attempt 3 on `ebd42724` returned to the manifest permission path and timed out at `verify_share_history_effect`; the Share Now response observer recorded no response. All three receipts report synthetic clipboard use/change; the runner read back only its fixture writes and did not read, save or restore the prior clipboard contents. The latest code at `b0480615` now classifies the two fixed Share Now UI failure messages without retaining arbitrary alert text, but this change was made after the last browser attempt and remains unqualified. The reset scenario is exhausted, no successful Share Now history effect is established, and the toolbar popup itself is not qualified. Public contract tests pass 13/13 and `npm run check` passes 81 suites / 726 tests at the latest code.

## Comments

Reopened after review found that the package script permanently supplied the effort authorization reference, clipboard acceptance did not establish a successful product UI interaction, diagnostic runs could continue beyond the 20-minute budget, expected observations were optional, and attempt history was stored in the checkout. Resolve these against the approved spec before restoring the completion status.

The original review findings are fixed. Earlier, automatic approval review rejected a launch before command execution; that refusal remains historical. The user directly reset the budget again on 2026-10-26, after which the owned runner used all three attempts described above. Receipts are retained in the durable per-user acceptance directory, and the exhausted prior scenario is archived beside it. A fresh reset and a successful owned acceptance are still required to close Ticket 03.
