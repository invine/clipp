# Evaluate text buttons for icon treatment

Date: 2026-10-09 (Asia/Dubai). Status: icon-treatment direction agreed by the user; first pass applied to the study prototype. The user selected [Search first](issues/10-compare-lightweight-narrow-toolbars.md#answer) and requested this evaluation, specifically naming Share now and Copy. [Decide visual consistency and efficient layout](issues/07-decide-layout-and-visual-direction.md) owns the remaining decision.

## Agreed direction

Use icon-only buttons for repeated, spatially clear utility actions: **Copy on each Clip, Share now in the daily toolbar (with an explicit current-clipboard explanation), Pin, Close and Clear search**. Inline edits beside the value being edited are another good candidate. Keep words for navigation destinations, persistent settings/state, setup, recovery and consequential decisions.

The user agreed on 2026-10-09. This accepts the icon/label treatment and its stated conditions; it does not establish that every user recognizes every icon. The first prototype pass applies Copy, Share now, Close and Clear search, and fixes the Pin toggle semantics. Inline edit icons remain conditional on placement beside a visible value; standalone settings actions retain their labels.

The user subsequently requested icon-only Delete in Clip details. This is an explicit exception to the initial recommendation to label every destructive action: the open Clip provides its context. The selected prototype uses a trash icon, danger color, accessible name and hover/focus hint “Delete Clip”, separated from Copy/Pin at the other end of the footer. This appearance choice does not settle the pending deletion-confirmation policy or change global destructive actions.

## Action-by-action assessment

| Action and context | Recommendation | Symbol / treatment | Reason and conditions |
| --- | --- | --- | --- |
| Copy on a history row or card | **Icon only** | Two overlapping rectangles; quiet button at the trailing edge | Repeated next to one specific Clip; removes repeated Copy labels and boxed visual noise. Keep it directly available on touch, not hover-only or hidden in overflow. |
| Copy in the full-Clip dialog | **Icon only is suitable** | Same Copy symbol and placement relationship as history | The content being copied is explicit. Do not use this to remove distinct labels from ambiguous copy targets elsewhere. |
| Share now in the history toolbar | **Icon only, with an explicit explanation** | Send / paper-plane symbol, accent color; tooltip and accessible name “Share current clipboard now” | Production already uses a send symbol with this action. It sends the current system clipboard, not the selected history item, and does not open the OS sharesheet. On touch, provide a brief first-use or empty-state explanation; a hover tooltip or screen-reader label alone does not teach sighted touch users the meaning. |
| Pin / Unpin | **Keep icon only** | One pin symbol with an unambiguous selected state | Already established in the prototype; use a stable accessible name with pressed state, or a changing action name without pressed state. Do not mix the two patterns. |
| Close a read-only viewer/dialog | **Icon only** | × in the usual dismiss position | Clear spatial context. Its accessible name identifies what closes. Closing must not mean deleting, revoking or confirming a destructive operation. |
| Clear the search query | **Icon only** | × inside the search field | The affected object is the adjacent query. This is separate from Clear history. Now available in the selected Search first field whenever it contains a query. |
| Clear an active Pinned filter | **Keep the Pinned label; use × for removal** | “Pinned ×” | The label communicates the active scope. An unexplained × would hide what will be cleared. |
| Edit a visible device name, alias or relay field | **Icon only when adjacent to that value** | Pencil | The object is explicit in an inline row. A standalone pencil in a large settings section is ambiguous; retain labelled Edit there. Keep explicit Save/Cancel for multi-field forms. |
| Copy a displayed Peer ID / endpoint | **Icon only beside the exact value** | Copy symbol, object-specific accessible name | The field supplies context. Full-value access and actual success/failure feedback are still required. This treatment does not itself add an absent handler. |
| Copy Pairing text from a QR view | **Keep icon + text** | Copy symbol + “Copy pairing text” | An icon alone cannot distinguish copying the QR image, Peer ID or Pairing payload. Production Chrome options already has a distinct Copy as Text action. |
| Filters and overflow | **Keep icons** | Sliders and horizontal ellipsis | Already compact in Search first. Retain labels inside the opened panels; show active filter state. Do not turn panel choices All/Pinned into unexplained glyphs. |
| Expand/collapse | **Chevron beside the labelled section** | Down/up chevron with expanded state | The section name supplies the meaning. The whole labelled control should remain operable. |
| History / Devices / Settings navigation | **Keep visible words** | Existing text navigation, optionally supplemented by icons later | Removing labels saves little vertical space when hit targets stay usable. Three destinations fit; visible labels help distinguish History, Devices and management. |
| Open Clipp from the popup | **Keep icon + text** | “Open Clipp ↗” | This is the visible escape to full-page management. An external-link icon alone does not explain where it goes. |
| Auto Sync, its off state, theme and preferences | **Keep visible labels and values** | Named toggle/select; explicit On/Off or System/Light/Dark | These convey persistent state, not a one-shot utility action. A refresh/sync icon could misleadingly suggest “sync once.” |
| Pair a device, Scan QR, Show my QR, approval review | **Keep icon + text** | Relevant scan/QR/device symbol beside the action | Infrequent setup with similar-looking operations; labels explain whether data is displayed, scanned or imported. Accept/Reject stay explicit text. |
| Relay Log in / Manage account / Retry, background controls, diagnostics | **Keep text** | Optional supporting icons | These actions have different destinations and lifecycle effects. Removing labels obscures what will happen without recovering persistent history space. |
| Delete one Clip in details | **Icon only, explicitly requested by the user** | Trash icon in danger color; “Delete Clip” accessible name and hover/focus hint | The open Clip supplies context. Keep the icon apart from Copy/Pin in the detail footer. Secondary menu entries retain text; the pending confirmation policy is unchanged. |
| Clear history, Revoke device, Remove relay, Generate new identity | **Keep explicit text** | Optional warning symbol, never the sole explanation | Their scopes and consequences differ. A trash/bin/broken-link icon cannot communicate local deletion versus network revocation versus identity reset. |
| Retry save, initialization Retry, Pair device after reset, form Save/Cancel | **Keep explicit text** | Optional supporting icon | These are corrective or consequential decisions. A circular arrow can mean reload, retry or synchronize; the text identifies the task. Native tray/menu commands also retain labels. |

## Text-button baseline measurements

The read-only [measurement script](icon-action-evaluation/measure.cjs) and [15-case ledger](icon-action-evaluation/measurements.json) inspect the current text buttons at 100/130/200% root text size across 320px phone, 360px phone, popup, narrow desktop and wide desktop. The script does not replace any buttons, touch real clipboard data or invoke runtime actions. No icon variant was rendered.

At default text size:

| Surface / action | Current width | Proposed existing square target | Estimated width recovered |
| --- | ---: | ---: | ---: |
| Phone: Share now | 79.33px | 48px | 31.33px for the search field |
| Phone: Copy per Clip | 57.02px | 48px | 9.02px per row |
| Popup / narrow desktop: Share now | 79.33px | 40px | 39.33px for search |
| Popup / narrow desktop: Copy per Clip | 57.02px | 40px | 17.02px per row |
| Wide desktop: Share now | 92.52px | 40px | 52.52px |

These are geometry-based estimates, not observed improvements from an implemented icon variant. The current phone toolbar is already one 48px row: replacing its Share now label will **not by itself make that row shorter**. The expected benefit is more search width and less visual weight. Copy's ordinary phone width gain is modest; the repeated labels disappear, but extra complete Clips are not promised. At simulated 200% text, the current phone labels are much wider (Share now 150.86px; Copy 108.91px), so the potential width benefit is greater. Enlarged text and layout wrapping must still be rechecked after any actual change.

## Preserve the meaning and feedback

The accepted [explicit history reuse contract](../clip-history/spec.md#explicit-history-reuse) distinguishes the two daily actions:

- **Copy** writes the selected stored Clip to the system clipboard, creates a fresh Local Clip after a successful write and follows Auto Sync. It is not unconditionally local-only.
- **Share now** reads the current system clipboard, creates a fresh Local Clip and attempts one outbound event even when Auto Sync is off. It does not enable Auto Sync, send an arbitrary selected card or initiate history reconciliation. Repeated presses are distinct events.
- **Copy Pairing text** copies a different payload and must not inherit the history reuse description.

Retain that distinction in tooltip/accessibility wording and placement. Use the existing send metaphor rather than a generic OS share-sheet glyph; this is a Clipp-specific recommendation inferred from the action contract, not a proven icon-recognition result.

A successful clipboard write can show a temporary check and announce “Copied to clipboard.” Keep the Copy action's accessible identity stable during transient feedback. Preserve a separate partial-failure notice when clipboard writing succeeds but capture/save/share fails. Do not show success on a failed clipboard write. The existing [feedback mapping](../../packages/ui/src/clipboardActionFeedback.ts) distinguishes those outcomes; neither Copy completion nor Share now acceptance is proof that another device received content. Never turn a success check into a remote-delivery claim.

## Shared icon rules and runtime differences

- Use one bundled SVG family across Electron, Chrome and Android; avoid the observed external icon-font dependency. Reuse existing concepts (`send`, `content_copy`, pin, sliders, ellipsis), with consistent optical size and stroke. Suggested visible size is 20–24px inside the established 40px pointer / 48px Android-prototype target. Test actual native sizing separately.
- Every control remains a real button with a meaningful accessible name. Repeated Copy controls need association with their Clip context, not nine undifferentiated controls detached from content. Decorative SVGs should not be announced as separate controls. Provide keyboard activation and visible focus. [WAI button pattern](https://www.w3.org/WAI/ARIA/apg/patterns/button/) and [Android accessibility guidance](https://developer.android.com/guide/topics/ui/accessibility/apps).
- Desktop and Chrome can add tooltips on both hover and keyboard focus. A native `title` alone is not the proposed focus-tooltip implementation. On Android, keep actions visible; do not depend on hover to reveal Copy or to teach Share now. Preserve at least 48×48dp touch targets in the native implementation. [Android accessibility guidance](https://developer.android.com/guide/topics/ui/accessibility/apps).
- Keep selected states distinguishable beyond hue alone. Pin should use a stable accessible name plus `aria-pressed`, or Pin/Unpin action names without that toggle attribute. The selected prototype now uses a stable Pin label with pressed state; historical references retain the previous mixed pattern. [WAI button pattern](https://www.w3.org/WAI/ARIA/apg/patterns/button/).
- Keep contrast and focus treatment from the accepted platform criteria. “Quiet” means less enclosure and repetition, not faint invisible controls. Menus/dialogs retain text when temporary labels cost little permanent space.

## Local evidence anchors

The [prototype](layout-prototype/app.js) supplies the current labels and local SVGs. Shared production UI already pairs Send and Copy icons with their labels at [ClipboardApp](../../packages/ui/src/ClipboardApp.tsx); the [relay controls](../../packages/ui/src/ManagedRelaySettings.tsx) provide the setup/recovery action contexts. The source-backed [flow inventory](flow-control-inventory.md) and accepted history reuse contract ground the recommendations. Current Chrome options lacks history Copy; adopting the shared presentation there remains separate implementation work.

## Applied first pass

The user's “I agree” accepted the proposed direction. The selected [Search first prototype](http://127.0.0.1:4195/?variant=1&surface=phone&icons=icons) now uses local SVG Copy/Send/Close/Clear controls. A [text reference](http://127.0.0.1:4195/?variant=1&surface=phone&icons=text) remains available. Search clearing appears only for a populated query; Copy has a temporary simulated check and stable accessible name; Send says “Share current clipboard now” in its tooltip/accessibility name. The empty state pairs the Send symbol with an explanation for touch discovery. The Clip viewer uses a browser dialog with close/Escape focus return, and its feedback remains inside the active dialog.

The [26-case icon render ledger](layout-prototype/evidence/icon-actions/measurements.json) reports no script/geometry failures. Keyboard/hover tooltips, query clearing/focus, simulated Copy feedback/reset, stable Pin state, native-browser dialog close/Escape, and the text reference were exercised. This is browser prototype evidence only. Native runtime behavior, real clipboard success/partial failure and assistive-technology qualification remain future implementation checks.

At 360×720, the actual Search input grows from 152.67px to 184px (31.33px recovered). Share and Copy targets are 48×48px; the first Clip remains at y=84 with six complete Clips. Wide cards remain uniform and retain the selected grid. These actual measurements confirm the ordinary-width estimate; they do not imply a shorter toolbar or more complete phone Clips.

The remaining visual/management choices stay open in the parent layout ticket. No production action semantics or application code were changed.
