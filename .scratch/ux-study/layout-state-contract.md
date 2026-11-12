# Responsive layout and recovery contract

Date: 2026-10-09. **Approved: the user accepted all four recommendations in this round.** Owned by [Decide visual consistency and efficient layout](issues/07-decide-layout-and-visual-direction.md). This is the accepted study contract for later implementation; it is not a production implementation or native acceptance result.

**Later desktop navigation decision (2026-11-12):** The user requested that History, Devices and Settings use the same persistent desktop sidebar as Relays when usable content width exceeds 1100 CSS pixels. This supersedes the no-permanent-sidebar choice below at desktop width. Tablet and phone widths retain compact navigation.

## Preserve the selected design

The existing decisions remain the baseline: compact History rows narrow and equal-height multi-column cards wide; no permanent sidebar; a Clipp/status line above Search; Search first with Filters and Send; All/Pinned inside Filters; the approved Copy/Pin/Delete/detail treatment; M1 Compact summaries for Devices with text statuses; M3 category-based Settings; and the approved S2 connection indicator. [The map](map.md#decisions-so-far) points to the owning decisions.

Continue the demonstrated quiet violet branding, solid surfaces, shared fields and local SVG actions across the four web surfaces. Use the accepted System/Light/Dark preference. Implement common semantic roles for text, surfaces, borders, focus, actions, warning and danger; exact token values are implementation details subject to contrast and native rendering checks. Native OS dialogs retain their platform behavior. This extends the approved visual vocabulary rather than proposing another visual redesign.

## Approved decisions

| Decision | Approved treatment | Alternative not selected | Accepted tradeoff |
| --- | --- | --- | --- |
| Q1 — Cramped height / enlarged text | Let top controls join the page scroller when fixed controls leave too little usable content area. | Keep top controls fixed. | Scrolling can move branding/search out of view, but gives more room to Clips and preserves readable controls. Normal-size layouts stay as selected. |
| Q2 — Task surfaces | Use a full-screen task view for Pairing, editing and long Clip details on narrow screens; centered dialogs when comfortable; short confirmations stay compact. | Keep inset dialogs at every size. | A task temporarily owns the available screen, gaining width and space for the keyboard. It still has an explicit return route. |
| Q3 — Background problems | One compact actionable issue summary with details on demand, plus errors at the relevant field/task. Routine connection information remains in the S2 indicator. | Separate banners for every ongoing problem. | History stays compact; every unresolved problem must remain discoverable from the summary or its owning task. |
| Q4 — Unfinished editors | Back/Escape/Close retains a temporary draft for the current app session; Save applies it; explicit Cancel/Discard clears it. | Ask before discarding dirty edits. | Reduces repeat typing and dismissal prompts, but reopening an editor must make unsaved state clear. No promise of recovery after popup destruction or app restart. |

This approval does not settle destructive confirmations, Identity Rotation failure boundaries, relay account transitions, or the exact Chrome popup action allocation. Those are now settled separately in the [approved control-flow contract](control-flow-contract.md), owned by [Decide missing controls and obsolete entry points](issues/06-decide-control-gaps-and-retirements.md#answer).

## What the evidence establishes

| Finding | Evidence and implication |
| --- | --- |
| Fixed app regions can consume nearly the whole small window. | [Android A12](android-observations.md) measured only 58px of History in a native 340×350 freeform window. Avoid relying on permanently reserved chrome at every available height. |
| The current prototype already has a cramped fallback; its measured geometry remains implementation evidence rather than a final breakpoint specification. | [Header ledger](layout-prototype/evidence/history-header/measurements.json): 320px/200% text puts the first Clip at about y=374; 640×360 landscape at y=189. Navigation moves before content and the page scrolls. These are browser simulations, not native keyboard tests. |
| The normal selected grid uses width productively. | [Wide/resize evidence](layout-prototype/evidence/filter-scope/measurements.json) and [grid rules](layout-prototype/style.css:44) preserve equal card heights and avoid stretching to fill the viewport. Enlarged text should reduce columns or increase shared preview budgets, never introduce masonry. |
| Narrow and enlarged text failures are real across runtimes. | [Electron E07](electron-observations.md), [Chrome C03](extension-observations.md), [Android A14/A15](android-observations.md): long text, names and fixed geometry can overflow. Full values and related actions must remain reachable without horizontal page scrolling. |
| Recovery notices currently compete for incorrect space. | [Electron E02](electron-observations.md), [Chrome C04](extension-observations.md), [Android A17](android-observations.md): concurrent notices overlap or crowd fixed layout rows. Layout must account for the actual content height. |
| Errors and diagnostics can obscure the task. | [Android A13](android-observations.md) records a 212px Pairing diagnostics block above a full-height shell. [Chrome C07/C10](extension-observations.md) and [Electron E11](electron-observations.md) record silent/incorrect action feedback. Show useful recovery at the action; expand technical detail within the same bounded surface. |
| Resizing must not destroy work. | [Electron E05](electron-observations.md) loses relay edits across the layout breakpoint; [Chrome C12](extension-observations.md) demonstrates normal popup destruction. [Management evidence](layout-prototype/evidence/management/measurements.json) verifies selected draft/resize cases in the prototype, not all editor dismissal paths. |
| Native input space and Back need real qualification. | [Android A01/A02/A03/A09/A18](android-observations.md): system/IME overlap, Back leaving the app, scanner reachability and QR cropping. The QR did scroll; failed scanning was not established. Browser dialog bounds do not prove keyboard safety. |

The no-match distinction is supported by [Electron E04](electron-observations.md); QR failure presentation by [Chrome C08](extension-observations.md). A general History loading defect and a general toast defect were not observed. Requirements for those states below are completeness criteria, not additional findings.

## Responsive contract

| Situation | Accepted behavior | Acceptance |
| --- | --- | --- |
| Normal phone / narrow window | Preserve the approved two-row History top area, compact Clip rows and labelled bottom navigation. | No hidden active search; Filters and Send reachable; status remains in the branding row. |
| Short window or narrow enlarged text | One page scroller; top controls may scroll away. Keep labelled navigation near the start of the page rather than after a potentially long Clip list. | Preserve branding above Search and every destination. Keep navigation near the start of the scroller and verify reachability during implementation; the prototype's incidental pixel positions are not a fixed product requirement. |
| Restored / wide / fullscreen | Header navigation and a content scroller; use width for more equal-height Clip columns. Keep management forms at a comfortable readable width. | No permanent sidebar, giant stretched fields or viewport-height cards. No speculative device-type breakpoint; measure available content width. |
| Enlarged text / long content | Wrap labels, metadata and action groups; reduce columns as needed; retain uniform wide cards. Clip previews may truncate with a reachable full-content view. | Full IDs/endpoints/errors stay inspectable. Do not truncate the actual editor value, hide an action or shrink hit targets to fit. |
| Chrome popup | Preserve the quick-action role and visible route to full-page Clipp. | Browser-imposed popup limits are real. Do not promise a durable unfinished workflow in a focus-dismissed popup; the separate control-flow contract supplies the approved action allocation. |

The prototype's 720px width and 450px short-height boundaries are sample breakpoints, not universal platform constants. Test both sides of responsive boundaries, not only named device presets. Resizing or rotating must preserve query, scope, selected destination, active task, applicable draft/validation and a sensible focus/scroll anchor.

## Task surface and dismissal contract

On narrow screens, the full-screen task consumes the safe app content area; global navigation does not compete with its form. Keep a visible task title and Close/Back control. Long content owns one vertical scroller. An action footer can remain visible when enough useful body space remains; at extreme height/text settings it may join the scroller rather than cover fields. Centered dialogs use the same content and action order at comfortable sizes.

Use initial focus appropriate to the task. Opening Pairing should not automatically summon the keyboard before the user chooses Scan/QR/Paste; entering the paste/editor route can focus the field. Desktop keyboard focus enters the active dialog, stays inside it and returns to the invoking control on dismissal, with the source page's context retained.

Back from a subtask returns one level: request detail → request list; QR/paste → Pairing chooser; then the originating page. Close dismisses the task. On Android, Back with the keyboard open first dismisses the IME according to the native host contract; a subsequent Back returns through the current task before leaving the root app. Do not call dismissing a Pairing view “cancelling the request”: a submitted Trust Request has its own validity and cannot be revoked merely by hiding UI.

Back/Escape/Close retains unsaved fields for the current app session; explicit Cancel/Discard clears the applicable draft. Responsive transitions and failed submissions must not silently erase them. Saving must distinguish pending, success and failure; retaining an unsaved draft is not a successful save. Any new post-start cancellation promise for a destructive or submitted operation remains outside this visual contract.

The current prototype has inset browser dialogs with the entire header/body/actions scrolling together. Management subviews replace the current dialog rather than maintaining a parent-task stack. Pairing/relay drafts are held in memory; unsaved name/alias values currently live only in the DOM. These are known prototype limitations, not validated implementations of the accepted contract above.

## State and message contract

| State | Required presentation |
| --- | --- |
| Loading | A labelled pending state in the relevant region; do not briefly claim there is no data. Retain usable already-loaded content during refresh where applicable. |
| First-use empty History | Explain how to create/share a Clip using the runtime's actual capability. Keep the current clipboard and stored Clip actions distinct. |
| Empty pinned view / no search matches | Name the active scope/query and provide the appropriate clear/change route without erasing unrelated filtering. Do not say History is empty. |
| No devices / no configured relays | Show purposeful setup guidance. No relays is valid; do not turn it into a warning or imply a relay is required for direct connections. |
| Busy mutation | Feedback at the initiating control; prevent ambiguous duplicate submission. Keep the current form/context readable. |
| Failed setting / Pairing / approval | Plain error beside the task, retained input and a usable retry/edit route. Show unsaved state accurately; no success toast on a rejected action. |
| Copy / other small success | Reuse the approved brief Copy confirmation and restrained status feedback. Do not equate queueing or local clipboard work with remote delivery. No new global notification panel is proposed. |
| Routine relay/device condition | The approved S2 icon and panel; do not duplicate every network status in a History banner. Device rows retain their text statuses. |
| Multiple actionable problems | A compact summary names the most consequential problem and exposes the additional issues. Opening it shows all unresolved messages/actions in a scrollable list. Do not count one relay problem twice through its status icon and summary. |
| A problem that blocks the active task or risks loss of local work | Keep its explanation and recovery beside that task even when a summary exists. A transient toast or hidden diagnostics section is insufficient. |

For example, a History save failure remains visibly actionable, while a separate Pairing error stays in Pairing and the known relay problem is available through S2. Additional global issues can be reached from the compact summary. Repeated copies of the same issue coalesce; a new issue is not silently hidden by replacing a previous message. Dismissing a presentation does not report the underlying fault as resolved. Keep technical logs expandable and text/actions content-sized.

## Implementation acceptance matrix

Reuse the selected [platform criteria](platform-constraints.md) and existing evidence ledgers. Verify each case with a recorded runtime, viewport, scaling and state. These are required checks for later implementation, not passes obtained in this round.

| Coverage | Pass condition |
| --- | --- |
| 320px, ordinary phone, landscape, 340×350 short window, restored desktop, maximized/fullscreen, popup and full-page Chrome | All actions reachable; clear scroll ownership; no horizontal page scroll for ordinary app content; no accidental history/nav state reset. |
| 100%, intermediate and 200% text; supported text-spacing overrides | Full functionality retained; readable controls; action association survives reflow; uniform wide grid or deliberate fewer-column layout. |
| Long Clip/name/Peer ID/endpoint/error, empty and no-match | Inspect full values; no document-width expansion; correct recovery action for the state. |
| Pairing/editor/detail with native IME and safe insets | Focused field and required actions reachable; keyboard does not cover navigation/Close; platform Back behavior verified. |
| One/several notices, failed Save, repeated Retry, rejected approval and QR failure | Honest pending/failure/success states; no lost draft; no overlapping banners; no permanently disabled recovery action. |
| Keyboard and touch | Named icon controls, visible focus, scoped dialog navigation, focus return and demonstrated 40px pointer / 48dp Android target intent. Native measures must use their correct units. |
| Theme and assets | System/Light/Dark is coherent across surfaces; essential icons work offline; text/control/focus contrast meets the selected criteria. |

The [layout resolution](issues/07-decide-layout-and-visual-direction.md#answer) combines the accepted Q1–Q4 choices with the earlier visual decisions. No further layout preference is currently open. Exact breakpoint tuning and native verification remain implementation acceptance work; the separate approved control-flow contract and recorded native evidence gaps remain explicit inputs to the final study handoff.
