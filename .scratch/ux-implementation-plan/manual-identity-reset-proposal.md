# Durable manual identity reset

Prepared 2026-10-10 for [Design the durable manual identity-reset boundary](issues/06-design-durable-manual-identity-reset.md#answer). **Approved transition design and reminder policy.** The approved [control-flow contract](../ux-study/control-flow-contract.md#generate-new-identity), [shared interfaces](shared-interface-proposal.md), [Identity Rotation ADR](../../docs/adr/0004-use-peer-id-as-membership-identity.md) and [identity storage ADR](../../docs/adr/0008-store-device-keys-in-runtime-application-storage.md) are inputs. This document plans the additional-controls work; it does not authorize a reset or change automatic rotation behavior.

## Recommended design

Extend the existing core Identity Rotation owner with a voluntary transition that has a durable start, one replacement candidate, mandatory public completion receipt and restart recovery. Keep one serialized owner for automatic and manual transitions. Use roll-forward recovery after manual acceptance: finish the accepted deletion and replacement, without restoring an operational old identity. Existing automatic rollback/retry and optional-notice behavior remain intact.

Prepare five delivery packages: core transition and journal; durable storage adapters; runtime quiescence and restart; authenticated actions and shared recovery UI; cross-runtime fault/restart qualification. Each implementation step includes meaningful tests, and the user-facing action stays unavailable until its runtime has the complete durable path. These packages remain in the additional-controls band, after the agreed correctness and compact-workspace work.

The user approved the one-reminder policy below together with this transition design. No history of resets is added.

## Source facts that determine the boundary

| Existing seam | Consequence for this work |
| --- | --- |
| [Core rotation coordinator](../../packages/core/trust/identityRotation.ts) supports revoked/identity-loss, one in-memory operation promise and a pending candidate marker. It stops runtime services before its first marker write. | A manual start needs a distinct durable acceptance boundary, operation ID and reviewed-Peer-ID guard. A stopped runtime or cached candidate is not proof of acceptance. |
| Rotation committers can replace the repository identity before final history-backup deletion and journal sanitization. Pending automatic markers can contain the former private key and scoped-state backup. | Candidate persistence is not completion or permission to activate. Manual completion requires all cleanup and sensitive-marker removal. Reuse cleanup primitives, not the whole automatic success/notice contract unchanged. |
| [Runtime identity initialization](../../packages/core/runtime/identityInitialization.ts) intentionally allows local-only capture during revoked recovery. [Identity manager](../../packages/core/trust/identity.ts) caches identity and has a separate write queue. | Manual accepted recovery seals identity-bound work. Drain/fence cached writers and rebuild the manager; neither hiding identity in a projection nor stopping networking achieves that. Preserve automatic revoked local-only recovery. |
| [Electron SQLite adapter](../../apps/electron/src/storage.ts) can atomically clear History/scoped KV and replace identity. [Chrome storage](../../apps/extension/src/chromeStorage.ts) propagates errors, with History in a separate IndexedDB backend. | Use real transaction boundaries where available and restartable, idempotent phases across stores. No universal cross-store transaction is implied. |
| [Android storage](../../apps/android/src/storage.ts) falls back from Preferences to localStorage/memory and suppresses removal errors. A later read can prefer an older Preferences value. History also has a memory fallback. | Ordinary fulfilled promises cannot prove durable acceptance, deletion or an empty persistent store. Provide a strict native persistence path and prevent stale fallback copies from returning. |
| [Chrome background](../../apps/extension/src/background.ts) can independently wake offscreen work; [storage proxy](../../apps/extension/src/runtimeMessageStorage.ts) accepts authorized offscreen writes. | Every wake/write/retry path needs the same transition fence, including late messages from a retired runtime. Background owns the transition; offscreen and UI cannot start independent ones. |
| [Android continuity](../../apps/android/src/backgroundContinuity.ts) clears a pending remote-clipboard pointer for rotation. The separate native [explicit ingress store](../../apps/android/android/app/src/main/java/com/clipp/app/ExplicitTextIngressStore.java) has no identity epoch/reset operation and can accept SEND/PROCESS_TEXT outside the WebView. | Durably fence and clear both queues. Reset suspension must preserve preferences; the existing user Stop/disable operation changes them and cannot serve as reset suspension. |
| Existing rotation notices are best-effort, have no former Peer ID and can be acknowledged independently. | Manual intent and completion metadata need required persistence. Do not make automatic revocation or Identity Loss wait for a manual reminder or an optional notice write. |

## Private durable state and public interface

Keep these roles in core/runtime and host storage, outside the UI session. Exact TypeScript names and storage keys belong to the implementing change; the information and guarantees do not.

| Record / interface | Required content or behavior |
| --- | --- |
| Private accepted intent | Version, manual reason, opaque operation ID, reviewed/former public Peer ID, validated replacement identity and cleanup phase/checkpoints. Persist the former ID and candidate together before destructive cleanup. This record contains the replacement private key and must never enter public state, messages to UI, logs or diagnostics. |
| Cleanup checkpoints | Only information needed to finish idempotent deletion across the actual backends. Manual recovery does not need a newly created backup of the former private key, membership or History for Undo. Existing old automatic backups/generations, if present, must be recovered or disposed under their owning transition before a new manual transition is accepted. |
| Public completion receipt | Receipt/operation ID, former Peer ID, generated Peer ID and sufficient completion metadata to label this as a past manual reset. No keys, membership, aliases, name or Clip content. Receipt lifetime follows the approved policy below. |
| Minimal completed-operation guard | Retain the last manual operation ID and generated public ID independently of the dismissible former-ID reminder. It answers a lost/replayed completion reply without another reset. This is bounded replay metadata, not a reset history or an assertion that the generated ID is still current after later automatic rotation. |
| Begin | `beginIdentityReset({ operationId, reviewedPeerId })`: authenticated, serialized, validates current identity and returns rejected, accepted/current operation, completed or outcome-unconfirmed. A stale review cannot reset a different identity. |
| Reconcile and resume | Public state includes actual reset phase and safe failure context. `resumeIdentityReset({ operationId })` continues only that durable accepted operation, with the same candidate. Reading/reconciling may discover completion; it cannot create an intent. |
| Dismiss reminder | `dismissIdentityResetReminder({ receiptId })` affects only the named completed receipt. A stale view cannot remove a newer receipt. An unfinished reset cannot be acknowledged away. Required persistence failure leaves the reminder visible/reconciling. |

Validate journal version, phases, IDs, candidate private-key validity and the public ID derived from that key at recovery. Do not accept string-shaped candidate fields as sufficient. Malformed, inconsistent or unreadable state fails closed with actionable recovery information; do not fabricate a receipt or silently generate another candidate. Existing valid automatic markers retain their recovery path; manual metadata must not be mistaken for a fresh installation or Identity Loss.

Use the approved ordered public-state feed and intent-specific action results. An authority session change is separate from a reset operation ID. The journal's private contents never travel through the general UI projection. Authentication remains a host responsibility, and an operation ID is neither a credential nor a Pairing protocol field.

## Transition and failure behavior

| Phase | Durable/runtime rule | User-visible behavior |
| --- | --- | --- |
| Review | Read current public ID and consequences. No identity mutation. | Existing Advanced review, optional Copy previous Peer ID, Cancel and explicit Generate new identity; no typed phrase. |
| Requesting start | Under the common transition owner, check reviewed identity/receipt policy, prepare one candidate, and acquire a reversible admission fence around conflicting writers. Persist one intent before deleting data. Do not invoke the automatic shutdown-before-marker path unchanged. | Pending; prevent duplicate submissions. Cancellation before submission is safe. Once submitted, Close is not a claim of cancellation. |
| Proven not accepted | Authoritative storage confirms no accepted operation and no cleanup was started. Release the provisional fence. | “Reset could not start”; retain review, Retry or Cancel. An in-memory candidate is not resumability. |
| Acceptance unconfirmed | A failed write/reply plus unreadable durable state is ambiguous. Retain/recover the fence and reconcile the operation before accepting another start or reporting rejection. On restart inspect storage first. | “Checking reset status”; allow closing the view, but do not promise Cancel, data preservation or a fresh retry until the outcome is known. This is uncertainty about acceptance, not a new destructive phase. |
| Accepted / quiescing | Confirmed intent includes former ID and candidate. Stop old networking/capture, drain or cancel admitted work, seal native/background ingress and wait for cleanup prerequisites. | Reset progress; sharing unavailable. Closing the view cannot cancel the operation. |
| Cleaning / installing | Idempotently delete identity-bound data and install the accepted candidate. Persist progress only after that step's durable effects. Keep both old and replacement identity services inactive. | Incomplete setup with truthful local error and Resume/Retry for the same operation. No Undo. |
| Finalizing | Verify required cleanup, clear sensitive temporary references, and atomically replace the private journal with public completion/replay metadata where possible. Otherwise preserve a recoverable journal until both the matching receipt and completed-operation guard are durably present, then sanitize it. | Still incomplete while any mandatory cleanup/receipt/guard write is unresolved; repository replacement alone is not success. |
| Completed / restarting | Candidate matches the validated accepted intent; all required cleanup is done; receipt and replay guard are durable; no sensitive journal backup remains. Restart/reinitialize cached owners before admitting normal work. A restart failure cannot resume the old manager. | Show committed reset and any remaining restart requirement truthfully. After readiness: new identity, empty reset-boundary History, Pair a device, former-ID reminder. |

The admission fence is not a new domain state or a promise that all stores transact together. It is the runtime's transition boundary: new identity-bound operations cannot enter, already admitted writers must settle or be invalidated, and late completions cannot publish or persist old work after cleanup. If the acceptance outcome is unknown, temporary suspension is safer than performing further writes; do not describe that suspension as accepted deletion.

For manual cleanup use roll-forward retries of the same accepted candidate. A partially completed deletion is expected recovery work, not a trigger to restore the old runtime. Automatic rotation may retain its existing rollback internals and transient backups. Sharing cleanup operations does not mean sharing every recovery policy.

## Cleanup and preservation ledger

Delete all local Clip History, including pinned/remote/local entries, suppression state, pending captures and any recovery/history generations or temporary backup records. Delete the former private key and membership, Device Name, aliases/presentation state, saved peer records and pending Pairing/identity-bound notification work. Clear stale task destinations, QR/scanner completions, queued remote clipboard applications and pre-reset Android explicit ingress. Old identity-bound drafts and in-memory cached state do not survive the reset restart.

Create a new keypair and Peer ID, a singleton Membership View and platform default Device Name (Desktop, Mobile or Extension) at revision zero. Do not derive the default name from host/account/hardware information. Rebuild cached identity/runtime owners around this candidate only after finalization.

Preserve installation preferences, including Auto Sync, theme, retention/lifetime, background-mode preference and saved relay configuration/credentials. Suspend transport using stop/close semantics, not Remove relay or account revocation. In-flight login work is fenced; memory-only credentials and unsaved editors may disappear at restart. No promise of retained account session continuity is added.

Do not read, clear or rewrite the system clipboard as part of reset. Ordinary restart/resume establishes the normal observation baseline, so clipboard content present before reset does not become a new-identity Clip merely because Clipp restarted. Deliberate later Copy/capture and legitimate later Pairing/reconciliation can populate History normally. Receipt/QR Copy remains a separately requested clipboard action, with truthful result handling and ordinary capture policy; it is not an implicit reset step.

Deletion is logical deletion from application-owned active/recovery stores, not forensic erasure, removal from backups outside the app, or erasure of other devices' History. The new singleton cannot revoke its predecessor in the old network. Former-ID text must explain separate revocation from another existing Trusted Device, without claiming revocation succeeded.

## Runtime responsibilities

### Electron

Main is the sole owner. Its durable SQLite adapter records acceptance and uses the existing transaction for compatible History/scoped-state/candidate operations. Required receipt/journal finalization joins the durable transaction or an explicit recoverable follow-up; it cannot be the current best-effort notice write. IPC/preload expose only typed public actions/status, with the established renderer authorization boundary.

Inspect recovery before loading the ordinary identity manager, retention/capture/network services or UI destinations. Fence renderer actions, transport and clipboard callbacks, Pairing/notification work and the identity manager's write queue. Quiescence errors leave an accepted reset recoverable. Relaunch rebuilds the cache; if relaunch fails, keep the old process sealed and offer the truthful restart route. Do not change ordinary tray/Dock policy in this package.

### Chrome extension

Background owns one transition; full-page Clipp supplies the review/action. Preserve exact trusted-page URL checks and the approved authenticated page connection. Popup/other views observe unavailable/recovery state and route to full-page recovery; they cannot start another reset. Content scripts and offscreen cannot invoke the destructive action.

Use durable extension storage for intent and a recoverable sequence across it and IndexedDB History generations. Gate worker startup, every `sendOffscreen` wake/init/retry and identity-bound storage-proxy operation. Associate admitted work/messages with the current runtime/identity generation so an old document cannot repopulate state after cleanup. Keep legitimate recovery/storage operations possible through the same authenticated owner; a blanket proxy rejection must not deadlock recovery.

Stop/close offscreen work, invalidate old UI handoffs and receipt/action callbacks, and reload/rebind only after finalization. Lost replies or worker termination reconcile by operation ID. Storage/session destinations from the old identity cannot reappear in a new page. Chrome's existing ordinary capture/post-rotation baseline work retains its [source-context ownership](source-context.md); this reset package consumes and qualifies it, rather than claiming a reload alone proves safety.

### Android

Add a strict native persistence path for reset intent, identity-critical writes/deletes and startup inspection. It must acknowledge actual durable commit, propagate errors and never fall through to localStorage or memory. Coordinate the reset fence with the native ingress/service owner so a WebView-independent enqueue cannot cross the accepted transition unnoticed. The implementation must qualify its actual commit/locking primitive; merely awaiting the existing Preferences wrapper does not establish this guarantee.

Inventory and reconcile app-owned Preferences/localStorage/memory copies and persistent History generations. Inaccessible persistent data is not empty. Prevent later fallback reads from resurrecting a former identity, pending action or History after completion. Ordinary preview/noncritical preference fallback is not evidence for the native reset guarantee; native reset remains unavailable until its required durable adapters work.

Before cleanup, suspend continuity without invoking user Stop or changing background-mode/Auto Sync preferences. Fence native SEND/PROCESS_TEXT admission and drain; durably clear pre-reset ingress plus the pending remote-clipboard pointer, and keep new submissions during incomplete reset from being silently queued for the replacement. Such a submission reports unavailable/retry after setup. Crash recovery must consult this fence before native ingress, service startup, WebView identity loading or cleanup/capture consumers run.

Resume the preserved preference through normal eligibility after completion/reload, with baseline-on-resume and resumed-and-focused clipboard rules intact. Activity/WebView restart is not durable acknowledgement. Isolated actual native restart/queue tests are required; web preview and memory storage cannot qualify this path.

## Automatic rotation coexistence

Manual and automatic work share transition serialization and candidate ownership, but retain their reason-specific contracts:

- Before manual acceptance, an automatic transition makes the reviewed identity stale or unavailable; report that and reconcile. Do not ask the user to confirm an obsolete review against a new identity.
- Immediate shutdown on self-revocation cannot wait behind a manual review, reminder dismissal or UI. While a manual start is preparing, the safety signal must interrupt/fence old networking before waiting for normal transition serialization. Recheck reason/current identity before durable manual acceptance.
- After manual acceptance, continue that one candidate through cleanup; the removal/loss/revocation of the former identity is not a reason to create another. If the replacement is genuinely revoked later, ordinary automatic rotation still runs.
- Preserve automatic revoked recovery's allowed local-only capture and deletion of those recovery Clips at commit. Manual accepted recovery allows none of that old-identity work. Preserve true Identity Loss handling, valid-key metadata repair and normal first launch.
- Automatic notices remain optional/best-effort and do not become stronger merely because manual receipts are mandatory. A previous manual reminder cannot block automatic rotation or be mistaken for its reason. No new network protocol, old-device revocation authority or OS key-store migration is introduced.

## Approved former-ID reminder policy

**Approved: keep one completed reminder until explicit dismissal, with no time expiry. Require disposition of it before another manual reset.** Show it in Advanced → Device identity and on the completion surface. It survives restart, includes Copy previous Peer ID and a concise separate-revocation explanation, and is labelled as a previous manual reset when its generated ID is no longer current. No permanent History banner is needed.

Dismiss reminder means only “stop reminding me”; it does not attest that revocation occurred. Dismiss removes the former-ID receipt durably and leaves only the minimal completed-operation guard. Another voluntary reset remains reachable, but explains that the existing reminder must first be copied if wanted and dismissed; use the existing Device identity task, not another modal or typed phrase. This acknowledgement does not apply to automatic rotation and never holds it up. A failed or ambiguous dismissal is reconciled before allowing the new reset.

Alternatives considered; the user selected the first:

| Policy | Tradeoff |
| --- | --- |
| One reminder; dismiss before another manual reset (accepted) | Bounded retained metadata and simple UI; adds an explicit disposition step for the uncommon repeated reset. No silent loss of an outstanding reminder. |
| Keep all unacknowledged reminders | Repeated reset remains immediate; Advanced needs a list with separately named former/generated IDs and per-receipt dismissal. Public reminder records can accumulate until dismissed. This would be a reminder collection, not full reset history. |
| Replace the reminder on each manual reset | Smallest UI; review must explicitly say the previous reminder will be replaced. Users must copy older IDs themselves before continuing. Automatic rotation still preserves the most recent manual reminder. |

This policy was explicitly approved separately from the destructive review. It cannot remove an accepted incomplete intent, retain old keys for the reminder, claim remote revocation, or make automatic rotation depend on acknowledgment.

## Delivery packages and dependencies

| Package | Concrete scope and completion evidence |
| --- | --- |
| Core manual transition and journal | Extend the existing transition owner with begin/reconcile/resume, validated durable schema, one candidate, stale-review/duplicate protection, roll-forward recovery and selected receipt policy. Test exact acceptance/cleanup/finalization boundaries and existing automatic semantics. Public surface is not enabled by a passing in-memory test. |
| Durable storage adapters | Electron real SQLite transaction/reopen; Chrome storage + actual IndexedDB generation recovery; Android strict commit/error path and stale-copy cleanup. Supply the storage contract to the same core owner. Each affected adapter and its consuming runtime wiring land together. Stop qualification if persistence or old-key cleanup cannot be established. |
| Runtime quiescence and restart | Gate/drain writers, callbacks and all cold/wake paths; add Chrome worker/offscreen/storage fencing and Android native ingress/pointer cleanup plus preference-preserving suspension. Rebuild caches on restart, consume normal clipboard-baseline behavior. Preserve automatic local recovery. Test real queues and blocked late writes. |
| Authenticated actions and shared recovery UI | Add every affected bridge, full-page Chrome route and approved shared Advanced review/progress/recovery/completion/reminder. Use the ordered feed and task owner. Clear old identity-bound UI state on acceptance; never serialize keys. Include duplicate/stale/lost-reply/Copy/dismissal failures and accessible compact presentation. Enable separately only for runtimes with completed durable integration. |
| Fault and restart qualification | Collect storage-backed abrupt-stop/reopen evidence at each phase, runtime/clipboard-baseline and native-ingress results, cleanup/preservation ledger and UI outcomes across all runtimes. No cross-runtime claim until each host is qualified. Preserve named external gaps rather than substituting fixtures. |

These are execution scopes for final consolidation, not executable tickets or permission to mutate data now. The selected receipt policy is input to the first and UI packages. Shared action/state/session/task foundations, usable Advanced Settings and Chrome management/handoff are prerequisites for those consumers; reset work does not become a prerequisite for the earlier correctness milestone. Existing capture/managed-relay owners are dependencies only where their behavior is actually consumed.

## Failure and restart acceptance matrix

| Seam | Required evidence |
| --- | --- |
| Review/offline/preparation | Offline start; optional public-ID Copy; Cancel leaves identity/History unchanged; failed candidate generation or conclusively failed intent write creates no resumable reset and performs no cleanup. |
| Ambiguous acceptance | Persisted intent with lost reply; storage error with unreadable status; restart while checking. No false rejected/completed state or second candidate; recovered operation is the same one. |
| Competing requests | Two views start; retry after worker loss; stale reviewed ID; replay after completion/dismissal/later rotation. Exactly one accepted transition, current identity protected, correct stale outcome. |
| Safety races | Automatic revocation/Identity Loss before or during manual preparation; late writes from identity manager, transport, Pairing, QR/scanner, notification, capture, offscreen retry and native ingress. Immediate revocation shutdown remains effective and no old work repopulates cleared stores. |
| Every durable phase | Terminate/reopen after acceptance, quiescence checkpoint, partial deletion, candidate repository write, receipt write, completed-operation guard write and journal sanitization. For non-atomic finalization, fault/reopen between receipt and guard persistence (in either permitted order); the recovery marker must remain until both match. Verify same candidate, required barriers and accurate recovery with the real adapter. Inject failure before and after each acknowledged effect. |
| Cleanup failure | Fail History/scoped-KV/key/native queue/pointer deletion and sensitive-marker sanitization separately. Candidate never becomes runnable; resume is roll-forward; persistent data inaccessible behind a fallback is not claimed deleted. |
| Finalization/restart failure | Mandatory receipt failure leaves incomplete state; restart failure leaves old cached runtime sealed; public completion survives a successful restart. No private accepted candidate or former-key backup reaches UI/logs. |
| Preserved/deleted data | Assert every cleanup ledger category, including pins/suppression/generations and native explicit queues. Assert singleton new identity/default name/revision and unchanged installation settings/saved credentials. Logical deletion only. |
| Clipboard boundary | System clipboard unchanged by reset itself; no Clip synthesized from the pre-reset clipboard on restart/resume; later deliberate actions follow ordinary policy. Requires a fresh isolated synthetic-marker interval for native proof. |
| Receipt policy | Persistence/restart, long-ID inspection/Copy, dismissal failure/lost reply, second reset and later automatic rotation follow the selected policy. Dismissal cannot hide incomplete recovery or remove a newer receipt. |
| Automatic preservation | Existing revoked/Identity Loss, valid-key repair, startup recovery, candidate reuse, local-only revoked recovery and optional-notice failure tests continue to pass. Manual reminder never delays automatic safety. |

Extend [core rotation tests](../../tests/core/trust/identityRotation.test.ts), [SQLite rotation tests](../../tests/core/trust/identityRotationSQLite.test.ts), [runtime lifecycle tests](../../tests/core/runtime/identityInitialization.test.ts), [Chrome storage-proxy tests](../../tests/extension/runtimeMessageStorage.test.ts) and [Android continuity tests](../../tests/android/clipContinuity.test.ts), adding actual adapter reopen and native-ingress coverage. The current SQLite suite's transactional fake is useful regression coverage, not a real process-crash result. No need to duplicate implementation line by line; prove observable invariants at failures and recovery seams.

Follow [routine verification](../../docs/agents/verification.md) and affected native build/test requirements for future code. All destructive tests require disposable isolated profiles/installations with synthetic data and exact revision/dirty-state records. No operator profile, real account, clipboard, display or native permission interval is opened by this plan. Carry the [remaining native coverage ledger](../ux-study/remaining-native-coverage.md) into affected acceptance; sign-in remains deferred and prior clipboard/display intervals remain closed. Existing device, accessibility and hardware gaps are not passes.

## Decision status

The user adopted the transition design and five delivery packages, including suspended old local work/capture and roll-forward manual recovery, and selected one completed reminder until dismissal before another manual reset. The canonical resolution is [Design the durable manual identity-reset boundary](issues/06-design-durable-manual-identity-reset.md#answer). Final consolidation will produce executable scopes and candidate gates; no reset or implementation is authorized by this planning approval.

No new domain vocabulary is needed. Any implementation documentation must explain the voluntary reason, durable acceptance and stricter receipt guarantee without rewriting the accepted automatic ADR semantics as if they already provided them. The planning decision is resolved; application implementation remains outside this map.
