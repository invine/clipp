# Shared state, actions and task interfaces

Approved 2026-10-10 in [Define shared state, actions and task boundaries](issues/02-define-shared-state-actions-and-task-boundaries.md#answer), with explicit Save overwriting the latest edited-field value. **Approved planning contract.** This supports the approved [first correctness milestone](first-correctness-milestone.md). It specifies interfaces and ownership for later implementation, not completed repairs or native acceptance.

## Approved direction

Keep authoritative data in the existing runtime modules. Share an ordered state feed, honest asynchronous action results and one UI session owner above responsive layouts. Each host supplies its real capabilities, navigation entry and native input/lifecycle adapter. Reuse Chrome's canonical options page as full-page Clipp, with destinations delivered through authenticated messages rather than URL routes.

The user settled all three decisions:

1. **Shared interfaces:** adopt the module responsibilities and guarantees below, retaining intent-specific actions and existing domain modules. No new application-wide command framework is required.
2. **Chrome reuse:** reuse an idle, ready full-page tab; if the available page has an active editor/task or in-flight mutation, open another canonical tab. This protects current work without another prompt, at the cost of occasional extra tabs. Do not suspend an occupied task to replace it with the new destination.
3. **Concurrent edits:** retain a dirty draft when the same field changes elsewhere; explicit Save applies the user's edited-field values over the latest values without a conflict-review prompt. Preserve unrelated fields from authoritative state. The user selected this over the recommended review-before-overwrite alternative.

The accepted Back/Escape/Close retention, session-only lifetime, popup allocation and layout choices are inputs, not questions to ask again.

## Ownership and small interfaces

Names below describe approved module roles; filenames can be finalized with delivery tickets. No React, DOM or navigation types belong in core.

| Module / location | Interface and responsibility | Excludes |
| --- | --- | --- |
| Existing runtime/domain modules in `packages/core`, composed by each runtime | Own persisted settings, Clipboard History, membership, Pairing and relay state. Validate mutations and publish actual changes. | A second product database in the UI. |
| Ordered public-state module at `packages/core/runtime` | Coalesce invalidations, read/project state, attach authority session/revision, and publish ordered snapshots through existing host adapters. | Atomic transactions across unrelated stores; application-wide command scheduling. |
| UI runtime adapter in each app | `observe(listener)` delivers initial and later state through one ordered path; `refresh()` reconciles; typed action methods return promises; host capabilities declare real direct/routed/unavailable actions. | Catch-and-ignore errors, no-op actions, or capability flags treated as authorization. |
| Shared UI session module in `packages/ui` | Own destination, query/filter scope, task stack, session drafts, pending feedback and logical focus/scroll anchors. Expose typed open/back/dismiss/discard/update-draft operations. | Persisted domain data, credentials, cryptographic material, or durable operation recovery. |
| Shared task presentation in `packages/ui` | Render the same task as a narrow full-screen view or comfortable dialog; manage DOM focus, one task scroller, accessible titles/actions and local errors. | Creating a new draft merely because presentation changed. |
| Host navigation/input adapter in each app | Deliver external destinations after UI readiness; coordinate native Back/IME, scanner lifecycle, window focus and safe content bounds. | Inferring that hiding a task cancels a submitted operation. |
| Chrome destination coordinator in `apps/extension` | Validate destination messages, select/create the full-page tab, retain a pending handoff until acknowledged and target its authenticated page connection. | URL routing, content-script navigation, editor-draft persistence, or new clipboard capability. |

These seams already have multiple real consumers. Deleting the ordered feed would spread race handling back across three runtime adapters; deleting the UI session would spread draft/navigation rules back across every responsive task. A generic command bus or duplicate application store would add little useful depth.

## Ordered state and mutation authority

A conceptual state envelope is `{ sessionId, revision, state }`. The runtime authority assigns the session and monotonically increasing revision; consumers never manufacture freshness from response arrival time.

- Register the observer before requesting its initial snapshot. Deliver bootstrap, refresh and later updates through the same path, with explicit loading/ready/refresh-error state. Keep usable prior data during a refresh; an unavailable bridge is not empty History.
- Serialize/coalesce projection reads. If a known visible change occurs during a read, discard or repeat that projection before publishing it as current. An old read cannot acquire a new revision merely because it finished late. This is ordered, eventually reconciled state, not a transactional snapshot across History, membership and networking.
- Ignore older revisions within the authority session. On a worker/runtime restart, establish a new session through the current adapter connection/handshake; late replies from the old connection cannot switch it back. A session change is distinct from Identity Rotation.
- Invalidate after all visible changes: additions/imports, Delete/Clear, pin/unpin and resulting removals, retention cleanup, settings, names/aliases, requests/membership, identity recovery and relay/connection status. Add a general History change subscription at the store seam; keep `onNew` for existing addition-specific behavior. Include reconciliation after failures with possible partial effects.
- Derive visible History from the accepted snapshot and current query/scope. The existing projections export all retained Clips, so the first migration can reuse that model. Separate legacy search callbacks cannot replace newer data. Any later pagination needs its own revision-bound query contract; it is not introduced here.
- Share public data types as needed at the core/runtime seam and re-export existing UI types during migration. Native handles, private keys and relay credentials stay out of public projections. A per-runtime optional feature must be represented as unavailable or unknown, never fabricated as success.

Settings actions write only intended fields. Use one persistence path for each field and serialize conflicting writes at its owning module; do not hold unrelated work behind a network operation. Chrome preference integrity can retain current message names while fixing this behavior.

Keep dirty fields separate from current applied data. An external update does not replace the draft; explicit Save submits only the edited fields and applies them over their latest values without a conflict-review step. When valid saves overlap, the latest successfully applied write at the owning module wins for those fields. A saved draft must not write untouched stale fields or replace a stale whole settings/relay list. Replace-whole-list relay updates must become entity/field-scoped mutations or an equivalent merge into current state at the owner, serialized with other mutations.

Base values may track which fields were edited; they are not ordinary same-field conflict preconditions. Normal validation, current-identity checks and target existence still apply: a deleted entity cannot be recreated by stale Save. The separate incoming-request version guard below remains required because approving a replaced request is not an ordinary form-field overwrite.

Immediate switches show the latest applied value and separate pending intent; they do not resend a stale form object. On a lost reply, refresh before offering another possibly duplicating mutation. The first milestone does not need to migrate every editor to realize field-scoped Chrome writes.

## Actions report what actually happened

Retain intent-specific methods such as setting Auto Sync, deleting a Clip and submitting a Pairing Target. They return awaited, serializable results, for example `{ ok: true, value }` or `{ ok: false, error }`, where the value/error is specific to that action. An adapter normalizes IPC/message failure as **outcome unconfirmed**, rather than pretending it is a known no-change failure. Do not invent a universal transaction/rollback promise.

Results control task feedback; ordered snapshots control displayed authoritative data. If an action supplies a reconciliation watermark, it must identify a post-action authoritative projection, never just a revision observed before the action. Its reply must not overwrite a newer snapshot. A successful refresh alone cannot prove that an unacknowledged Send or clipboard write happened; current state and that action's outcome may have different certainty. Pending state is keyed by action and target, preventing ambiguous duplicate submissions without freezing unrelated controls.

| Action | Required result meaning |
| --- | --- |
| Preference/name/alias | Applied value, validation failure or unavailable target; retain an unsuccessful draft. Explicit Save overwrites the latest edited-field value without conflict review. A later persistence/publication error can require reconciliation. |
| Clip Copy | Preserve `complete` and `copied-without-clip`; successful clipboard write with failed capture is a partial outcome, not a reason to automatically copy again. |
| Send | Distinguish failed clipboard read from failed save/share. Queuing or local capture is not remote delivery. Full-page Chrome cannot invoke popup-only current-clipboard Send. |
| Delete/Clear/unpin/retention | Refresh actual History and policy state, including partial cleanup effects. Preserve local-only deletion, suppression, Clear's durable-before-pending ordering and the absence of Undo. |
| Submit Pairing Target | Validation/submission result and waiting state, not completed Pairing. Preserve failed input; dismissing the task does not cancel the Trust Request. |
| Approve/reject | Local decision handled, no longer actionable, conflict with a replaced request, or actual failure/effects. Local Admission and a best-effort response are not proof of remote receipt. |
| QR generation and payload Copy | Ready image or valid text-only fallback; generation failure and Copy failure are separate. Payload Copy writes text and reports that result without invoking explicit retained-Clip reuse or Share Now. Ordinary clipboard capture policy remains unchanged and may observe the copied text. |
| Relay edit/remove/login | Actual configuration/authentication state and possible partial effects. Opening a login browser is not completed login; removing a credential does not roll back because a later configuration write failed. |

For incoming approval, include an opaque local version of the stored request envelope in the public request reference and compare it inside the coordinator's serialized decision against the current stored request. Identical retransmissions retain that version; a replaced envelope changes it. This prevents an old open review from approving a replacement request for the same Peer ID. It does not put new fields on the protocol, authorize a sender or correlate outgoing Trust Responses. Missing/stale targets lead to the appropriate list and explanation, not an endless Retry.

An unconfirmed action keeps recovery visible until refreshed or otherwise resolved by its owner. Do not blindly repeat non-idempotent actions. Navigation remains possible unless an existing operation contract requires a blocking recovery surface; Close is never presented as rollback.

## Pairing outcome presentation and issues

Extend the existing Pairing runtime coordinator with a bounded, memory-only projection of the latest observed outcome per target, associated with the current identity/runtime session. It can show a validated accepted/rejected response or a locally ended waiting interval with no response observed, alongside authoritative ongoing admission-persistence recovery. Explicit dismissal may clear a terminal informational record; it cannot remove active waiting/recovery state or hide an actionable fault from its task/issue summary. Later authoritative outcomes may replace earlier records. Runtime restart does not promise restored outgoing waiting/outcome history.

[Stateless signed Trust Requests](../../docs/adr/0005-use-stateless-signed-trust-requests.md) remain authoritative: an older valid rejection can clear waiting, while a later valid acceptance may still establish membership. UI operation IDs never become authorization, cancellation or replay-correlation rules. Current Device Membership is authoritative; outcome text must not contradict it. Waiting expiry is not a claim that the other device rejected the request.

The current pending coordinator swallows response-delivery errors by design. Its successful local decision cannot be reinterpreted as delivery success, and this plan adds no response retry job. A thrown failure after Admission can instead come from later cleanup/publication. Reconcile what changed.

Shared issue presentation derives stable, scoped issues from actual runtime faults and action outcomes. Keep task-blocking explanations at the task, coalesce repeated instances, expose remaining unresolved issues through the approved compact summary, and avoid counting routine S2 connection status as another global warning. Dismissing a message does not declare its source fault resolved. Technical details remain expandable within the same bounded surface.

## UI session and host task contract

Create one UI session above responsive branches per live renderer, WebView or full-page document; the popup has its own shorter-lived session. Key a draft by task kind and entity, retaining raw fields, edited-field tracking, validation and unsaved status. Keep only logical focus keys and scroll anchors in session data, not DOM nodes or native handles.

| Transition | Required behavior |
| --- | --- |
| Resize, text enlargement, rotate | Re-present the same task/draft and operation state. Preserve query/scope, selected destination and sensible focus/scroll; do not reset an editor on remount. |
| Back / Escape | Return one subtask level; retain its draft. At the task root, dismiss it and restore its origin. Menus and exclusive overlays handle their own dismissal first. |
| Close | Dismiss the current task while retaining the applicable session draft. It does not cancel a started mutation or submitted Trust Request. |
| Cancel / Discard | Clear the applicable unsubmitted draft explicitly. Post-start cancellation is offered only if the actual operation supports it. |
| Save | Apply the edited fields over their latest values without conflict review and await the real result. Clear/reconcile the submitted draft only after confirmed application; retain it on rejection or an unconfirmed outcome. Protect newer input from a late completion. |
| External state update | Refresh applied data and untouched fields; preserve dirty fields for an explicit Save. Invalidate a removed/expired target with a clear return path. |
| Notification | Show/focus the host, then open Requests after readiness and state reconciliation. It need not identify a particular request; an empty list is valid. |
| Runtime reconnect | Re-establish authority; retain the live UI session where the document survives, but revalidate targets and pending outcomes. Identity Rotation clears identity-bound work. |

No draft persistence is promised after popup destruction, renderer/WebView destruction, page reload or app restart. Electron hiding its still-live renderer can retain the session. Accepted identity reset/recovery is a separate durable operation owned by [Design the durable manual identity-reset boundary](issues/06-design-durable-manual-identity-reset.md), not a draft in this module.

Focus enters the active task and returns to its logical invoking control, or a sensible page/list fallback if that control vanished. Opening the Pairing chooser does not summon the keyboard; choosing Paste or an editor may focus its field. Narrow tasks own the safe content area and a vertical scroller; comfortable dialogs use the same task content and focus rules.

Android host handling must consume Back once: IME dismissal first when visible, then active scanner/overlay, task parent, and finally normal root-app behavior. The scanner interface returns a scanned payload, user cancellation, or a typed permission/device/decode failure; cancellation is not an error, and camera failure must not become a silent `null`. Scanner cancellation needs an explicit host handle or abort signal: settle once, stop camera tracks/animation work, remove the overlay and ignore late camera/decode results. It cancels capture only, not an already submitted Trust Request. Safe insets and keyboard geometry come from the native host and are qualified in native planning; browser history alone is not native Back handling.

## Chrome destination handoff

Keep full-page Clipp at exactly `chrome.runtime.getURL("src/options.html")`, as declared in the [manifest](../../apps/extension/manifest.json). Destinations are allowlisted data, such as History, Clip details plus Clip ID, Requests, Pairing, Devices or a Settings category. Include relevant validated query/filter context and a unique handoff ID; exclude Clip bodies, whole history, credentials, arbitrary URLs and editor drafts.

1. The background accepts a navigation request only from the exact trusted popup/options page, using actual sender metadata and the existing extension-ID check. Native notification selection calls the same host coordinator internally with Requests. It does not fabricate a popup sender.
2. Persist a bounded, expiring unconsumed handoff in trusted `chrome.storage.session` before acknowledging ownership. The popup can then disappear. This mailbox is for navigation, not persistent drafts or a new operation queue. Failure before acceptance is reported while the source is available; an accepted but failed navigation remains recoverable through a small host interface to read handoff status, retry that handoff or dismiss its notice, available when a trusted popup/page next opens. Distinguish accepted/pending, applied, failed and outcome-unconfirmed; retry reconciles the original handoff before creating another tab. Do not silently discard unresolved failures at expiry: retain a bounded failure notice until handled within the browser session.
3. Full-page documents register through a named `runtime.Port`, verified by actual sender ID, exact URL and page/tab identity. The coordinator selects a ready suitable tab, or creates the canonical page and waits for readiness. It delivers only to the selected connection and activates its tab/window. Never reload an existing page to navigate it.
4. **Approved reuse rule:** prefer a suitable idle page in the source window, then another ready idle page; if all are occupied, create a new tab. The destination itself must atomically accept or decline reuse based on current task/editor/pending state, so a stale idle advertisement cannot displace work. An already-open matching destination means the same current task/target and may simply be focused, preserving its existing query/draft; differing incoming context cannot bypass the occupied-page rule. Suspended drafts remain intact; repeated or duplicate handoffs must not duplicate tasks.
5. The destination waits for usable authoritative state, validates the target, adopts only relevant incoming context and acknowledges the handoff. Preserve its other page contexts/drafts. If a Clip/request disappeared, display the unavailable explanation and History/Requests route. Changes after opening are handled by the same live state feed.
6. Reconnect after worker loss and reconcile the pending handoff with page acknowledgements; do not rely on a Port keeping the worker alive. Expire/clean consumed, abandoned or closed-tab records. Bound retries and recover uncertain tab-creation outcomes before creating again. Delivery may repeat, so applying a handoff is idempotent; no exactly-once tab-creation guarantee across host failure is claimed.
7. A page opened directly without a valid pending handoff uses the normal default destination. Browser Back is not the task stack; the app's explicit Back/Escape/Close controls own internal navigation. No query/hash router or bookmarkable task URLs are introduced.

Chrome documents [runtime messaging and ports](https://developer.chrome.com/docs/extensions/develop/concepts/messaging); [`tabs` messaging targets content scripts](https://developer.chrome.com/docs/extensions/reference/api/tabs), so it is not the page-delivery mechanism. [`storage.session`](https://developer.chrome.com/docs/extensions/reference/api/storage) is memory-backed, trusted-context storage by default; it survives worker memory loss but not browser restart or extension reload/update/disable. These documented facilities support the planned adapter; they do not establish its runtime acceptance. Retain message-listener compatibility with the manifest's minimum Chrome version rather than assuming recent promise-listener behavior.

Keep [management sender authorization](../../apps/extension/src/managedRelayUi.ts) separate from [popup-only Share Now](../../apps/extension/src/popupClipboardActions.ts). Reject query/hash variants, lookalike pages and content-script/offscreen senders where those gates require canonical UI pages. The full-page wrapper must not inherit the popup's automatic focus capture. Shared UI rendering never grants host authorization.

## Source anchors and migration

| Existing source | Constraint for delivery |
| --- | --- |
| [ClipboardApp props/state](../../packages/ui/src/ClipboardApp.tsx), [relay editor](../../packages/ui/src/ManagedRelaySettings.tsx) | Reuse action seams and task content. Move draft ownership above responsive mounts; stop swallowed errors and premature input clearing. |
| [Runtime contract](../../packages/core/runtime/contract.ts), [orchestrator](../../packages/core/runtime/orchestrator.ts), [History store](../../packages/core/history/store.ts) | Introduce ordered observation/change invalidation without replacing core persistence or transport. |
| [Electron renderer](../../apps/electron/src/renderer.tsx), [preload](../../apps/electron/src/preload.ts), [main](../../apps/electron/src/main.ts) | Adapt IPC state/actions, add queued destination entry and preserve CommonJS/relative shared imports. |
| [Chrome background](../../apps/extension/src/background.ts), [popup](../../apps/extension/src/popup.tsx), [options](../../apps/extension/src/options.tsx), [History](../../apps/extension/src/components/ClipHistoryList.tsx) | Replace independent stale projections, patch settings, normalize callbacks, then consume complete shared management before retiring old paths. Background still owns credentials; offscreen still owns networking. |
| [Android client](../../apps/android/src/client.ts), [entry](../../apps/android/src/main.tsx), [scanner](../../apps/android/src/qrCameraScanner.ts), [Activity](../../apps/android/android/app/src/main/java/com/clipp/app/MainActivity.java) | Adapt client state/actions; connect host destinations, Back/IME and scanner cleanup. Keep diagnostics within task bounds. |
| [Runtime capabilities](../../packages/core/runtime/capabilities.ts) | Its legacy fixed relay-address flag does not mean managed relays are uneditable. Declare actual surface capabilities separately; preserve session-only Chrome pinning. |
| [Pending approval](../../packages/core/pairing/pending.ts), [runtime Pairing](../../packages/core/pairing/runtimeCoordinator.ts), [relay mutation](../../apps/extension/src/managedRelayConfiguration.ts) | Preserve stateless authorization, best-effort response semantics and partial effects. |

Introduce these guarantees flow by flow. A transitional adapter may feed existing props; changed shared contracts include every affected bridge and consumer in that slice. Chrome-only preference fixes need no artificial edits to other hosts. Complete the full-page state/action/error/draft/focus surface before redirecting long popup tasks; retain working old controls until then. The approved compact workspace and identity-reset internals remain with their owning planning tickets.

These are implementation interfaces, not new domain concepts. The glossary and accepted ADRs require no change for this contract. Clip identity, Copy/Send, Device Membership, stateless Pairing and single-session relay transport fallback remain unchanged.

## Verification owned by these interfaces

| Owner / test seam | Required examples |
| --- | --- |
| Core ordered-state module + each host adapter | Late bootstrap after newer mutation; invalidation during read; old authority session after reconnect; failed refresh retains data. |
| History change interface + UI derivation | Add/import/Delete/Clear/unpin/retention under active query; no stale result resurrects deleted data; empty versus no-match. |
| Mutation owner + adapter results | Different-field edits preserve each other; an external same-field update preserves a dirty draft, then explicit Save overwrites that field without a prompt; latest applied overlapping Save wins. Also stale/deleted target, missing reply, partial settings/retention/relay effects and no duplicate retry. |
| Pairing coordinator + all consuming bridges | Missing/expired/replaced request; Admission followed by cleanup failure; best-effort delivery is not remote success; valid rejection then later acceptance; waiting expiry is not rejection. |
| Shared UI session/task presentation | Responsive remount and failed Save preserve fields; late success preserves newer edits; Back/Close retain, Discard clears; focus returns after target removal; active and suspended drafts survive destination changes. |
| Chrome navigation adapter | Exact sender rejection cases; popup disappears after acceptance; new/reused/busy tabs; worker interruption and duplicate delivery; lost acknowledgement; stale destination; two rapid destinations; no full-page Send or automatic focus capture. |
| Native host adapter | Warm/cold notification entry to Requests; real IME-first Back; scanner cancellation with late completion; safe task bounds and meaningful focus/scroll restoration. |

Use controlled interface tests and actual candidate rendering/native-input checks for changed hosts. Routine tests cannot qualify OS notifications, permission recovery, physical displays or account login. Preserve every exact unverified case in the [coverage ledger](../ux-study/remaining-native-coverage.md). Later delivery tickets assign concrete candidate checks and dependencies; the final backlog reconciles this ownership rather than inventing it from scratch.
