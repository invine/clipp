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

Implemented on the client integration branch. The latest user-approved Chrome reset used all three attempts: `706943bb` timed out at `verify_share_history_effect`; `ce50c10b` classified an out-of-user-gesture popup clipboard-read probe as a product failure (that probe does not establish whether the actual click path can read); and `50799feb` timed out at the same history-effect check. Attempt 3 installed both read and response observers but recorded no read result, response, or fixed UI feedback. Receipts report synthetic clipboard use/change; the runner did not inspect, save or restore prior clipboard contents. The reset is exhausted and no successful Share Now effect is established.

After that reset, the unqualified working-tree change routes Share Now clipboard reads from the authorized background through the offscreen clipboard bridge, instead of asking the popup to read and forward clipboard text. The acceptance observer now watches only the Share Now response. Targeted bridge tests pass 11/11, the Chrome public contract passes 13/13, extension production build passes, and `npm run check` passes 81 suites / 727 tests with loopback access. This code has not had a browser acceptance attempt; the next explicitly approved reset will be archived as a new scenario before running it. Ticket remains claimed/open, with no acceptance pass claimed.

## Comments

Reopened after review found that the package script permanently supplied the effort authorization reference, clipboard acceptance did not establish a successful product UI interaction, diagnostic runs could continue beyond the 20-minute budget, expected observations were optional, and attempt history was stored in the checkout. Resolve these against the approved spec before restoring the completion status.

The original review findings are fixed. Earlier, automatic approval review rejected a launch before command execution; that refusal remains historical. The user directly reset the budget again on 2026-10-26, after which the owned runner used all three attempts described above. Receipts are retained in the durable per-user acceptance directory, and the exhausted prior scenario is archived beside it. A fresh reset and a successful owned acceptance are still required to close Ticket 03.
