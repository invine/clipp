# Extension System Clipboard I/O

## Problem

The Chrome extension routes background clipboard reads and writes through its MV3 offscreen document using the Async Clipboard API. Chrome offscreen documents cannot receive focus, while Chromium rejects Async Clipboard operations when their document is not focused. Retained-Clip reuse therefore shows an error instead of copying the selected Clip, live Remote Clip application fails while the popup is closed, and Share Now reads through the same invalid boundary.

Chrome's supported offscreen-write workaround is a selected DOM control plus `document.execCommand("copy")`. There is no equivalent official offscreen Async Clipboard read exemption.

## Settled decisions

- Live Remote Clip application remains popup-independent. When a valid live Remote Clip arrives while the popup is closed, the extension still attempts to apply it immediately to the system clipboard under the existing best-effort, no-automatic-retry contract.
- This effort fixes both directions of the invalid offscreen clipboard bridge:
  - retained-Clip reuse and live Remote Clip application must write successfully;
  - Share Now must read the current system clipboard through a valid focused context.
- Retained-Clip reuse keeps its existing Clip semantics: the platform write happens before a fresh Local Clip is created, and a failed write creates no Clip or network message.
- Reuse failure feedback must describe the operation's actual outcome; it must not claim that both clipboard and history were unchanged when the clipboard write succeeded but later capture persistence failed.
- Chrome uses one background-owned system-clipboard write port for both retained-Clip reuse and live Remote Clip application. Its offscreen implementation follows Chrome's supported workaround: copy selected text from an offscreen DOM control with `document.execCommand("copy")`.
- The offscreen writer is Chrome-specific and isolated behind the existing runtime clipboard boundary. Shared core code does not depend directly on DOM or `execCommand`.
- The writer treats `execCommand("copy") === false` or an exception as a failed write, clears temporary clipboard content and selection in all outcomes, and acknowledges success only after the synchronous copy operation reports success.
- Share Now reads the current system clipboard in the focused popup, then sends that exact text to the background for explicit Local Clip capture. A read failure creates no Clip. Once the request reaches the background, persistence and delivery continue even if the popup closes before receiving the response.
- Retained-Clip reuse has three user-visible outcome classes:
  - clipboard write failure: no fresh Local Clip is created and the existing Copy failure remains retryable;
  - clipboard write success plus ordinary fresh-Clip acceptance: Copy succeeds;
  - clipboard write success plus capacity or validation rejection: Clipp reports that the content was copied but the fresh Clip could not be saved or shared.
- A temporary persistence failure that queues the fresh Local Clip remains a successful Copy and uses the existing pending-capture storage banner and retry behavior.
- Failed live Remote Clip application remains content-free log output only. Clipp does not automatically retry and adds no new user-visible warning in this effort; the accepted Remote Clip remains available in Clipboard History.
- The extension manual clipboard service no longer treats offscreen clipboard read-back as available. After retained-Clip reuse or live Remote Clip application succeeds, the observer baseline becomes the exact intended text passed to the writer.
- A later observation equal to that intended text is suppressed. A different observed value remains a genuine new Local Clip candidate, even though a platform transformation of the written text can therefore appear as a distinct event. The solution does not introduce baseline-pending state that could swallow a genuine later user copy.
- The shared retained-Clip reuse action exposes a structured outcome:
  - `complete`: the clipboard changed and the fresh Local Clip was durably accepted or entered the existing pending-capture recovery path;
  - `copied-without-clip`: the clipboard changed, but capacity or validation prevented a fresh Local Clip from being saved or shared;
  - rejection: the clipboard write failed or the action never reached the write.
- The shared UI treats `copied-without-clip` as partial success rather than passing it through the ordinary failed-write Retry path.
- The background accepts a text-bearing Share Now request only from the extension's own popup document. Other extension contexts, content scripts, and ordinary tabs are rejected without processing the supplied text.
- The background/offscreen clipboard bridge is write-only. Its invalid offscreen `clipboardRead` request is removed, while the manifest retains `clipboardRead` for focused-popup Share Now reads.
- User-visible operation feedback is fixed as follows:
  - clipboard write failure: `Could not copy this Clip. Your clipboard and history were not changed.` with Retry;
  - clipboard write success plus fresh-Clip rejection: `Copied to clipboard, but Clipp could not save or share a new Clip.` with Dismiss and no inline Retry;
  - Share Now read failure: `Could not read the current clipboard. Keep Clipp open and try again.` with Retry;
  - Share Now capture rejection after a successful read: `Could not save or share the current clipboard.` with Retry;
  - pending capture: action success plus the existing pending-storage banner.
- The extension manifest declares `minimum_chrome_version: "109"`, matching its existing dependency on the MV3 offscreen API.

## Existing invariants

- Explicit reuse creates a fresh Local Clip with a new Clip ID and follows ordinary Auto Sync.
- Every Share Now invocation creates a fresh Local Clip and applies its one-Clip outbound override without enabling Auto Sync.
- Live Remote Clips are durably accepted and marked handled before serialized, at-most-once clipboard application.
- Historical imports never apply themselves to the current system clipboard.
- Clipboard writes remain serialized with capture observation. Successful writes establish an echo-suppression baseline; platforms with a valid read-back path may use the actual value read back from the system clipboard.

## Out of scope follow-ups

- Preventing unchanged clipboard content from being recaptured after a service-worker restart and popup reopen.
- Reconciling content-script copy/cut capture with the documented extension runtime capability that identifies the popup as the source of explicit local clipboard input.

## Solution shape

1. Replace the offscreen `navigator.clipboard.writeText()` implementation with a Chrome-only DOM-copy writer. It stages exact text in a non-user-visible form control, selects it, calls `document.execCommand("copy")`, treats a false return or exception as failure, and clears both staged content and selection in `finally`.
2. Narrow the extension clipboard bridge to write requests. Construct the extension's manual clipboard service without a `readText` callback so successful writes baseline to intended text.
3. Change the popup Share Now handler to read `navigator.clipboard.readText()` at invocation time and send the exact result in a popup-authorized background request. The background performs explicit capture, persistence, and outbound override independently of popup lifetime.
4. Introduce the shared structured retained-Clip reuse outcome described above. Translate each runtime's result at its bridge boundary and update the shared UI to distinguish failed write from partial success.
5. Keep live Remote Clip application on the same background-owned writer, with current at-most-once, no-automatic-retry behavior and content-free failure logging.
6. Add the Chrome 109 manifest floor and the real-browser regression command.

## Acceptance coverage

- A real-Chromium integration test runs the offscreen writer with no popup open and verifies the actual system clipboard changes.
- A real popup test reuses a retained Clip and verifies the clipboard content, absence of the failed-write alert, and creation of a fresh Clip ID.
- A real popup test reads exact system clipboard text for Share Now and verifies creation of a fresh Local Clip.
- Shared/core integration coverage verifies that live Remote Clip application calls the same system-clipboard writer. The initial regression gate does not add a fake production message or full two-extension pairing harness solely for this bug.
- Browser clipboard tests run serially because the system clipboard is process-wide. They use a separate headed extension-integration command rather than ordinary `npm test`; a future Linux CI job may run the command under Xvfb.
- Browser tests preserve the pre-test clipboard value when readable and restore it in cleanup.
