# 03: Verify Chrome identity and authorized clipboard use

**What to build:** Run the existing Chrome clipboard acceptance on the exact owned profile and candidate extension, using the user's overwrite permission and reporting effects honestly.

**Blocked by:** None.

**Acceptance blocker:** The latest user-approved reset is exhausted. Its final attempt reached the Share Now click, but the popup read did not match the synthetic fixture and no response/history effect was observed. Another owned acceptance scenario needs a fresh reset.

**Status:** claimed

- [x] Profile/process, loaded extension ID/build/candidate and a visible popup interaction with an observed search result are checked before clipboard assertions.
- [x] Explicit authorization reference and overwrite scope are supplied per invocation; unrelated invocations do not inherit permanent permission.
- [x] Clipboard use and cleanup/restoration outcomes are truthful and retained without private clipboard content; cleanup failures are not swallowed.
- [x] Classified failures and persistent bounded diagnostic attempts follow the approved policy, including deadline enforcement, a required expected observation and durable history outside disposable worktrees; tab-based tests do not claim toolbar-popup acceptance.
- [ ] Public command negative cases and an available owned browser demonstration establish successful product interaction and the scoped result.

## Context

The [approved specification](../spec.md) and [decision coverage](../decisions.md) define the complete contract and confirmed public testing seams. Preserve existing product invariants; this ticket changes operational verification only. The coordinator owns claims, integration and resolution.

## Answer

Implemented on the client integration branch. The prior reset's three attempts are preserved: `706943bb` and `50799feb` timed out at `verify_share_history_effect`; `ce50c10b` tested an out-of-user-gesture popup read and is inconclusive about the click path. A new reset was approved by the user's “Proceed” on 2026-10-26; its prior history was archived intact. In the new reset, attempt 1 on clean revision `79a04df5` reached the Share Now background response and returned `clipboard_read_failed` from the offscreen Clipboard API read. Attempt 2 on `57c7896` stopped earlier at the separate retained-copy probe (`confirm_retained_clipboard_copy` timeout). Final attempt 3 on `5f5d83f` reached Share Now; its popup read resolved but did not match the synthetic fixture, and no response or history effect was observed. Receipts record synthetic clipboard use/change only, not clipboard contents.

Chrome documents that offscreen pages cannot be focused, so the product now reads from the focused extension popup inside the Share Now click and sends that text to the authorized background. The current uncommitted runner improvement switches to a single-line synthetic fixture and records only safe flags: exact/line-ending-normalized match, empty status, whether the message was sent and sanitized response. Targeted clipboard tests pass 10/10, the Chrome public contract passes 13/13, extension production build passes, and `npm run check` passes 81 suites / 726 tests with loopback access. Ticket remains claimed/open pending a new reset and successful owned history effect.

## Comments

Reopened after review found that the package script permanently supplied the effort authorization reference, clipboard acceptance did not establish a successful product UI interaction, diagnostic runs could continue beyond the 20-minute budget, expected observations were optional, and attempt history was stored in the checkout. Resolve these against the approved spec before restoring the completion status.

The original review findings are fixed. Earlier, automatic approval review rejected a launch before command execution; that refusal remains historical. The user directly reset the budget again on 2026-10-26, after which the owned runner used all three attempts described above. Receipts are retained in the durable per-user acceptance directory, and the exhausted prior scenario is archived beside it. A fresh reset and a successful owned acceptance are still required to close Ticket 03.
