# Compact workspace and routine control delivery

Prepared 2026-10-10 for [Plan compact workspace and routine control delivery](issues/05-plan-compact-workspace-and-routine-controls.md#answer). **Approved delivery breakdown.** The user's acceptance is recorded in the linked decision. This plans delivery of the accepted design, not another visual comparison or production implementation. The [layout](../ux-study/layout-state-contract.md), [control flows](../ux-study/control-flow-contract.md), [shared interfaces](shared-interface-proposal.md), [correctness delivery](correctness-delivery-proposal.md) and [native delivery](native-host-delivery-proposal.md) remain authoritative.

## Recommended breakdown

Use eight reviewable packages: local assets/shared controls/host styling; persisted theme; accessible responsive navigation/tasks; History/details/preview text; connection status; Devices/Requests/alias clearing; Settings organization; and working retention/sharing-lifetime preferences. Introduce the reusable presentation with its first working consumer. Existing runtime authority, session state, task focus, issue composition and Chrome handoff are reused rather than reimplemented here.

Readable controls, local icons, working themes, navigation, visible Search and minimum reflow remain band 1. Complete History density, Devices and Settings organization remain band 2. Alias clearing accompanies Devices; sharing-lifetime wiring accompanies the replacement of ineffective settings as already allowed. Manual identity reset remains with its dedicated lifecycle decision. Settings provides its eventual location only after that operation works.

These packages are not a mandatory eight-step chain. Theme and functional settings can land on current surfaces before M3. A shared details/task consumer can enable complete Chrome management before final grid polish. Minimum reflow and pending-work access cannot be deferred merely because their final visual organization is later.

## Local assets, shared controls and host stylesheet integration

**Outcome:** essential icons and controls remain usable offline, with consistent readable fields, visible focus and content-sized labels across Electron, Android, popup and full-page Chrome.

Replace remote icon-font glyphs with the accepted bundled SVG action family and local Clipp branding. Use semantic roles for text, surfaces, borders, focus, action, warning and danger; remove hardcoded colors that defeat those roles. Use local typography/system fallbacks so network font failure cannot change a button into overlapping literal icon text. Preserve the selected quiet violet branding and solid surfaces; exact token values are tuning against the accepted contrast criteria.

Shared buttons, fields, toggles, category/navigation controls, tooltips and task actions live in `packages/ui`. Repeated Copy/Pin and the toolbar Send use named icon buttons; Delete is an icon in Clip details, visually separated from Copy/Pin. Keep words for destinations, setup, settings, recovery and consequential confirmations. Do not make Copy hover-only. Keep a stable Pin label with pressed state or a changing action name without pressed state; use one pattern consistently. Decorative SVGs are not separate accessible controls. Preserve the [approved icon guidance](../ux-study/button-icon-evaluation.md), including an understandable current-clipboard explanation for touch users of Send.

The current [UI entry](../../packages/ui/src/index.ts) imports [styles](../../packages/ui/src/styles.css) implicitly. [Chrome options](../../apps/extension/src/options.tsx) imports the relay editor directly and misses those styles; the [popup](../../apps/extension/src/popup.tsx) mixes shared and Tailwind styling. Give each host an explicit style/sizing entry. Separate shared component styles from host root geometry; blindly importing today's global `100vh`/overflow rules into options is not a repair. Coordinate [Electron renderer](../../apps/electron/src/renderer.tsx), [Android entry](../../apps/android/src/main.tsx), [popup HTML](../../apps/extension/src/popup.html) and options. Remove the popup's 800px minimum-height assumption while preserving real browser-host scrolling.

**Acceptance:** cold offline candidate rendering, local icon availability, readable relay fields and long unbroken values, named/keyboard-operable buttons, visible focus, default/enlarged text and every final action reachable. Preserve working relay-action wrapping. Target intent is 40px pointer and 48dp Android; measure Android in native units. Content-sized Start/export controls must not squeeze words into icon-sized boxes. Native OS dialogs retain their own styling.

**Allocation:** primary E01/C03/A04/A11. Supplies common styling to every other package; the visual-integration owner here collects all package/host evidence before closing broad C15.

## Persisted System, Light and Dark

**Outcome:** one real installation preference controls all Clipp surfaces on that installation, updates live and survives reopening. System follows the host's current appearance; explicit Light/Dark remain explicit. This does not synchronize settings between devices.

The shared theme action is currently inert and options only toggles a class; the inspected runtime state has no effective theme preference. Add a validated preference through the existing settings authority and ordered feed, with every affected bridge and consumer. Use System as the unset/default preference. Do not make a second browser-local preference that disagrees with background/main/client state. Chrome popup/options must reflect the same applied value without resending stale unrelated settings.

Apply semantic theme roles to fields, tasks/portals, hints, selected controls, status/error colors and host backgrounds, including initial window/web root appearance where practical. [Electron main](../../apps/electron/src/main.ts), [Android entry](../../apps/android/src/main.tsx) and [popup wrapper](../../apps/extension/src/popup.tsx) currently contain hardcoded backgrounds. Resolve the persisted choice without marking a failed write saved; retain truthful pending/error/reconciliation semantics. System appearance changes are presentation updates, not writes that replace the user's saved choice. Reuse the same theme consumer after Settings moves to M3.

**Acceptance:** each explicit mode, System changing while open, persisted reopen, concurrent Chrome views, late updates, invalid stored values, rejected/unconfirmed saves and offline launch. Check actual computed/visible text, fields, focus and status shapes in all themes, not just a class name or saved JSON. Existing settings/ordered-state tests and real rendered consumers are the seams; native rendering/OS theme qualification remains separately labelled.

**Allocation:** E13/C05; contributes A11/C15. This working feature remains band 1 and does not wait for final Settings categories.

## Accessible responsive navigation and task presentation

**Outcome:** every destination, active Search and its clear route stays reachable across widths, height, text scaling and native input. Layout changes preserve session context.

Use the approved header navigation at width, labelled bottom navigation at ordinary narrow sizes, and navigation near the start of the page scroller when cramped. Keep the Clipp/status line above Search, with Search/Filters/Send together below it; All/Pinned lives inside Filters with no duplicate segmented control. Auto Sync stays accessible and distinct from connection health. No permanent sidebar or inspector is introduced.

Remove the current split CSS/JavaScript boundary gap and hidden narrow Search in [ClipboardApp](../../packages/ui/src/ClipboardApp.tsx) and [styles](../../packages/ui/src/styles.css). Consolidate available-space decisions so the exact boundary is covered. Use shared native content bounds and the existing UI session for destination/query/scope/drafts/tasks/focus/scroll; do not create a new router or state store. When fixed regions leave insufficient room, let top controls join one page scroller. Basic readable row/text sizing must already prevent band-1 overflow, even before the full density package.

Complete the shared task frame introduced by correctness: full safe-area tasks narrow, comfortable dialogs wide, short confirmations compact, one task scroller, visible return/title, and action footers that can join the scroller when needed. Pairing chooser does not force the keyboard; editors/Paste can focus input deliberately. Preserve existing Back/Escape/Close retention, explicit Cancel/Discard and newer input during pending Save. Native adapters own IME/Back signals; shared task presentation remains the only DOM focus manager.

Include basic live pending-work discoverability in this early access work to satisfy A10. Use the existing working request destination until complete replacement management is ready; final M1 summaries follow below. A10 cannot close after navigation/target changes alone while pending work remains hidden.

**Acceptance:** boundary minus one/at/plus one; 320px reflow; short 340×350/landscape; default/intermediate/200% text with a query, scope, open task, draft, validation and failed Save. Check actual input/focus/return, final-item scroll, empty/no-match and no horizontal page hunting. QR sizing must retain complete code visibility or explicit scrolling with Copy/Close reachable; real scanning after sizing and native Back remain required separate evidence for A18.

**Allocation:** primary E03/E04/E06/E07/C06/A10/A14/A15/A18. This owner collects correctness History/session/focus results and native keyboard/IME/bounds evidence; it does not claim those repairs merely by rendering a new shell. A18's final QR presentation remains band 2; urgent access/reflow remains band 1.

## Compact History, full details and safe preview text

**Outcome:** narrow rows and top-aligned, equal-height wide cards use available space, with full content inspectable before Copy and accurate actions on the selected Clip.

Render from the approved authoritative History/query model. Keep Copy/Pin directly visible on rows/cards and open details through the content selection target; activating an action must not also open details. Equal card height is a shared budget at a given layout/text scale, not a fixed height that clips enlarged content. Reduce columns, grow that budget or use narrow rows as appropriate. One Clip must not stretch into a viewport-height card. Preserve normal vertical scrolling and the final Clip/action.

Details use the existing session/task frame with complete multiline/long content and named Copy/Pin/Delete icons. Do not duplicate action execution or error state. Respect successful Copy versus copied-without-clip, truthful Send feedback, immediate individual Delete and the separately reviewed Clear all operation. Handle selected-target deletion in another view, deletion of the last result and unpin-triggered retention removal without opening the wrong Clip or losing the query/scope. Chrome popup details route to full-page after the management parity gate; the full-page has no current-clipboard Send or automatic focus capture.

Current `truncate`, `truncateMiddle` and measured middle-ellipsis rendering in [ClipboardApp](../../packages/ui/src/ClipboardApp.tsx) slice UTF-16. Introduce one preview-only grapheme-safe shortening implementation used by Clip/name/ID previews, keeping exact values for inspection, editing and Copy. Test combining marks, emoji modifiers/ZWJ sequences and flags; do not normalize or rewrite the stored Clip or Peer ID to fit a row.

**Acceptance:** empty/one/typical/dense history, active query and Pinned, identical previews with different full text, multiline/unbroken/Unicode content, long metadata and errors, repeated/failed actions, concurrent mutations and large text. Measure column/card equality, content/action association, occupied header space and final-item reachability in the actual candidate. Prototype pixel values and counts are references, not acceptance thresholds or a promise of identical counts on native hosts.

**Allocation:** E08/E15/C13/A12; supplies preview work to E16 and integration evidence to C15. Minimum sizing needed for A14/A15 can land earlier with the same primitives. Complete density is band 2.

## S2 connection summary and panel

**Outcome:** the single status button gives the approved glanceable connection signal without implying delivery, while the short panel explains actionable partial problems and available paths.

Use one shared presentation derivation from ordered public state and the approved [S2 policy](../ux-study/connection-status-exploration.md#approved-aggregate-policy). Intersect connected peers with Trusted Devices; a transport peer used for Pairing is not a healthy trusted connection. Direct wins for a device with both direct/relayed paths. Green uses the original three-node triangle. Working relay-only uses amber routed shape; configured-relay sign-in/degradation/retry/explicit warning uses amber attention even when a direct path remains. Gray covers no path/waiting/unknown as appropriate. An unused fallback transport, an offline member or no configured relay is not itself a fault.

Keep one named status button in the branding line, no normal-header connection counts or sentences. Accessible label, shape and panel text agree with color. Preserve known usable paths when another relay starts; a failed/missing projection is not evidence of zero devices or a fabricated healthy path. Wire missing facts/availability through affected runtime adapters rather than inventing them in the UI. Managed relay readiness is not merely a socket connection. Auto Sync and local clipboard-read health stay independent.

In particular, [Chrome's public-state read](../../apps/extension/src/background.ts) currently maps a failed offscreen peer lookup to empty arrays. Carry availability/unknown or explicitly last-known facts through the approved state interface so S2 does not report confirmed offline from that failure. This is adapter integration for truthful presentation, not a transport-policy change.

The panel preserves Search/task context and focus return, includes brief device/relay and Auto Sync information, and links to management. Exact identity/protocol diagnostics remain in Devices/Connections. Share issue identity with the correctness issue composer so one relay problem is not counted twice; active recovery must remain reachable from its owning surface. Device rows retain text statuses, never reintroduced path icons.

**Acceptance:** the approved direct, mixed, relay-only, ready-with-no-devices, first-use, no-relay/direct, offline, unknown, starting-with-existing-path, retry, sign-in, degraded and ready-with-warning cases; Auto Sync off and an unrelated clipboard issue. Test the derivation and its real consumer, with live ordered updates and unavailable state, keyboard/touch panel entry, dismissal and focus return. No fixture or green icon counts as transport or remote-delivery acceptance.

**Allocation:** connection portion of E16, integrated with Devices/preview work; contributes C15. Band 2, without delaying existing truthful error/recovery controls.

## M1 Devices, Requests and alias clearing

**Outcome:** pending work, This device and Trusted Devices remain easy to find without navigating a long mixed settings drawer.

Implement [M1 Compact summaries](../ux-study/issues/11-compare-devices-and-settings-organization.md#answer): request summary, This device entry and compact Trusted Device rows, with on-demand task details. Rows show status text beneath names: Connected · direct, Connected · relay, Offline or explicit unknown path. Full Device Name, Local Device Alias and Peer ID remain distinguishable and inspectable/copyable; do not guess device platform. Use grapheme-safe previews from the shared implementation.

Requests consumes repaired immediate/terminal Pairing outcomes and version-guarded approval actions. Pending state is discoverable outside Devices and activation reaches the request list; an expired/handled request yields an accurate current list. Keep current normal Pairing routes for each runtime: camera only where supported, Chrome image import, appropriate QR/Paste. Do not turn a generated/decoded target into successful Pairing, or describe dismissing a waiting view as revocation of its request.

Add the approved **Use device name** action beside alias editing using the existing [identity presentation operation](../../packages/core/trust/identity.ts). It clears only the Local Device Alias. Await the result, preserve draft/error on failure, and follow the chosen explicit Save overwrites-edited-fields rule. Disconnected membership is still valid; a revoked/removed target cannot be recreated by stale Save. Device Name editing and Pairing results remain the correctness owner's semantics.

The existing bridges can clear by passing exactly an empty string; whitespace is invalid. Keep the core Peer-ID fallback when no valid reported Device Name exists. Test clearing after a remote name update and a late result after newer typing through the actual editor and [identity seam](../../tests/core/trust/identity.test.ts).

**Acceptance:** zero/one/many devices and requests; long identical prefixes and Unicode; offline/unknown/mixed connections; alias save/clear and failed clear; live rename, revoked target and incoming-request replacement. Dense lists keep general destinations reachable with no nested scrolling trap. Test pending entry when notification delivery is denied/failed, and consume native selected-notification → Requests evidence separately. Chrome must preserve full-page drafts under its existing idle/occupied-tab rule.

**Allocation:** E12 and the identity/status portion of E16; contributes E14/C14/A16/C15. Alias clearing is a separate approved addition delivered with Devices. Basic pending access required by A10 remains in the earlier navigation package; a later complete M1 cutover must retain it.

## M3 Settings and existing management tasks

**Outcome:** General, Connections and Advanced use one readable content area, retaining every functioning preference and recovery path without tall mixed device/relay/settings lists.

Follow [M3 category organization](../ux-study/issues/11-compare-devices-and-settings-organization.md#answer). General exposes Appearance, Auto Sync and unpinned-history retention. Connections contains relay configuration/actions and Android background connection where applicable. Advanced holds Clip Sharing Lifetime, Clear all local history, identity and troubleshooting/log controls as their operations become functional. Keep categories named, keyboard/touch accessible and reachable with long content. Session ownership preserves category, drafts and task context across reflow and category changes.

Reuse [ManagedRelaySettings](../../packages/ui/src/ManagedRelaySettings.tsx) content and the repaired entity/field-scoped actions; do not maintain a second relay editor with different validation, drafts or partial-effect promises. Keep existing Add/Edit/Remove, Log in, account-management/portal and Retry where applicable, with current capability wording. No relay is a valid state; empty configuration must not add defaults or become an error. Preserve existing single-session transport fallback and sender authorization.

Compose the approved native continuity controls with a concise benefit/state/battery summary and opt-in. Move verbose limitations and export/help into task details. The native owner still implements authoritative Pause/Resume, Stop semantics and permission recovery. The shared issue composer owns actionable faults; moving controls must not obscure ongoing recovery or imply diagnostics export completed when only a chooser opened.

Move the existing Clear review into Advanced using its exact local/pinned/filtered scope and no-Undo semantics. Provide the future identity-reset task location only when its durable operation and recovery are ready; no inert or falsely functioning reset button is part of this package. Retain Chrome's working log-level behavior and all applicable runtime-specific actions. Settings categorization must not silently remove a control because the prototype omitted it.

**Acceptance:** empty/dense relays, long names/endpoints/IDs/errors, theme/text changes, Add/Edit/Retry/Remove with retained drafts and partial failure, categories across resize and native IME, and direct access to routine settings without traversing every device. Use controlled authentication outcomes; actual sign-in remains deferred under its existing owner. Category rendering does not qualify account operations or native continuity.

**Allocation:** E14/C14/A05/A16; contributes C03/C15 and correct Advanced placement of E09. The repaired styling remains band 1; full organization is band 2. This package consumes theme and real setting actions below rather than defining another preference store.

## Real local retention and Clip Sharing Lifetime

**Outcome:** both settings change the behavior they name, with distinct labels and actual persisted/runtime results. This is an independently verifiable settings step, allowed alongside C02's replacement work.

Local retention already exists in [the History interface](../../packages/core/history/store.ts) and runtime bridges. Its production default is 30 days and maximum is 365 days; current normalization accepts finite nonnegative values and caps at the maximum. Preserve valid saved values outside the existing 7/30/90/365-day presets, including truthful representation of zero, rather than silently replacing them with a preset. No forever or capacity-limit control is introduced. The unchanged [retention contract](../clip-history/spec.md#local-retention) applies immediately to existing unpinned records from their original local `firstStoredAt`; pins are exempt, increases do not restore removed history, and removal/suppression stays atomic.

Zero retention makes unpinned records immediately eligible for pruning; it must never be labelled as forever or retention disabled. Show the actual normalized/applied value returned by the owning module.

Show applied retention and cleanup/persistence failures truthfully. The current bridge can complete cleanup before a later preference persistence error: do not promise that a rejected save restores deleted records. Reconcile actual policy, storage and History, using the correctness results/feed and recovery owner. Chrome's session-only pin constraint remains visible and unchanged.

Clip Sharing Lifetime is a separate installation preference already required by [Clip semantics](../clip-history/spec.md#historical-import). The [model](../../packages/core/models/Clip.ts) defaults to 24 hours, with a 30-day production maximum; [creation validation](../../packages/core/clipboard/normalize.ts) requires a positive safe-integer duration within the configured bound. It has no never-expires value and affects only new Clips. Existing `shareExpiresAt` values remain immutable; expiry limits sharing and does not delete retained History. Maximums remain deployment configuration, not user-editable settings.

Add validated storage/state/actions in every runtime, load the applied value before capture becomes ready, and supply the existing capture-time getter to [the runtime clipboard factory](../../packages/core/runtime/clipboard.ts). Do not recreate networking or invent another Clip creator for this preference. Cover ordinary capture, retained-Clip Copy/reuse, current-clipboard Send and Android explicit ingress through their actual creation paths. A pending capture retry keeps the lifetime fixed when that event was created; receipt/import/forwarding cannot restart it. Preserve installation preferences across Identity Rotation and coordinate with the separately planned manual-reset lifecycle.

**Acceptance:** default/boundary/invalid settings, valid nonpreset retention, cross-view updates, failed persistence/cleanup, restart and identity-independent persistence. Observe actual unpinned cleanup, pins and suppression; verify serialized new Clip `capturedAt`/`shareExpiresAt` values from every affected runtime path, setting changes between events, pending retry, and unchanged pre-existing/imported Clips. Preference JSON or select-control values alone are insufficient. Reuse History backend conformance and runtime clipboard-action tests; add only tests that exercise real integration gaps.

Existing [capture coordinator](../../tests/core/clipboard/captureCoordinator.test.ts), [explicit action](../../tests/core/clipboard/explicitActions.test.ts) and [History store](../../tests/core/history/store.test.ts) tests provide behavior seams; each new runtime supplier must also be exercised through its real factory composition.

**Allocation:** C02 closure owner collects the already-approved inactive Expiry/type-control removal plus functioning retention/lifetime replacement. Clip Sharing Lifetime remains a separate approved addition, not a new runtime finding. Old `expiryDays` must not silently be interpreted as sharing lifetime or the already separate local-retention value. Preset presentation is implementation tuning within these existing semantics, not an unresolved product decision.

## Shared modules and migration outputs

The module names describe responsibilities; final filenames belong to execution tickets. Keep domain authority in core/runtime modules and host adapters, with presentation in `packages/ui`.

| Shared module / seam | Responsibility and consumers |
| --- | --- |
| Local icon/control/style modules | One action vocabulary, semantic visual roles and interaction affordances; explicit imports by each host, without global host-sizing side effects. |
| Theme consumer and preference adapter | Resolve applied mode and System appearance in all surfaces; persist through the existing runtime settings authority. |
| Workspace/task presentation | Render the existing session's destination/query/task; use native bounds and the existing task focus owner. Never own duplicate drafts or mutations. |
| History list/card/detail and preview modules | Render authoritative selected Clips; grapheme-safe previews, exact full values and existing Copy/Pin/Delete results. |
| Connection presentation module | Derive one consistent S2 state/panel and device text from public facts; no network execution or new health database. |
| Devices and Settings presentation | Compose existing action/result/task modules; expose alias clear and new real preferences through affected bridges. |

Use Electron as the first concrete reference consumer where it makes a shared change easiest to verify, then exercise that same slice through Android and both Chrome surfaces. This is an inspection order, not permission to leave changed shared contracts incompatible with live consumers. Android host hooks land with affected tasks; Chrome options gets explicit styling early and later becomes the complete canonical shared management consumer. Avoid a disposable options redesign or copying prototype state/fixtures into production.

Chrome full-page parity and authenticated handoff remain the approved correctness package's ownership. Workspace supplies usable details, navigation and task content before their cutover, independently of final density polish. Full-page must have required live state/actions/errors/drafts/focus, current request validation and stale-target handling before moving long popup tasks. Preserve old working controls until that gate passes; then retire the duplicate options History/settings components, obsolete popup long-task paths and superseded CSS. Full-page never inherits popup focus capture or popup-only Send authorization. Direct opens use the approved default destination; no query/hash router is added.

## Finding allocation and completion ownership

These are proposed closure collectors for final consolidation, not claims that findings are fixed. Each collector must gather all contributing correctness/native/workspace results before closure.

| Primary workspace findings | Proposed collector |
| --- | --- |
| E01, C03, A04, A11 | Local assets/controls/host styling. A04 also consumes native continuity controls. |
| E13, C05 | Persisted theme and readable common controls. |
| E03, E04, E06, E07, C06, A10, A14, A15, A18 | Responsive navigation/task presentation and reflow; collect correct query/session/focus and native input/bounds. A10 includes pending access; A18 includes final QR sizing and separate native qualification. |
| E08, E15, C13, A12 | History/details/density. |
| E12, E16 | Devices/Requests. E12 collects pending-entry checks and separately records native notification qualification; E16 collects S2 projection and safe previews. |
| E14, C14, A05, A16 | M3 management organization and compact continuity presentation. |
| C02 | Working retention/lifetime plus earlier removal of ineffective controls. |
| C15 | Visual integration collector in the shared-assets package; all host/History/management portions required. |

This assigns **27 workspace-primary findings: 15 band 1 and 12 band 2**. The other **15 correctness-primary** findings remain E02/E05/E09/E11, C01/C04/C07/C08/C09/C10/C11/C12/C16 and A13/A17. The **nine native-primary** findings remain E10/E17 and A01/A02/A03/A06/A07/A08/A09. Together they account for the existing 51 once. Workspace task styling, diagnostics bounds or Advanced placement may support those owners but does not transfer their state/action/native closure responsibilities.

The three additions stay separate: alias clearing here with Devices; Clip Sharing Lifetime here with real settings; manual Generate new identity with its dedicated lifecycle ticket. No new finding or product feature is inferred from a mockup. The final planning ticket will make the concrete execution-ticket ownership and dependencies authoritative.

## Candidate verification and cutover gates

- Exercise real shared consumers and affected runtime adapters, not helper-only tests while old broken callers remain. Meaningful cases include theme application/failure, status precedence, preview integrity, actual task/draft preservation, field-scoped preference writes, real new-Clip metadata and retained History after mutations.
- Measure the [accepted layout matrix](../ux-study/layout-state-contract.md#implementation-acceptance-matrix) with the [native profiles](native-host-delivery-proposal.md#native-acceptance-profiles-and-retained-gaps): narrow/320px, phone, landscape/short, restored/wide, maximized/fullscreen, actual popup and full-page; default/intermediate/200% text and supported text spacing; long/dense/empty/error states. Verify both sides and the exact chosen responsive boundaries. Use pairwise combinations plus known worst cases, expanding for failures.
- Keep branding above Search, one S2 icon, no duplicate All/Pinned, visible Copy/Pin, equal wide cards and no permanent side panel. Verify actual scroll ancestors, fields/actions in bounds, full-value inspection, focus/targets and cold offline assets across themes. Quiet styling must still meet the selected contrast/focus criteria.
- Preserve all previously working runtime capabilities and all approved failure/partial-effect semantics. A completed full-page replacement is required before retiring popup management; a source-link or visually complete empty shell does not meet parity. General Settings placement alone does not implement retention/lifetime or manual reset.
- Run targeted affected tests and `npm run verify` on the integrated candidate, with `npm run check` before code commits and Standards/Spec review under [workflow](../../docs/agents/workflow.md). Native packaging/input/clipboard/notification checks remain separate; record exact revision, dirty state, runtime and evidence type. None was run for this planning document.
- Carry the [native gap ledger](../ux-study/remaining-native-coverage.md) exactly. Existing prototype captures are design evidence, not candidate acceptance; permission/account/hardware/assistive gaps are not passes. Old clipboard/display intervals stay closed; Google sign-in remains deferred. Block only the qualification that actually lacks its prerequisite, leaving unrelated work independently verifiable.

## Decision status

The user accepted the eight packages, staged cutover and proposed closure collectors; the canonical resolution is recorded in [Plan compact workspace and routine control delivery](issues/05-plan-compact-workspace-and-routine-controls.md#answer). The accepted visuals, action semantics, priority order and coverage dispositions remain settled. Final consolidation will assign execution tickets; this decision does not authorize implementation or resolve the remaining lifecycle/validation decisions.
