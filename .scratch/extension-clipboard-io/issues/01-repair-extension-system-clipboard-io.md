# 01 — Repair extension system clipboard I/O

**Status:** resolved

**What to build:** Replace the Chrome extension's invalid offscreen Async Clipboard boundary while preserving retained-Clip reuse, Share Now, and popup-independent live Remote Clip application semantics.

The settled solution is recorded in [`../spec.md`](../spec.md).

## Comments

- Diagnosis reproduced the retained-Clip Copy error in real Chromium and traced it to `navigator.clipboard.writeText()` running in an unfocused MV3 offscreen document.
- Scope round settled popup-independent Remote Clip application, bidirectional repair, and truthful reuse failure feedback.
- Architecture round selected one Chrome-only offscreen DOM-copy writer, focused-popup Share Now reads with background completion, explicit partial-success feedback after a successful write, and log-only Remote Clip application failures.
- Contract round selected intended-text baselining without offscreen read-back, structured reuse outcomes, popup-only authorization for text-bearing Share Now requests, and compositional real-Chromium acceptance coverage.
- Final round removed the invalid offscreen read surface, fixed exact UI feedback and Retry behavior, and declared Chrome 109 as the minimum supported version.

## Acceptance checklist

- [x] Offscreen DOM-copy writer reports success only when the actual Chrome copy operation reports success and always clears staged Clip content.
- [x] Retained-Clip Copy succeeds in real Chromium, changes the system clipboard, and creates a fresh Local Clip ID.
- [x] Retained-Clip write failure creates no fresh Local Clip and retains the retryable unchanged-state error.
- [x] Post-write capture rejection reports partial success without an inline Retry.
- [x] Share Now reads exact text in the focused popup, rejects unauthorized text-bearing callers, and continues background processing after handoff.
- [x] A live Remote Clip still applies with the popup closed through the same writer and retains current log-only, no-automatic-retry failure behavior.
- [x] Successful extension writes baseline to intended text without offscreen read-back.
- [x] The built extension declares Chrome 109 as its minimum version.
- [x] Jest/unit coverage and the separate serialized real-Chromium integration command pass.

## Answer

The failure came from using `navigator.clipboard.writeText()` inside the unfocused MV3 offscreen document. Extension writes now use a temporary textarea and Chrome's synchronous DOM copy command in that document, while Share Now performs its read in the focused popup and hands the exact text to the background worker. The offscreen clipboard bridge is write-only.

Retained-Clip reuse now distinguishes complete success from a successful system copy whose subsequent Clip capture was rejected, allowing the shared UI to show truthful retry or dismiss behavior. The extension also rejects text-bearing Share Now messages from any sender other than its popup and declares Chrome 109 as its minimum version.

Verification passed with targeted Jest coverage, all runtime builds, lint (warnings only), the complete Jest suite, and `npm --workspace apps/extension run test:clipboard` against a built extension in real Chromium.
