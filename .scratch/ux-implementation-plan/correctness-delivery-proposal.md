# Correctness and recovery delivery

Prepared 2026-10-10 for [Scope correctness and recovery delivery](issues/03-scope-correctness-and-recovery-delivery.md#answer). **Approved delivery breakdown.** The user's acceptance is recorded in the linked decision. The [first milestone](first-correctness-milestone.md) and [shared interfaces](shared-interface-proposal.md) are approved inputs. These are work packages for final consolidation, not dispatched execution tickets or completed fixes.

## Recommended breakdown

Deliver the first milestone through six reviewable packages: Chrome preferences; live History/query reconciliation; Clear all; retained name/alias edits; immediate Pairing/approval results; and QR generation/Copy. Keep Clear all separate from History publication so its destructive-action review and recovery have an explicit acceptance boundary. Introduce reusable state/action/task primitives with their first working consumer, rather than a foundation-only change with no corrected behavior.

Follow with five first-band packages: session tasks and remaining editor recovery; actionable issue composition; Chrome automatic capture recovery; authoritative Pairing outcomes; and complete Chrome management with secure handoff. Related native and visual foundations remain first-band work under their owning planning tickets. This is the approved correctness-first sequence at finer resolution, not a new priority order or a claim that eleven packages finish the whole UX effort.

Exact filenames and final execution-ticket splits belong to [Finalize validation gates and the implementation backlog](issues/07-finalize-validation-and-implementation-backlog.md). Each package below has a corrected behavior, affected consumers, a regression seam and a finding allocation. Small internal commits are allowed; no step may ship a changed shared action while leaving a live consumer on incompatible semantics.

## First milestone packages

### Chrome preference integrity

**Result:** changing log level cannot resend an old Auto Sync value. Pending/applied/failed state agrees across popup/options and after reopen. Remove inactive Expiry and Text/Images/Files controls; retain working Auto Sync/log level.

**Scope:** Chrome options, popup and background; the reusable ordered-state helper and result normalization needed by these consumers. Field-scoped writes use one authoritative persistence path. A rejected or unconfirmed write is reconciled against actual persisted/active state rather than blindly restoring an old checkbox. The approved explicit Save rule applies only to edited fields; unrelated fields are preserved.

**Regression and acceptance:** exercise the actual settings-handler module with injected storage, live preference application and publication, not only the existing Auto Sync setter test. Run two open candidate views: disable Auto Sync, change log level elsewhere, reject a write, lose a reply, apply overlapping explicit edits, and reopen. Verify both final applied state and visible pending/error feedback. Preserve exact trusted sender checks.

**Allocation:** target complete C01/C10; C02's inactive-control removal only. Real retention/lifetime controls remain assigned to settings delivery. Source anchors: [options](../../apps/extension/src/options.tsx), [background](../../apps/extension/src/background.ts), [preference module](../../packages/core/runtime/autoSyncPreference.ts), [conformance tests](../../tests/core/runtime/autoSyncPreferenceConformance.test.ts). The current raw-candidate write followed by a second Auto Sync write is specifically in scope.

### Authoritative History and query reconciliation

**Result:** all open views reflect current retained Clips under their current query/scope after additions/imports, deletion, Clear, pin/unpin, capacity effects and retention cleanup. Loading, refresh failure, empty History and no matches are distinct.

**Scope:** the shared History change subscription and ordered publication; affected Electron, Android and Chrome publishers; Chrome popup/options consumers and shared query derivation. Preserve addition-specific `onNew`, storage policy, suppression and Chrome's session pinning. Every initial load/search/refresh path must obey the same authority/session ordering as updates.

**Regression and acceptance:** mutate through the real History interface with durable and session pin backends, then assert retained results and filtered views. Cover delayed bootstrap/search after a newer mutation, invalidation during an async read, unpin-driven removal, failed refresh and old-worker replies after reconnect. Repeat Clear/add/delete in two open Chrome views without reload. A notification/event count alone is not proof of correct visible History.

**Allocation:** target complete C09; supports E09 and E04's data semantics, but does not by itself make hidden Search visible. Sources: [History store](../../packages/core/history/store.ts), [runtime publication](../../packages/core/runtime/orchestrator.ts), [legacy Chrome History](../../apps/extension/src/components/ClipHistoryList.tsx), [backend conformance](../../tests/core/history/backendConformance.ts), [concurrency tests](../../tests/core/history/concurrency.test.ts).

### Explicit Clear all local history

**Result:** Clear has a consequence review naming pinned and filtered-out Clips, local-only deletion and no Undo. Cancel invokes no mutation; Confirm waits for the actual outcome and leaves query/scope and the resulting view truthful.

**Scope:** shared confirmation/action presentation and each existing Clear consumer in Electron, Android and Chrome. Keep the current working entry until full-page management is ready; final Settings → Advanced placement belongs to cutover. Introduce the accessible task frame needed by this review once and reuse it in later task work.

**Regression and acceptance:** cancel with pinned/filtered history, confirm, fail durable deletion, retry, and clear during an in-flight pending-capture retry. Preserve durable-history-before-pending-capture ordering and suppression-capacity failure behavior. Check one source view and another open Chrome view; controls and long review text must be reachable at the actual candidate size. Single Delete remains immediate with failure/Retry, without this confirmation or Undo.

**Allocation:** target complete E09 on current surfaces, with the final placement still outstanding. Sources: [shared action](../../packages/ui/src/ClipboardApp.tsx), [capture coordinator](../../packages/core/clipboard/captureCoordinator.ts), [Clear/pending regression](../../tests/core/clipboard/captureCoordinator.test.ts), [history failure policy](../../tests/core/history/backendConformance.ts).

### Retained Device Name and alias edits

**Result:** rejected/unknown saves keep raw editable input and useful recovery. Pending saves cannot produce ambiguous duplicates, and late completion cannot erase newer typing. An explicit Save overwrites the current values of only the edited fields without a conflict prompt.

**Scope:** shared editor/result handling and all affected Electron, Android and Chrome name/alias adapters, including current options behavior where present. Keep Device Name and Local Device Alias distinct. Normalize real promise/callback outcomes rather than returning early or swallowing failure. Add only the session/draft primitives needed by these edits; extend the same owner later.

**Regression and acceptance:** valid/rejected name and alias updates, normalization limits, external same-field update followed by explicit Save, preservation of unrelated state, unavailable/removed target, missing reply, and late success after new input. Verify authoritative results and nearby error/readable input in each changed surface. Do not re-create a deleted entity or transfer an edit across Identity Rotation.

**Allocation:** E11 name/alias portions; new Use device name/alias-clear control remains with routine control delivery. Sources: [shared editors](../../packages/ui/src/ClipboardApp.tsx), [identity presentation](../../packages/core/trust/identity.ts), [presentation tests](../../tests/core/pairing/presentation.test.ts), [Electron preload](../../apps/electron/src/preload.ts), [Android client](../../apps/android/src/client.ts), [Chrome background](../../apps/extension/src/background.ts).

### Immediate Pairing and approval outcomes

**Result:** read/decode/validation/submission failures remain failures, with retained input and a reachable next action. Approval reports handled, stale/unavailable or actual failure/effects; it never turns `false` or a lost callback into success.

**Scope:** shared Pairing/result handling, all three runtime wrappers and current Chrome options/import callbacks. Publish an opaque incoming request-envelope version and check it inside the serialized decision; update every live approval consumer before enabling that guarded interface. Identical retransmissions preserve the version. Contain Android diagnostics sufficiently for the repaired task to remain usable.

**Regression and acceptance:** invalid text and QR-import failure, rejected transport policy, explicit `ok:false`, missing runtime reply, admission-storage failure, expiry, replaced versus identical incoming request, and failure during post-Admission cleanup/publication. Confirm pending prevents duplicate submission and failed input remains editable. Do not weaken connection policy to make a rejection disappear.

The coordinator deliberately swallows best-effort response-delivery failure. Local approval is not remote receipt; do not add a response retry job, reverse Admission, or turn the incoming-review version into outgoing Trust Response authorization. These distinctions follow [stateless Pairing](../../docs/adr/0005-use-stateless-signed-trust-requests.md).

**Allocation:** immediate-result portions of C07/E11; supporting A13 and access/geometry repairs only. Waiting/terminal outcomes remain the later package below. Sources: [pending coordinator](../../packages/core/pairing/pending.ts), [pending tests](../../tests/core/pairing/pending.test.ts), [runtime conformance](../../tests/core/runtime/pairingConformance.test.ts), [Android task wrapper](../../apps/android/src/main.tsx), [Chrome options](../../apps/extension/src/options.tsx).

### Truthful QR generation and payload Copy

**Result:** generation has pending/ready/error/Retry; failed generation never leaves an empty Hide state. A valid oversized-target text fallback remains usable. Copy reports the actual write result and its uncertainty accurately.

**Scope:** existing shared QR actions and the separate options implementation, plus adapters affected by changed result types. A late generation result cannot overwrite a newer identity/target/request context or unexpectedly reopen a closed task.

**Regression and acceptance:** deferred/rejected/no-target generation, valid image, oversized text fallback, repeated Retry, close/change context while pending, clipboard rejection and missing acknowledgement. Exercise the actual UI action through controlled generation/clipboard ports and candidate rendering. Payload Copy does not invoke retained-Clip reuse or Share Now; ordinary capture may observe the copied text. Do not automatically retry an unconfirmed write or call it completed Pairing.

**Allocation:** target complete C08 for generation/feedback on current surfaces. Full scanner, QR focus, native geometry and permission qualification are separately owned. Sources: [QR module](../../packages/core/pairing/qrCode.ts), [QR tests](../../tests/core/pairing/qrCode.test.ts), [shared app](../../packages/ui/src/ClipboardApp.tsx), [options](../../apps/extension/src/options.tsx).

## Remaining first-band correctness packages

### Session tasks and remaining editor recovery

Build on the retained-edit and accessible task primitives. Move all applicable relay/name/alias/Pairing drafts above responsive mounts into the approved session owner. Cover Back/Escape/Close retention, explicit Cancel/Discard, late Save, selected task, query/scope and logical focus/scroll context. Include existing relay Edit/Remove/Login/Retry result handling and entity/field-scoped mutations, preserving the approved explicit overwrite rule and independent configurations.

Test remount/resize, navigating away and reopening a draft, failed save, new input during save, unrelated and same-field updates, removed targets, and relay credential removal followed by persistence failure. Reconcile actual configuration/credential/session effects. Opening a browser or portal is not successful authentication, sign-out or account-wide revocation. Use controlled auth outcomes and retain the deferred real-account qualification.

**Allocation:** target E05 and the remaining editor/relay portions of E11; E04 query retention only. Supports C12, whose complete repair still requires full-page cutover. Shared keyboard/task behavior contributes to E06/C06, with actual host focus/Back qualification owned by native planning. Sources: [relay editor](../../packages/ui/src/ManagedRelaySettings.tsx), [relay action helper](../../packages/ui/src/managedRelayAction.ts), [Chrome configuration mutations](../../apps/extension/src/managedRelayConfiguration.ts), [mutation tests](../../tests/extension/managedRelayConfiguration.test.ts), [shared-interface contract](shared-interface-proposal.md#ui-session-and-host-task-contract).

### Actionable issue composition

Replace competing fixed recovery rows with the approved scoped issue model, compact summary and task-local errors. Coalesce repeated instances without losing another unresolved problem. Dismissal does not declare a fault resolved, hide active recovery, or turn a connection icon into a delivery receipt. Technical diagnostics expand inside the bounded task rather than above a full-height app.

Test simultaneous History, Pairing, initialization and relay problems; stable issue identity/deduplication; local and global recovery routes; long errors; normal/enlarged text; and the actual short popup host. Keep ordinary disconnected Trusted Devices and intentionally empty relay configuration out of fault counts. Preserve existing operation-specific retry/dismiss rules, including copied-without-clip and pending capture recovery.

**Allocation:** target E02/C04/A17 and the error/diagnostic containment portion of A13. Android safe-area/keyboard behavior stays with native planning. Sources: [current shared notices](../../packages/ui/src/ClipboardApp.tsx), [Android diagnostics](../../apps/android/src/main.tsx), [clipboard feedback](../../packages/ui/src/clipboardActionFeedback.ts), [feedback tests](../../tests/ui/clipboardActionFeedback.test.ts).

### Chrome automatic capture recovery

Expose ordinary focus-capture read health and background handoff failure/uncertainty in the popup, separate from connection status and manual Send. Keep focused reads and the existing background/offscreen write architecture. Retry is a deliberate ordinary observation through `clipboardUpdate`/`processLocalText`, not Share Now: it must not force a fresh Clip or bypass Auto Sync.

The current popup swallows read errors, sets its local observed-value reference before acknowledgement and ignores the background response. The background observation handler has no rejection response path. Repair that acknowledgement/error path and its UI state without adding persisted capture baselines or changing content-script policy. Empty/unchanged/baselined observations can succeed without a new Clip. A successful Copy write cannot clear a read-health failure merely because writing worked.

Test read rejection, repeated focus without alert storms, deliberate focused Retry, observation success with new/empty/unchanged text, background rejection/lost reply and popup destruction. Keep unconfirmed handoff distinct from a confirmed failed read; do not automatically resubmit it as a forced capture. Actual Chrome read/recovery requires a fresh isolated marker interval; simulated focus and mocked permissions are not OS acceptance.

**Allocation:** C16. Sources: [popup observation](../../apps/extension/src/popup.tsx), [background handler](../../apps/extension/src/background.ts), [ordinary observation versus Send](../../packages/core/clipboard/service.ts), [settled clipboard I/O](../extension-clipboard-io/spec.md), [clipboard conformance](../../tests/core/runtime/explicitClipActionsConformance.test.ts).

### Authoritative Pairing outcomes

Add the approved bounded per-target, current-identity/session outcome projection at the existing coordinator, with all consuming runtime state adapters and shared task presentation. Distinguish a validated response, membership-persistence recovery and waiting ending with no response observed. View dismissal cannot cancel the signed request or hide active recovery; current membership remains authoritative.

Test valid rejection followed by later valid acceptance, invalid/expired responses, local waiting expiry, failed Admission and recovery, dismissing terminal information versus an active fault, reconnect and identity reset/stop. Do not infer outcomes from disappearance from `waiting` or add persistent outgoing authorization. Verify the real current task can explain those states and retain its context.

**Allocation:** remaining C07 outcome portions and related E11/A13 recovery; final full-page presentation is integrated below. Sources: [runtime coordinator](../../packages/core/pairing/runtimeCoordinator.ts), [session tests](../../tests/core/pairing/session.test.ts), [coordinator tests](../../tests/core/pairing/runtimeCoordinator.test.ts). Complete two-native-app Pairing remains a separately identified candidate qualification, not a pass supplied by a protocol peer or state fixture.

### Complete Chrome management and secure destination handoff

Turn canonical `src/options.html` into a complete shared management consumer, then activate the approved authenticated destination coordinator. Include current required Clip details/Copy/Pin/Delete, Requests/approval, Pairing, name/alias editors, relay actions, functioning settings and Clear review; later new controls retain their own delivery owners. Reuse idle ready tabs, open another when occupied, and preserve matching tasks' existing drafts/context. Long popup tasks move only when this destination is functional.

Test full state/action/error parity; popup destruction after handoff acceptance; new/reused/occupied tab; stale Clip/request; target removal after opening; matching-task focus; worker interruption, duplicate/lost acknowledgement and failed-handoff recovery on reopen. Reject malformed destinations and invalid senders. Preserve exact canonical management URLs and the separate popup-only Send gate; full-page must not inherit popup focus capture.

The shared detail/task/navigation primitives needed for this functional cutover may land before the final wide-grid/density polish. Use the accepted components and layouts once, not a disposable options redesign. Keep current controls until parity checks pass. C12 is not solved by promising persistence for a destroyed popup.

**Allocation:** target C11/C12; integrates the Chrome presentation portions of C07/C08/E11. Supports later C13/C14/C15 without claiming complete density/visual acceptance. Native notification entry calls this Requests destination; actual OS delivery/selection stays with native planning. Sources: [manifest](../../apps/extension/manifest.json), [management gate](../../apps/extension/src/managedRelayUi.ts), [Send gate](../../apps/extension/src/popupClipboardActions.ts), [approved handoff interface](shared-interface-proposal.md#chrome-destination-handoff), [gate tests](../../tests/extension/managedRelayUi.test.ts).

## Integration dependencies

These edges name required outputs, not a mandate to stop independent preparation or to serialize every test in one package before beginning another.

| Consumer | Required output and reason |
| --- | --- |
| Authoritative History | Ordered-state helper and Chrome adapter lifecycle introduced with preference integrity; reuse one freshness mechanism. Other runtime adapters join when consumed. |
| Clear all final acceptance | History publication/query reconciliation so every open view reflects the result; confirmation development can proceed earlier. |
| Pairing/approval and QR feedback | Awaited-result and retained-input primitives first used by edits, or introduced alongside the first consumer if that avoids artificial blocking. No dependency on finishing unrelated name tests. |
| Guarded approval cutover | Incoming request-version publication, coordinator check and every live approval consumer together. |
| Session tasks | Current result semantics and the shared session owner; accessible task frame extended from its first review/editor consumer. |
| Final automatic-capture presentation | Scoped issue model. Read/error production can be developed against its narrow interface before the summary is complete. |
| Terminal Pairing presentation | Actual coordinator outcome events and ordered projection; never an inferred waiting-list disappearance. |
| Chrome management retirement | Complete state/action/error/session-draft/focus parity, secure handoff, and usable task/navigation primitives. Not dependent on final card-grid aesthetics or future identity reset. |
| Native task acceptance | Host insets/IME/Back/scanner/destination hooks plus the corresponding shared task consumer. The [native planning ticket](issues/04-plan-native-host-integration.md) owns concrete host packages. |

No first-milestone package depends on new identity reset, complete full-page routing, terminal outcome history, scanner-provider repair or successful relay sign-in. A supporting access defect that blocks the repaired action in its claimed surface is still part of that package's exit condition; do not declare unreachable recovery usable.

## Finding allocation and adjacent ownership

All 36 primary band-1 findings are accounted for below. A finding is complete only when all its allocated portions and applicable candidate checks pass. This table assigns responsibility; no finding is marked fixed during planning.

| Finding IDs | Candidate owner / remaining portion |
| --- | --- |
| C01, C10 | Chrome preference integrity. |
| C09 | Authoritative History and query reconciliation. |
| E09 | Explicit Clear all; final Advanced placement at Chrome/workspace cutover. |
| C08 | Truthful QR feedback; migrate unchanged behavior into full-page; native QR/scanner acceptance stays separately scoped. |
| E11 | Retained edits + immediate approvals + session/relay recovery. Preserve actual partial effects and any native/account qualification limits. |
| C07 | Immediate Pairing results + authoritative outcomes + functional Chrome task cutover. |
| E05 | Session tasks; verify real responsive/dismissal draft transitions. |
| E02, C04, A17 | Actionable issue composition, with each native wrapper rendering it correctly. |
| C16 | Chrome automatic capture recovery. |
| C11, C12 | Complete management and handoff, after shared session/task parity. |
| A13 | Immediate containment with first Pairing repair; full task-local diagnostics in issue composition. Native safe bounds/IME remain the Android host portion. |
| E04 | History/query and session retention here; visible Search/clear-query across resize in the workspace's first-band navigation/reflow foundation. Both are required. |
| E06, C06 | Shared task focus/dismissal integrated here; native keyboard/focus/lifecycle qualification under native planning; named/reachable navigation under workspace foundations. |
| E01, E03, E07, E13, C03, C05, A04, A10, A11, A14, A15 | [Workspace planning](issues/05-plan-compact-workspace-and-routine-controls.md) owns first-band local assets, readable theme/fields, navigation/targets and reflow foundations; native planning supplies actual Android target/text/inset checks. These are not postponed until cosmetic completion. |
| A01, A02, A03, A07, A08, A09 | Native planning owns insets, IME, Back, notification-permission recovery, scanner/provider diagnosis and safe media lifecycle. Shared tasks/issues consume those host hooks. |
| C02 | Inactive-control removal now. Working local retention and separate Clip Sharing Lifetime replacement stay assigned to workspace/settings and all required bridges; removal alone is not full closure. |

Band-2 pending indication (E12), final detail/density/Devices/Settings/status work and band-3 additions remain with their owning tickets. A Requests route can be built early without claiming complete pending-indicator or native notification acceptance. Alias clearing, lifetime and tray work may accompany their owner as already approved. No new production capability, terminology or ADR is required by this breakdown.

Final consolidation must name one closure owner for each split finding, collecting the other packages' evidence before marking it complete. In particular, retain joint outputs for E04 (data/context plus visible Search), E06/C06 (shared focus plus native/navigation checks), A13 (contained diagnostics plus safe host bounds), C07 (immediate results plus terminal/full-page behavior), E11 (edits, approvals and relay effects) and C02 (removal plus working replacement controls). A package may close its own portion without closing the whole finding.

## Validation and external boundaries

- Each package needs a regression through the real owning interface and candidate rendering/input for its changed surfaces. Extract a testable handler at an existing seam when necessary; testing only a new helper while the old broken caller remains is insufficient. Use isolated synthetic state and controlled failures, preserving actual native versus fixture labels.
- Run targeted affected suites and `npm run verify` on the integrated candidate; run `npm run check` before future code commits. Record exact revision/dirty state and Standards/Spec review under [project workflow](../../docs/agents/workflow.md). These checks are planned, not run in this round.
- Candidate UI checks must cover usable errors/retained fields, multiple problems, long strings, actual popup bounds and relevant narrow/short/enlarged layouts. Native host acceptance belongs to its owner; tests of a browser tab pretending to be a popup cannot qualify normal toolbar-popup behavior.
- The [native gap ledger](../ux-study/remaining-native-coverage.md) stays explicit: Pairing owns complete app-to-app outcome qualification; automatic capture owns focused Chrome read/recovery; QR actions own real payload-Copy/import checks; native host work owns successful notification selection/permission, scanner, IME and Back. Final validation will distinguish each package's required evidence from separately outstanding qualification; nothing here turns an unrun case into a pass or waives approved completion criteria.
- Account sign-in remains user-deferred. External hardware is unavailable; VoiceOver and Android carryforward remain accepted unverified gaps. Old clipboard/display intervals are closed. No new account, clipboard, global-setting or native action is performed by this planning decision.
- [Unchanged clipboard recapture after restart](../extension-clipboard-io/issues/02-prevent-restart-recapture.md) and [content-script capability](../extension-clipboard-io/issues/03-align-content-script-capture-capability.md) keep their current owners. C16 repairs read/handoff feedback while preserving ordinary observation. Neither issue is automatically a dependency; link one only if an implementation actually needs its unresolved behavior, and do not claim that behavior fixed here.

## Decision status

The user accepted this six-package first milestone and five follow-on correctness packages; the canonical resolution is recorded in [Scope correctness and recovery delivery](issues/03-scope-correctness-and-recovery-delivery.md#answer). The existing milestone, shared interfaces, explicit Save behavior and product contracts remain settled. Final consolidation will turn these boundaries into execution tickets; this decision does not authorize implementation or resolve the native/workspace tickets.
