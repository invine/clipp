# Decide missing controls and obsolete entry points

Type: grilling
Labels: wayfinder:grilling
Mode: HITL
Status: resolved
Assignee: Codex (current session, 2026-10-09)
Parent: [Clipp cross-runtime UX study](../map.md)
Blocked by: 02, 03, 04, 05

## Question

Given the flow/control inventory and runtime evidence, which user goals need a visible control or clearer recovery path, and which existing controls should be removed, renamed or redirected?

Use grilling and domain-modeling with the user. Present concrete evidence for deliberate Identity Rotation/generate-new-identity, the macOS **Configure Relays** tray command and every discovered inaccessible or redundant action. Distinguish a bridge capability with no UI, an existing but undiscoverable UI, an obsolete command and a genuinely new operation.

For a proposed manual Identity Rotation action, settle intent, entry point, explanation, confirmation, cleanup, failure/retry, post-rotation Pairing and treatment of the old identity. Preserve accepted semantics unless the user explicitly decides to reopen them; never silently treat new identity creation as a rename or continuity-preserving reset.

Specify which surfaces need each action, when it is available, expected feedback and why intentional platform differences remain. Record user's answers as the resolution; recommendations alone cannot close a HITL ticket. Link any additional evidence or invariant decision that must precede a recommendation.

## Comments

2026-10-08 claim: the user instructed proceeding with this frontier after the recommendation to close Android with explicit follow-up coverage gaps. All prerequisite observation tickets are now resolved. Begin the human decision rounds using grilling and domain-modeling; product choices remain unapproved until answered by the user. No production implementation is authorized by this study.

2026-10-07: [Electron runtime evidence](../electron-observations.md#findings) now confirms the duplicate Configure Relays destination, hidden active search, keyboard-inaccessible narrow navigation, missing full Clip inspection, unclear Clear scope, silent name/approval failures, no closed-drawer pending indicator and inert theme control. Reopening also leaves the Dock hidden; intent needs a decision. The source-only concern about restoring a minimized window was not reproduced. Treat manual new identity as the distinct lifecycle decision already described here. Chrome and Android still block resolution.

2026-10-07: [The source inventory](../flow-control-inventory.md#findings-to-carry-into-decisions) distinguishes manual identity replacement (new user-initiated lifecycle), alias clearing (existing core capability blocked by UI), missing sharing-lifetime exposure, duplicate tray routing, inert extension settings and missing control feedback. Capacity limits are intentionally not end-user settings. The runtime studies still block this decision; source findings are inputs, not approved additions/removals.

2026-10-07: [Chrome observations](../extension-observations.md#findings) now establish stale options writes that re-enable Auto Sync, ineffective Expiry/type controls, stale history/search, rejected settings shown as saved, silent Pairing outcomes, QR failure feedback gaps and lost popup drafts. Search is absent from the real popup; options exposes search without history mutation/copy controls and omits approvals/recovery. Use the surface-role decision to settle a visible persistent management route. Theme controls are also inert. Native notification/permission journeys remain unqualified; Android still blocks this decision. No removals or lifecycle changes are pre-approved.

2026-10-08: [Android observations](../android-observations.md#findings) add native drawer Back leaving the app, hidden compact search, missing notification/camera permission recovery routes, redundant Pause/Resume actions, export/start labels squeezed into icon buttons and overly technical Pairing errors. Preserve the observed distinction between Auto Sync and continuity: Stop disables continuity while leaving Auto Sync enabled. Camera provider failure is specific to the tested AOSP/WebView environment. The Android evidence is ready to inform this discussion, but its ticket remains claimed pending a user decision on native coverage gaps. These recommendations do not pre-approve new controls or removals.

### 2026-10-08 source revalidation and decision tree

Read-only fact checks for this conversation confirmed that all 145 inventory source hashes still match. The [Android observation ticket](05-observe-android-ux.md#answer) is now resolved with the documented gaps carried to the handoff. Earlier blocker statements in this comment history are superseded.

The first human decision round is complete. The user explicitly selected the recommended answer for all five questions in this chat. **These are study/product decisions, not authorization to implement.** Later lifecycle details and final shared-understanding review remain open.

| Decision | Recommendation put to the user | Dependent questions |
| --- | --- | --- |
| Q1 — Deliberate identity replacement | Add an advanced destructive reset following Identity Rotation's new-identity/empty-history/fresh-Pairing contract | Old identity treatment; confirmation and cancellation boundary; recovery/retry; post-reset entry point |
| Q2 — Chrome surface roles | Quick popup plus a visibly linked full-page view for complete management | Exact popup actions; where longer workflows start; draft persistence and handoff |
| Q3 — Duplicate tray entry | Remove Configure Relays from the tray; retain relay configuration inside Clipp | If retained instead, define its direct destination and focus behavior |
| Q4 — Theme selection | Keep one functioning System/Light/Dark preference across runtimes | Visual tokens and appearance behavior belong to the visual/layout frontier |
| Q5 — Dock behavior | Show the Dock icon while the main window is open; hide it when the window closes to the tray | Window reopen/focus acceptance criteria |

Recorded user answers: Q1 “Add an advanced destructive reset”; Q2 “Quick popup + complete full-page management”; Q3 “Remove the duplicate tray command”; Q4 “Keep and implement shared theme selection”; Q5 “Dock icon while the window is open.” The baseline below remains proposed except where these answers directly settle it.

The full tree also covers history deletion scope, outgoing Pairing recovery/cancellation, relay authentication/account recovery, and final review of the ordinary control baseline below. Questions that depend on a chosen new lifecycle or surface role follow that answer; source-defined behavior is not delegated to the user as a fact-finding task.

### Working control baseline for review — not a resolution

| User task / scenario | Proposed control treatment | Classification and evidence |
| --- | --- | --- |
| Open navigation or search at compact sizes, including active filters | A labelled keyboard/touch navigation trigger; a reachable search entry and clear-search/filter route at every supported size | Exposure of existing operations; E03/E04/E06, C06/C11, A10 |
| Inspect a long Clip or device identity without copying it blindly | A full-content Clip view with Copy, and full Peer ID inspection/copy independent of hover | New presentation affordances for stored data; E08 and inventory; Copy continues to create a new Local Clip and follow Auto Sync |
| Rename this installation versus name a remote device locally | Distinguish Device Name from Local Device Alias; add “Use device name” to clear an alias; retain edit state and show save errors | Existing core alias-clearing capability blocked by UI; [identity.ts](../../../packages/core/trust/identity.ts), E11 |
| Notice and act on pending approvals | Pending indicator on closed navigation; notification selection routes to approvals; busy/error/retry feedback on each request | Existing operations with missing discovery/routing; E11/E12, inventory; native routing gaps remain unverified |
| Generate or import Pairing text/QR | Visible loading, errors and Retry; truthful copy/import feedback; keep submitted text available after failure | Existing operations with incomplete feedback; C07/C08, A13/A18 |
| Recover from a failed setting/action or denied permission | Keep state unchanged when save fails; clear error and retry/settings route; do not treat accepted/queued work as delivered | Existing-action repairs and native recovery shortcuts; C01/C10/C16, A07/A09 |
| Configure local retention and sharing duration | Replace Chrome's ineffective Expiry field with the real retention control; expose the separately required Clip Sharing Lifetime as an advanced setting | Accepted capabilities/requirement; lifetime affects newly created Clips, default 24h/max 30d, and does not delete local history |
| Choose supported clipboard content | Retire the ineffective Text/Images/Files preferences; do not imply unsupported content is configurable | C02; Auto Sync and log level are functional and are not retirement candidates |
| Pause sharing or stop Android continuity | One state-dependent “Pause Auto Sync” / “Resume Auto Sync” action plus “Stop background mode” | Presentation simplification of distinct working operations; A06; stopping continuity does not silently disable Auto Sync |
| Inspect background limitations or export diagnostics | Keep a short state/limitation summary and content-sized actions; move long technical detail into explicit help/diagnostics | Organization/control treatment, not removal of the experimental limitation; A04/A05/A13; visual placement remains for layout decision |
| Understand device status | Use Trusted Devices for membership, separate connection and Auto Sync state, avoid “Synced” without delivery evidence | Existing glossary concepts; E16 and inventory; no new delivery-receipt semantics |

### Identity fact qualification

There is no purpose-built manual rotation UI, bridge contract or rotation reason. The current reason type is only `revoked | identity-loss`. However, generic revoke-by-ID paths do not exclude the local Peer ID; core can notify the local-revocation observer. This must **not** be described as a supported voluntary reset or guaranteed network-wide retirement flow: the local observer runs before the remote propagation branch. The [accepted ADR](../../../docs/adr/0004-use-peer-id-as-membership-identity.md) governs automatic rotation, and the proposed manual trigger requires explicit decisions about the old healthy identity and failure boundary. Do not introduce identity continuity or preserve identity-bound history by calling it a rename.

### Second human decision round — answers pending

| Decision | Recommendation put to the user | Boundary |
| --- | --- | --- |
| Q6 — Former identity after voluntary reset | Allow local reset offline; explain that other devices may still trust the old Peer ID; supply its ID and a separate-revocation route from another Trusted Device | Local reset is not a claim of completed network-wide revocation |
| Q7 — Reset entry, confirmation and failure | Settings → Device identity → Generate new identity; consequence review and explicit destructive confirmation, Cancel before start; after start, resume/retry the same reset with networking disabled; fresh Pairing after success | Normal review dialog recommended; typed RESET offered as the stronger alternative; no post-start Undo |
| Q8 — Chrome quick-action allocation | Popup: recent Clips, search, Copy, Pin/Delete, Share Now, Auto Sync and pending count; open full-page view at Clip details, approvals, devices, relays, identity and settings | Route approval decisions to full-page recommended; direct popup approvals offered as alternative |
| Q9 — History confirmation policy | Clear all local history confirms inclusion of pinned/filtered-out Clips and local-only scope; individual deletion immediate with failure/Retry | Confirmation for both offered as alternative; accepted deletion semantics stay intact |
| Q10 — Relay account workflow scope | Keep Login/Manage relay account/Remove relay, with accurate busy/error/retry and consequence feedback | Adding local Sign out/Switch account while retaining configuration is an explicit alternative requiring new lifecycle decisions |

### Accepted constraints to preserve in the recommendation

- [Stateless signed Trust Requests](../../../docs/adr/0005-use-stateless-signed-trust-requests.md) remain valid capabilities until expiry. Hiding waiting UI, restarting or receiving a rejection to another attempt cannot cancel an already-delivered request. Recommend a visible waiting deadline and deliberate Retry using a fresh request, not a misleading Cancel request. Do not expose protocol validity/skew settings as preferences.
- [Local history policy](../../device-network-sync-v1/issues/08-enforce-local-history-policy.md) defines Clear as all local durable history, including pins, followed by pending in-memory captures. Filters do not change its scope; deletion is not propagated to other devices. Retryable mutation failure preserves history. Filtered deletion, keep-pinned Clear and post-commit Undo are separate semantics, not assumed UI fixes.
- [Manage relay account](../../../../../go/clipp-relay/.scratch/managed-relay-service/issues/10-define-clipp-runtime-integration.md) opens the relay portal; the browser account may differ from Clipp's account. Only the portal confirms account-wide revocation. Opening it does not itself erase local credentials or prove sign-out. Removing a configuration clears local credentials/resources, not account-wide grants. Any new local sign-out/account-switch flow must define what happens to existing working credentials when replacement sign-in fails.
- System clipboard access remains runtime-dependent. Share Now targets the current clipboard; Copy reuses a stored Clip as a new Local Clip and follows Auto Sync. A saved, queued or accepted action is not a remote-delivery receipt. Chrome's session-only pin persistence and Android's foreground-only clipboard capture remain explicit capability limits.

2026-10-09 layout constraint update: the user approved the [responsive/recovery contract](../layout-state-contract.md) and the layout ticket is resolved. Back/Escape/Close retains unfinished editor drafts for the current app session; explicit Cancel/Discard clears them, and no survival across popup destruction/app restart is promised. This narrows presentation/draft behavior for later control flows but does not answer the pending former-identity treatment, reset confirmation/failure, exact popup allocation, deletion confirmation or relay-account lifecycle questions.

### 2026-10-09 continued claim — remaining control flows

The user requested the next frontier after the layout decision was resolved. Resume this existing claim, the remaining unblocked decision before the final handoff. Reconcile the earlier unanswered second round with the approved Settings categories, Clip details, icon actions and draft/dismissal contract. Revalidate source facts for voluntary Identity Rotation, local history deletion, Chrome surface handoff and relay account actions; use existing evidence without accessing personal runtime state. No new production behavior is authorized.

### 2026-10-09 remaining round restated with current constraints — answers pending

The [control-flow contract](../control-flow-contract.md) provides concrete entry points, review copy, failure/completion states, runtime allocation and acceptance cases. Q6/Q7 retain the proposed offline local reset and normal consequence confirmation, now located under approved Settings → Advanced. Q8 is refined to preserve approved Copy/Pin-only History rows: Clip details and its Delete affordance go to the full-page view, unless the user selects the popup-details alternative. Q9/Q10 ask about deletion confirmation and the relay action set. Q11 asks for the routine inactive-control/alias/retention/Android-action cleanup set. None of this round is accepted until the user answers.

Read-only source revalidation confirms no purpose-built voluntary reset, popup-to-full-page destination routing, or local Sign out/Switch account has appeared. Important qualifications are recorded in the draft: crash-resumable voluntary reset needs a durable accepted-intent boundary; a post-reset old-ID reminder is new metadata; saved relay configuration/credentials can remain but restarted memory-only sign-ins/drafts are not guaranteed; full-page routing must preserve extension trusted-page checks; and failed relay removal may have partial local effects, so “state unchanged on failure” cannot promise credential rollback. These facts refine presentation and engineering acceptance without changing existing domain semantics.

The approved layout/session-draft contract remains intact. This ticket stays claimed pending Q6–Q11 and any dependent decisions raised by alternative answers. The final handoff remains blocked here.


## Answer

Resolved on 2026-10-09. The user answered “agree” to all six restated recommendations, Q6–Q11, without exceptions. The approved [control-flow contract](../control-flow-contract.md) contains the entry points, consequences, failure/completion states, runtime allocation and acceptance cases. This resolution supersedes the earlier unanswered proposals in the comment history, including popup Delete placement and blanket unchanged-state-on-failure wording.

The earlier Q1–Q5 answers remain accepted: add an advanced destructive Generate new identity action; give Chrome a quick popup and complete full-page management; remove the duplicate Configure Relays tray command; implement shared System/Light/Dark; show the Dock icon while the main window is open and hide it on close-to-tray.

The remaining choices are now settled:

| Decision | Accepted result |
| --- | --- |
| Former identity | Allow offline local reset. Show/copy the former public Peer ID before and after; explain that other devices may still trust it and that revocation is separate, from another existing Trusted Device. Never claim local reset completed network-wide revocation. |
| Reset review and recovery | Settings → Advanced → Device identity → Generate new identity. Use consequence review, Cancel before start and explicit destructive confirmation; no typed RESET. Distinguish failure before durable acceptance from an accepted incomplete operation. Resume/Retry continues that accepted reset with sharing unavailable; success offers fresh Pairing. |
| Chrome surface allocation | Keep recent Clips, Search/Filters, Copy, Pin, Send, Auto Sync and pending count in the popup. Clip details, including its Delete icon, and Pairing/approvals/management open at the relevant full-page destination. History rows remain Copy/Pin only. |
| History deletion | Confirm Clear all local history, explicitly including pinned and filtered-out Clips and local-only scope. Individual Delete is immediate with failure/Retry. Neither operation promises Undo. |
| Relay account actions | Keep Log in, Manage relay account, Remove relay and existing Edit/Retry with accurate feedback. Do not add local Sign out/Switch account. Portal account-wide actions remain separate. |
| Routine controls | Remove inactive Text/Images/Files switches; replace ineffective Expiry with separate local retention and Clip Sharing Lifetime; expose Use device name for alias clearing; use one state-dependent Android Pause/Resume Auto Sync action and keep Stop background mode separate. Retain the accepted Pairing, approval, permission and diagnostics recovery treatments. |

Preserve the source qualifications in the contract. A voluntary reset and its durable old-ID receipt are new implementation work; retain installation preferences and saved relay configuration without promising survival of memory-only sign-ins or drafts. Unpin can reapply retention and remove an old Clip. Full-page Chrome routing must preserve trusted-page validation and handle stale destinations, live updates and draft context. Relay removal may partially clear local credentials before configuration persistence fails; recovery must reflect authoritative state instead of promising rollback. Waiting for a signed Trust Response may be dismissed, but the delivered request remains valid until its deadline.

The [layout contract](../layout-state-contract.md) remains the visual and ordinary-session draft authority. Control approval is not runtime acceptance or authorization to perform a reset, erase history or change an account. No production code or personal runtime state was changed. The [source-review receipt](../control-flow-source-review.json) preserves the reviewed revisions and hashes separately from approval metadata.

No dependent control decision remains. [Prioritize the UX findings and handoff](08-prioritize-ux-study-handoff.md) is now the next unblocked frontier; it owns consolidated priorities and explicit disposition of the recorded native/display coverage gaps.
