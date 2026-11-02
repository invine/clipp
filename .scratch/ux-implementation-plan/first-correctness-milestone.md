# First correctness milestone and migration sequence

Approved 2026-10-10 in [Choose the correctness-first migration sequence](issues/01-choose-migration-sequence.md#answer). **Approved planning scope.** Small, independently verifiable steps are also approved. This document defines a bounded first checkpoint within the correctness phase, not completion of all first-band work, implementation or release acceptance.

## Approved direction

Make the first milestone **Reliable state and recoverable actions on existing surfaces**. Start with **Chrome preference integrity**: an unrelated settings change must never re-enable Auto Sync, and a failed save must not look successful. Then repair live History/Clear and the existing name, Pairing, approval and QR action feedback in separate reviewable steps.

These changes address incorrect sharing settings, stale/deleted data and misleading action outcomes through seams that remain useful in the approved workspace. Keep the current surfaces available during this milestone; do not move management to an incomplete full-page destination. Remaining first-band access, theme, recovery composition and native-control work follows next, using the approved components where practical, before treating the compact workspace as complete.

## Scope of the first milestone

The rows define the approved milestone scope, not final execution tickets or a requirement to serialize unrelated work. Each shared behavior change includes every affected runtime adapter and consumer. The first slice is selected by the concrete unintended Auto Sync change and its bounded existing mutation seam.

| Slice | Observable result | Scope and meaningful verification |
| --- | --- | --- |
| **Chrome preference integrity — first** | Change one field without writing stale values for another. Open popup/options agree with authoritative applied settings. Pending/rejected changes are visible and do not leak into a later unrelated save. Remove inactive Expiry and Text/Images/Files controls; retain working Auto Sync/log level. | Target C01/C10 and the removal portion of C02. With both surfaces open, disable Auto Sync in one and change log level in the other; it stays disabled. Exercise concurrent changes, rejected persistence, lost/error response and reopen. Distinguish applied state from unsaved draft; preserve trusted sender checks. |
| **Current History and explicit Clear all** | Every open view reflects additions, deletion, Clear, retention and unpin-driven removals without reload, under its current query/scope. Clear all explains its full local scope and asks for confirmation. | Target C09/E09. Cover a delayed initial/search response arriving after a newer mutation, active no-match, pinned/filtered-out Clips, Cancel with no mutation, failure/Retry, and durable-clear-before-pending ordering. Preserve query/scope and truthful empty/no-match feedback. No Undo or remote-deletion promise. |
| **Recoverable existing edits and immediate Pairing/approval results** | Failed Device Name/alias edits and Pairing submission retain editable input. Controls await the actual action result; pending prevents ambiguous duplicates. Rejection, missing/stale request and partial effects have truthful nearby recovery. | Scoped portions of E11/C07. Cover promise rejection, runtime message failure, explicit false result, stale entity, and failure after a durable side effect. Verify shared controls in Electron, Android and popup plus the separate current options callbacks where present. Contain Android diagnostics when needed so the repaired action stays usable. |
| **Truthful QR generation and Copy** | Generation has pending, ready or failed state and a reachable retry; failed generation never produces an empty Hide state. Copy reports its actual result. | Target C08 and related QR action behavior. Preserve a valid text-only fallback for an oversized target; no image does not always mean generation failed. Payload Copy does not invoke explicit retained-Clip reuse or Share Now and does not complete Pairing; ordinary clipboard capture policy remains unchanged and may observe the copied text. Test the clipboard boundary without claiming OS permission acceptance. |

The History and Clear work should share authoritative update semantics; its final split is decided by [Scope correctness and recovery delivery](issues/03-scope-correctness-and-recovery-delivery.md). A settings-only repair does not have to wait for History, native scanner work or every new task component.

## Source facts that constrain the repair

- [Options settings](../../apps/extension/src/options.tsx) currently sends the whole local settings object, while [background settings handling](../../apps/extension/src/background.ts) already accepts partial fields. However, background first writes the candidate and then [Auto Sync preference](../../packages/core/runtime/autoSyncPreference.ts) writes Auto Sync again. A later failure can follow an earlier durable change. Blindly restoring an old checkbox on every error would also be misleading; reconcile persisted and active state and explain any unresolved failure.
- [Chrome History](../../apps/extension/src/components/ClipHistoryList.tsx) separately requests search results and listens for additions. Background currently broadcasts `history.onNew`; [the store](../../packages/core/history/store.ts) does not expose a generic mutation event. A full public History snapshot is available, but the plan must cover publication/invalidation after non-addition mutations and order stale responses correctly. Do not change retention, suppression or Clip identity policy to repair the view.
- [Shared actions](../../packages/ui/src/ClipboardApp.tsx) can close failed name edits and clear Pairing input before completion. Some wrappers return before their callbacks or swallow rejection. The following [shared-boundary decision](issues/02-define-shared-state-actions-and-task-boundaries.md) must establish the minimum result/authority contract before these changes are dispatched; this milestone does not predetermine a new global framework.
- [Pending approval](../../packages/core/pairing/pending.ts) can return false for an absent/expired/revoked request, and Admission can precede sending the response. A later transport failure does not prove membership stayed unchanged. Similarly, [relay removal](../../apps/extension/src/managedRelayConfiguration.ts) can erase credentials before later persistence fails. Recovery must reflect actual effects.
- [Pairing runtime coordination](../../packages/core/pairing/runtimeCoordinator.ts) exposes waiting and error state, but removal from waiting alone does not say whether a response was accepted, rejected or expired. Authoritative terminal-outcome presentation belongs to the remaining first-band task/state work; this milestone must not invent an outcome from disappearance.
- [QR generation](../../packages/core/pairing/qrCode.ts) permits an oversized-target text fallback. Reuse that behavior. Keep [trusted popup/options checks](../../apps/extension/src/managedRelayUi.ts) and [popup-only Share Now](../../apps/extension/src/popupClipboardActions.ts) intact; no connection-policy or capability expansion is needed for truthful errors.

## Minimum usable feedback is included

Every repaired action must have readable pending/error feedback and reachable recovery in its current surface. Include the local wrapping, sizing, keyboard naming/focus and scroll corrections necessary for that action. Do not add another global banner to broken fixed rows or leave Android Pairing diagnostics above a full-height shell where they push recovery out of view. A bounded diagnostic presentation may accompany the action repair.

This does not claim the complete shared issue-summary design, universal task focus, session drafts through resize/dismissal, all enlarged-text layouts or safe-area integration. Those are explicit next first-band work. If a concrete access defect prevents a new recovery control from being used in its tested surface, that defect is part of the slice's exit condition rather than an excuse to call an unusable control done.

## Finding coverage and what remains

These are planned repair boundaries; no finding is marked fixed during planning. Canonical criteria and evidence remain in the [finding register](../ux-study/handoff-findings.md).

| Finding | First milestone coverage | Remaining work |
| --- | --- | --- |
| C01, C09, C10, E09, C08 | Target their complete registered criteria within the studied/current action surfaces. | Renew evidence on the actual implementation candidate; no old study capture counts as a pass. |
| C02 | Remove misleading inactive controls. | Implement and validate real separate local-retention/Clip Sharing Lifetime controls and all runtime wiring in the assigned later slice. |
| C07 | Immediate decode/validation/submission/approval feedback and retained failed input. | Authoritative waiting/terminal outcomes and complete full-page task presentation. Do not mark the whole finding complete from callback-error handling alone. |
| E11 | Device Name/alias and approval result/recovery portions; authoritative handling of touched partial-effect paths. | Complete relay error/partial-effect treatment and any remaining edit lifecycle cases in the owning first-band work. |
| A13, E02, C04, E06 and related geometry/access findings | Only supporting corrections necessary to make the repaired action feedback reachable. | Complete bounded diagnostics, issue composition, task focus and responsive/native acceptance in the following first-band work. Supporting repairs do not close the whole finding. |
| C16 | Preserve existing focused read/offscreen write and manual-action feedback semantics. | Automatic capture failure context and its recovery presentation remain first-band work with the shared recovery/task contract. |

The complete [native gap ledger](../ux-study/remaining-native-coverage.md) remains unchanged. This milestone does not establish complete app-to-app Pairing, actual notification delivery/selection, normal Chrome permission recovery, account authorization, physical-display coverage or assistive-technology acceptance.

## Migration after this checkpoint

| Stage | Boundary |
| --- | --- |
| **First correctness milestone** | The scoped state and action results above, delivered as independently verifiable steps. |
| **Remaining correctness and usable controls** | Shared local assets/readable fields/working theme; navigation and focus; drafts through tasks and resize; bounded issue composition and automatic capture feedback; Android insets/IME/Back/scanner/permission recovery; authoritative Pairing outcomes; functional, secure Chrome destinations where needed for approvals/recovery. Plan these immediately, not as cosmetic work after the workspace. |
| **Complete compact workspace** | Finish the accepted History rows/grid/detail, M1 Devices, M3 Settings, S2 status and all runtime surface cutovers, reusing the corrected state/actions and access primitives. Implement approved components early when they are the sensible way to fix a first-band problem. |
| **Additional controls and bounded shell cleanup** | Durable manual identity reset; remaining alias/lifetime controls and tray work in their assigned band, with related small changes allowed alongside their owner. Dock behavior requires revalidation before a presumed repair. |

These are priority checkpoints, not a global barrier that prevents an independent high-priority native repair from progressing while a settings slice is in review. Exact execution dependencies follow shared contracts and evidence needs; the planning graph is not the implementation graph. This planning decision creates no new implementation-agent or worktree authorization.

## Coexistence and cutover rules

1. Current popup/options/Electron/Android controls remain available until their replacement is functional. Temporary old/new layouts are acceptable; divergent authoritative data, mutation semantics and permission/sender rules are not.
2. Carry the durable state/action corrections into replacement components. A thin transitional adapter is acceptable; do not establish a second permanent product state model or build a disposable redesign of options.
3. Before moving Chrome management, the full-page destination must have complete required actions, live updates, honest errors, preserved session drafts, valid focus and stale-target handling. Popup dismissal and notification entry must reach the intended destination while retaining trusted sender boundaries. A link to an incomplete screen is not cutover.
4. Every changed shared action includes all affected bridges and existing consumers within that step. Chrome-only preference/projection repairs do not require artificial Electron/Android changes, but a shared callback contract change does.
5. Remove replaced paths only after their parity/regression checks pass; preserve user state and accepted capability differences. Do not migrate public Clip/identity/membership semantics merely to move UI ownership.

## Exit checks

- **Behavior regressions:** cover each slice's successful, rejected, partial-effect and stale-response cases at the responsible boundary. Tests must expose the observed failure (especially stale settings and stale History) and verify final authoritative state, not just match component structure.
- **Current-surface execution:** exercise popup and options concurrently for settings/History, and replay the touched shared actions in each consuming runtime with isolated synthetic state. Visually/native-input check readable retained fields and reachable recovery at representative studied narrow sizes, plus relevant short/long-error cases. If the changed flow cannot be exercised, record that limitation and leave its scoped acceptance outstanding.
- **Preserved semantics:** Clear keeps durable-before-pending ordering and local scope; Copy/Send/QR Copy remain distinct; no sender or connection-policy weakening; no inferred rollback after partial effects; existing session pin/capture constraints remain intact.
- **Candidate checks:** targeted affected regression suites plus `npm run verify` on the integrated candidate, and `npm run check` before future code commits. Retain exact revision/dirty-state evidence and Standards/Spec review under [project workflow](../../docs/agents/workflow.md). Routine build/test success is not native acceptance.
- **Traceability:** mark only each finding portion actually implemented and checked. Keep next first-band work and every accepted unverified gap attached to its owner. No sign-in, unavailable display or accepted VoiceOver check is needed to prove the bounded state/action claims above; none is relabeled as passed.

These conditions will be assigned to exact execution tickets by the later planning decisions. They are completion requirements, not results already obtained.

## Decision record

The user's approval and rationale are recorded in the [migration ticket's resolution](issues/01-choose-migration-sequence.md#answer). The subsequent [shared-interface decision](issues/02-define-shared-state-actions-and-task-boundaries.md#answer) is also resolved. Consult the planning map and ticket dependencies for the current frontier; final execution tickets will be produced after the remaining planning decisions settle.
