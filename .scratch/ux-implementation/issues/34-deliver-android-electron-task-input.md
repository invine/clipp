# Deliver Android and Electron task input against existing tasks

Type: implementation
Status: claimed
Assignee: ux-native-input-34
Priority band: 1
Blocked by: 07, 12, 32
Dispatch: 2026-10-14 coordinator claim; approved scope-preserving allocation recorded in run.md
Parent: [Clipp UX implementation](../spec.md)

## Outcome

One Android native Back or Electron activation/input reaches the existing shared UiSession/task owner once, with meaningful focus entry and return on the integrated candidate.

## Work and boundaries

Consume completed07 session/task recovery,12 measured Android bounds/IME,32 compatible controls/qualified Android foundation. Lift the existing document-lived UiSession into the real Android/Electron wrapper where the host adapter needs it and pass the same session to ClipboardApp. Preserve drafts/query/scope/scroll/failed Save/newer typing. No second router, store or focus manager.

Android owns real native Back/IME signals: visible IME first, registered active overlay next, one task level next, then normal root behavior. Prevent one event from closing a task and leaving the app, including repeated/late events and disposal/readiness. Define the typed overlay/capture hook for15; that later scanner consumer owns cancellation/abort, camera tracks/late decoding and real scanner evidence. Do not enable or claim the unsafe unqualified provider merely to demonstrate input. Displayed QR and existing nested task Back qualify here. If an active scanner cannot safely consume this hook yet, record that exact scanner branch as unqualified with15; never fall through to close a parent task while a scanner remains active.

Electron main/preload/renderer deliver activation after actual readiness to the existing live session; retain hidden renderer context and sensible focus, not a competing focus manager. Qualify actual Tab/Shift-Tab/Enter/Escape. Main/preload remain CommonJS with relative shared imports. Preserve Android resumed AND focused clipboard eligibility and observation baseline after reopening, including native dialogs/focus loss/resume; native input must not create a Clip or background access.

Normative: [native task input contract](../../ux-implementation-plan/native-host-delivery-proposal.md#native-task-input-and-focus), [shared session/host task contract](../../ux-implementation-plan/shared-interface-proposal.md#ui-session-and-host-task-contract), [preserved contracts](../spec.md#preserved-contracts). Every changed live bridge/consumer must remain compatible. Chrome adapter/input is co-delivered in35;13 remains original collector.19/17 retain their full navigation/reflow/desktop gates. No native qualification is inherited from integrated source.

## Verification and acceptance

Owning-interface RED/GREEN tests must exercise the actual adapter and real UiSession consumer: IME vs overlay vs nested task vs root, exactly one dispatch, repeated/delayed events, disposal and readiness, failed draft/late Save/disappeared invoker. Preserve actual client capture eligibility during native lifecycle changes. Source tests/DOM callback checks are labelled as such.

Apply every affected [common candidate gate](../spec.md#verification-and-evidence) and [coverage disposition](../validation-coverage.md). Root owns actual Android native build and guarded runtime qualification: repeated/nested native Back, real IME closed/open, displayed QR, Pairing chooser without automatic keyboard, failed Save/draft retention, last control, focus loss/native dialog/resume, portrait/landscape and affected default/intermediate/200% short/narrow profiles. Actual Electron keyboard containment/entry/return, activation/readiness, hide/reopen and relevant restored/wide/max/fullscreen/restore and320px/340×350 profiles are required. Keep G16/G25/G26/G39 and affectedG40 contributions explicit; scanner-specificG26 is15's later contribution. VoiceOver/TalkBack/hardware keyboard/foldable limits retain their accepted dispositions; claimed changes cannot be waved through those limits.

Run npm focused owning-interface checks, npm run check before code commit; root merges/reviews Standards+Spec and verifies the integrated candidate with applicable native gates. Record exact revisions/dirty state/versions/units/commands, observed behavior, failures/not-run cases and preserved artifacts outside disposable worktrees.

## Coverage and closure

34 may resolve only after its scoped source is integrated/reviewed/freshly verified and its required native candidate gates pass.13 retains A03 collection and all Chrome/scanner/later-navigation contributions;19 retains E06/C06/shared navigation/geometry/reflow collection;17 retains desktopG13/G14.15 requalifies actual scanner input/safety; later migrated consumers requalify their own entry. Broad collectors do not create descendant dependencies for this foundation. No finding closes here by implication.

## Source anchors

- apps/android/src/main.tsx; hostGeometryNative.ts; client.ts; backgroundContinuity.ts; Android MainActivity.java/HostGeometryPlugin.java/BackgroundContinuityPlugin.java
- apps/electron/src/main.ts; preload.ts; renderer.tsx; renderer bridge declarations
- packages/ui/src/uiSession.ts; TaskDialog.tsx; sessionFocus.ts; hostGeometry.ts; ClipboardApp.tsx provided session prop
- tests/ui/uiSession.test.ts; hostGeometry.test.ts; workspaceNavigation.test.ts; tests/android/backgroundContinuity.test.ts; tests/android/continuityControlsOwner.test.ts

## Handoff

Root owns canonical claim, refreshed baseline and accepted-decision assessment. Implementer records owning RED/GREEN, meaningful focused checks/npm check/full commit, current-tip incorporation, every changed live bridge, source-to-integration mapping and remaining native limits. Source-only handoff is not resolution. No operation has occurred for this DRAFT.

## Remaining source lifecycle dispatch — 2026-10-16

Continue existing claim from clean integration `9a331ff93c43fec62771b412e3a11ac8f738aded`; named predecessors remain resolved. Electron activation source delivery: retain pending activation when the ready renderer disappears or delivery throws/declines. Retry only after valid readiness, keeping the existing main/preload/renderer session and focus owner. Prove actual owning public activation/bridge/UiSession path with existing tests; do not change Dock behavior or native qualification.

Two fresh isolated implementers maximum, retained ticket-34 branch/worktree fast-forwarded from its inspected clean prior tip. Approved public owning-interface TDD seams and standing approvals persist. Root owns broad-check serialization, integration, two-axis review and fresh verification. Preserve ADR0012, existing worktrees/stashes/dirty files, every failed/unqualified native gate and deferral. No native/CUA/SDK/browser/clipboard operations, harness preparation, repeated approval request, consumer claim across hard dependency or source-only ticket resolution.
