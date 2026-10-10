# Control-flow contract

Date: 2026-10-09. **Approved: the user accepted all six recommendations (Q6–Q11) with “agree”, without exceptions.** Owned by [Decide missing controls and obsolete entry points](issues/06-decide-control-gaps-and-retirements.md). This is a UX study contract, not authorization to perform a reset, delete history, change relay accounts or implement application behavior.

## Already settled

The user approved an advanced destructive Generate new identity action, Chrome quick popup plus complete full-page management, removal of the duplicate Configure Relays tray command, shared System/Light/Dark, and a Dock icon while the main window is open. The [layout contract](layout-state-contract.md) adds M3 Settings categories, full-screen narrow task views, truthful task-local errors, and session-only draft retention on Back/Escape/Close with explicit Cancel/Discard.

The approved History rows expose Copy and Pin; Delete is an icon in Clip details. The approved popup allocation below reconciles that placement with the earlier control draft, which listed Delete in the popup while putting details in the full-page view. It does not add another Delete icon to History rows.

## Approved decisions

| Question | Accepted answer | Alternative not selected |
| --- | --- | --- |
| Q6 — Former identity | Allow offline local reset; show the former public Peer ID before and after; explain separate revocation from another existing Trusted Device. | Require old-identity retirement before reset. |
| Q7 — Confirmation | Settings → Advanced → Device identity; consequence review and explicit Generate new identity button, Cancel before start; Resume/Retry for an accepted incomplete reset, fresh Pairing on success. | Also require typing RESET. |
| Q8 — Popup allocation | Recent Clips, Search, Copy, Pin, Send, Auto Sync and pending count in the popup; full-page destination for Clip details/Delete, Pairing and management. | Also allow Clip details/Delete inside the popup. |
| Q9 — Deletion confirmation | Confirm Clear all local history; single-Clip Delete immediate with accurate failure/Retry. Neither operation promises Undo. | Confirm both single Delete and Clear all. |
| Q10 — Relay account controls | Keep Log in, Manage relay account and Remove relay, with existing Edit/Retry and accurate feedback. | Add local Sign out/Switch account, which needs a separate replacement-credential flow. |
| Q11 — Routine cleanup | Remove inactive content switches, replace obsolete Expiry with separate retention/lifetime controls, expose alias clearing and consolidate Android Pause/Resume Auto Sync. | Retain named exceptions for further review. |

These are approved UX decisions. The automatic rotation implementation supplies constraints, not proof that a manual reset already exists. Approval does not establish that the selected controls or workflows are implemented.

## Generate new identity

### Entry and review

Open Settings → Advanced → Device identity → Generate new identity. In Chrome, use the full-page management surface. The review describes the operation as a fresh start for this installation and offers a separately labelled Copy previous Peer ID action. Keep that action distinct from copying a Clip.

Accepted review content (final wording may be refined without changing the consequences):

> Generate a new identity for this device? This deletes all local Clip history, including pinned Clips, and resets this device's trusted-device list, device name and aliases. You will need to pair again. Installation preferences and saved relay configuration remain. Other devices keep their history and may still trust the previous identity.

The detailed explanation additionally distinguishes saved relay credentials from active or memory-only sign-in state. Restarting can require sign-in again; retaining preferences is not a promise that every login or unfinished editor survives. The system clipboard is not erased, and “delete” does not mean forensic erasure of storage.

Use a normal consequence review with Cancel and a clearly labelled destructive Generate new identity action; do not require typing RESET. Local reset is available offline.

### Progress, failure and completion

| Phase | Approved UX and guarantee |
| --- | --- |
| Reviewing consequences | Cancel/Close makes no identity mutation. Copying the old public ID is optional. |
| Requesting a durable reset start | Show a pending action and prevent duplicate starts. Do not claim a resumable reset until durable intent has been accepted. |
| Start not accepted | Report “Reset could not start”, retain the review context and allow Retry or Cancel. Do not claim the old identity/data changed or that a reset will resume after restart unless authoritative state confirms acceptance. |
| Durable reset accepted | Stop old-identity networking and affected in-flight work; show progress/recovery while the cleanup completes. No post-start Undo or promise that closing the view cancels the operation. |
| Incomplete accepted reset | Explain that setup is incomplete and sharing is unavailable; Resume/Retry continues the same accepted reset. Restart must recover from its durable state rather than create a second reset. |
| Completed | Present the new Device Identity, empty local history and a clear Pair a device route. Include the former public Peer ID and instructions to revoke it from another existing Trusted Device. |

The success/old-ID reminder must not retain the former Membership View, keys or identity-bound presentation database. Its public-ID receipt is an explicit new UI/recovery requirement: persist the former public ID as part of the accepted reset intent before clearing the old identity so completion can still explain it after restart. The new singleton device cannot claim authority to revoke the old identity in its former network. Local reset must never be labelled completed network-wide revocation.

An accepted reset is a destructive exception to ordinary editor draft retention: identity-bound work is cleared, and the runtime may restart. Unsaved drafts in an ordinary form are retained only within the app session as already agreed. This is not a conflicting promise of reset survival.

### Source constraints and gaps

- [ADR0004](../../docs/adr/0004-use-peer-id-as-membership-identity.md) requires a new keypair/Peer ID and fresh Pairing; removes all local history, former membership, Device Name, aliases/presentation state, saved peer records and pending identity-bound work; preserves identity-independent installation preferences. Other devices retain their histories and old attribution.
- [Rotation reason/notice types](../../packages/core/trust/identityRotation.ts:15) currently support only revoked/identity-loss, with no purpose-built voluntary action or old-ID completion field. [Self-revocation enforcement](../../packages/core/membership/reconciliation.ts:201) rotates locally before the remote propagation branch; it is not an implementation of reliable self-retirement everywhere.
- [Core rotation](../../packages/core/trust/identityRotation.ts:194) activates the candidate after cleanup. [Startup recovery](../../packages/core/runtime/identityInitialization.ts:88) blocks networking until recovery completes. A failure before the first durable marker can retain the candidate only in process memory: [unstored candidate](../../packages/core/trust/identityRotation.ts:237), [marker persistence](../../packages/core/trust/identityRotation.ts:386). A crash-resumable voluntary intent is new work and must define an authoritative start boundary.
- [Managed relay stop](../../packages/core/network/managedRelays.ts:633) closes resources without erasing saved credentials; configuration remains. [Runtime restart](../../apps/extension/src/background.ts:770) means memory-only credentials or drafts cannot be promised to survive. Failed saved-credential loading also needs the normal sign-in route.

Acceptance must cover offline start, failure before durable acceptance, failure during cleanup, restart/retry, duplicate submission, pending clipboard/Pairing work, success and the old-ID reminder. No runtime reset was exercised for this study decision.

## Chrome quick popup and complete full-page view

The approved allocation preserves the approved compact list and limits focus-sensitive work:

| User goal | Approved surface / route |
| --- | --- |
| Find and reuse a recent Clip | Popup: Search/Filters, Copy and Pin, with the approved direct actions. |
| Share current clipboard or change Auto Sync | Popup: Send and the existing Auto Sync route. Feedback names the actual local/queued outcome, never delivery. |
| Inspect long content or delete a Clip | Click the Clip to open full-page Clipp at that Clip's details; keep the approved Copy/Pin/Delete details controls there. |
| Notice incoming requests | Visible pending count; activation opens the full-page request list. Notification selection should route to that list rather than an unrelated default view. |
| Pair, approve, rename/alias, inspect IDs, edit relays or settings | Full-page management at the relevant task/category, using the accepted layout and session draft contract. |
| Clear all history or generate a new identity | Full-page Settings → Advanced, with the appropriate review/confirmation. |

Carry the requested destination and Clip/request identity into the full-page view. Preserve relevant query/filter context without copying the entire history into the URL. If a Clip/request no longer exists, explain that and offer History/Requests instead of opening the wrong item. Reuse a suitable existing full-page Clipp view where practical. Do not silently abandon unsaved full-page work during destination handoff; keep its session draft.

The full-page view must have the complete working management/action surface, live state updates and meaningful mutation feedback before moving users there. The current [popup](../../apps/extension/src/popup.tsx:297) hosts many management operations, while [options](../../apps/extension/src/options.tsx:134) has only partial coverage and its [History component](../../apps/extension/src/components/ClipHistoryList.tsx:8) lacks Copy/Pin/Delete/Clear. No popup-to-target full-page route is currently implemented. Notification selection currently [opens the popup](../../apps/extension/src/background.ts:662).

Routing must preserve trusted-page authorization. The current [managed-relay UI gate](../../apps/extension/src/managedRelayUi.ts:7) compares exact popup/options URLs; adding a query/hash is not automatically compatible. This is an implementation acceptance constraint, not a reason to weaken sender validation.

Acceptance covers opening from a popup that immediately closes, reuse/new full-page tabs, stale/deleted destinations, live state after mutation, keyboard focus at the destination, approval routing and retained draft context. Do not claim drafts survive popup destruction or restart.

## Local history deletion

Use immediate individual Delete from the approved detail affordance. Busy/failure feedback belongs to that Clip/task. On retryable mutation failure, preserve/restore the Clip, explain the failure and provide Retry. A disappearing animation alone is not a successful delete.

Clear all local history gets a separate review such as:

> Delete all Clip history on this device? This includes pinned Clips and Clips hidden by the current search or filters. Clips stored on your other devices remain. This cannot be undone here.

Use Cancel and Clear all local history. Never reinterpret Clear as only visible results, unpinned history or remote deletion. [The accepted policy](../device-network-sync-v1/issues/08-enforce-local-history-policy.md) requires clearing durable local history before pending captures; [the coordinator](../../packages/core/clipboard/captureCoordinator.ts:262) implements that ordering. No user-facing Undo is supplied by the current operation. [Shared action handling](../../packages/ui/src/ClipboardApp.tsx:566) already has failure/Retry behavior, but no confirmation.

Preserve search/scope after deleting so the resulting no-match or empty state is truthful. Deleting the last Clip, the selected Clip or a pinned Clip must leave a reachable task/page. If the full-page destination becomes stale after deletion in another view, refresh it accurately.

Unpin is separate from Delete: [history retention/capacity](../../packages/core/history/store.ts:186) is reapplied when unpinning and can remove an old Clip. Its disappearance should be explainable; do not offer an Undo that the storage semantics do not support. Chrome's session pin limitation remains a capability constraint, not silently solved by the new layout.

## Relay account actions and consequences

Keep the existing action set, with Edit/Retry preserved where applicable:

| Action | UX contract |
| --- | --- |
| Log in | Show opening/waiting/completed/failed states from the real authentication result; opening the browser is not success. Keep recovery reachable. |
| Manage relay account | Open the configured relay portal. Explain that its browser account may differ from Clipp's account; opening it does not erase local credentials or sign Clipp out. |
| Remove relay | Explain that it removes this local relay configuration, closes its resources and removes its locally stored credential. It does not revoke the entire relay account or remove other relay configurations. |
| Retry / Edit | Keep them beside the affected configuration, with actual service/validation feedback. A usable session can coexist with an authentication-renewal warning. |

The shared [relay settings](../../packages/ui/src/ManagedRelaySettings.tsx:143) expose this action set. [Manage account](../../apps/extension/src/managedRelayCredentials.ts:357) opens a portal; the [accepted runtime integration](../../../../go/clipp-relay/.scratch/managed-relay-service/issues/10-define-clipp-runtime-integration.md:306) reserves account-wide revocation confirmation to the portal. There is no existing local Sign out/Switch account flow.

Failure feedback must report authoritative state. Do not promise every relay mutation rolls back unchanged: [Chrome removal](../../apps/extension/src/managedRelayConfiguration.ts:37) erases credentials before persisting the new configuration, so later failure can leave a configuration that needs sign-in again. Reconcile the row and recovery actions with the result instead of pretending the credential was restored. The ordinary “failed save remains unsaved” rule does not authorize inventing credential rollback.

Local Sign out/Switch account was not selected for this study. Adding it in a future effort would require a separate decision about working credentials during failed replacement login, local session closure and independent portal revocation.

## Routine control repairs to carry into the study handoff

The routine cleanup set is accepted. The existing [control baseline](issues/06-decide-control-gaps-and-retirements.md#working-control-baseline-for-review--not-a-resolution) and observation reports supply its evidence. They expose existing capabilities or repair misleading presentation; they do not create new identity/account semantics:

- Keep Device Name distinct from Local Device Alias and expose Use device name to clear an alias. Preserve input and report rejected saves.
- Give QR generation/import and approval actions explicit pending, failure and retry states. Waiting for a Trust Response shows its deadline; dismissing the view does not cancel a delivered signed request. [ADR0005](../../docs/adr/0005-use-stateless-signed-trust-requests.md) remains authoritative.
- Replace Chrome's ineffective Expiry UI with local retention and a separately explained Clip Sharing Lifetime. Remove nonfunctional Text/Images/Files preference switches instead of advertising unsupported configuration. Preserve functioning Auto Sync/log-level controls.
- Use one state-dependent Pause/Resume Auto Sync action in Android continuity UI and retain Stop background mode as a distinct action. Expose permission recovery and diagnostics near the affected task; stopping continuity must not silently change Auto Sync.
- Apply the already-approved Configure Relays tray removal, Dock visibility behavior, theme controls, selected navigation and icon access patterns.

All six recommendations were accepted without exceptions. The owning ticket records the resolution alongside the earlier Q1–Q5 decisions. Evidence consolidation, prioritization and remaining coverage disposition belong in the final study handoff; no production fixes were made in this round.

[Source review receipt](control-flow-source-review.json) records the public source files and repository revisions used to qualify this contract. Approval metadata is separate from the original source-review timestamp and hashes. No private runtime state was inspected.
