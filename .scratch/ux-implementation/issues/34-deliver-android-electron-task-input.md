# Deliver Electron task input and collect remaining host qualification

Type: implementation
**Status:** resolved
Assignee: ux-native-input-34
Priority band: 1
**Blocked by:** [07](07-preserve-session-tasks-and-editor-recovery.md), [12](12-integrate-android-content-bounds.md), [32](32-deliver-local-assets-and-android-shared-controls.md)
Dispatch: 2026-10-14 coordinator claim; approved scope-preserving allocation recorded in run.md
Parent: [Clipp UX implementation](../spec.md)

## Outcome

Electron activation/input reaches the existing shared UiSession/task owner once, with meaningful focus entry and return. The independently completed Android input output is [36](36-deliver-android-task-input.md); every remaining Electron gate stays here.

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

## Reviewed source lifecycle increment — 2026-10-16

Source `6ec0e20c60e4b95e2b2be39726ca81753b4f5c84` consumes pending Electron activation only after accepted host delivery. Definite false/throw retains pending work and clears readiness until valid readiness is advertised again. The production main callback reports false for unavailable/destroyed contents and true only after send. Existing preload subscription, UiSession and shared focus ownership remain; no acknowledgment protocol, retry timer or Dock change. Actual preload/public bridge + real UiSession regressions prove failed delivery recovery, repeated activation/readiness, old disposal and retained nested tasks/draft. These are source tests.34 stays claimed for every recorded actual native input/focus/activation/layout gate.

Both authors passed owning-interface RED/GREEN, npm check and actual unchanged sanitized commit hooks. Mandatory merger fast-forwards preserve exact source ancestry; independent Standards and Spec reviews of fixed9a331ff...6ec0e20 report zero findings. Fresh root npm run verify on clean `6ec0e20c60e4b95e2b2be39726ca81753b4f5c84` / tree `e2128de40aac59de00da5d3c0651462484d3d730` passes152 suites/1124tests, all typechecks/all3productionbuilds, lint0errors/883warnings. Exact ignored evidence: lifecycle-source-integrated-verification.json, lifecycle-source-{standards,spec}-review.md, retention20-lifecycle-handoff.json, activation34-handoff.json and both merge receipts. Original REDs, Git permission denials and superseded focused observations remain preserved.

No native/CUA/SDK/browser/clipboard action or harness preparation occurred. Every failed/unqualified native gate, historical candidate boundary and deferral remains; no source-only resolution, hard-blocked consumer claim, popup retirement, reset30UI or repeated approval request. Primary dirty files/stashes, existing worktrees/branches/artifacts and clean relay remain preserved. Canonical15resolved/10claimed/10open and no unclaimed eligible frontier.

## Maintained native task-input qualification — 2026-10-17

Three test-only commits `41b1d25df848bda8c9ad2115706cb1566af51328`, `ab6c00dd86bd926957f1e32ca7924a534d02eed9` and `a7239bdd1c71d45be1f74b2aa2fdd1832aa354bb` add maintained instrumentation against the actual isolated production MainActivity, packaged React/Capacitor app, HostTaskInput and UiSession. Native pointer, character and Back dispatch remain real; public DOM reads locate and witness controls. No fake router, bridge, acknowledgment or production behavior was introduced. After an actual failure, the test now observes error-focus reopening of the native IME before dismissing it. A separate intermittent enlarged-text touch failure and unchanged-source successful rerun motivated stable visible target/font/native-geometry readiness, with one touch per action and bounded failure diagnostics. All original failures remain preserved.

Mandatory mergers preserve exact ancestry; final source/tree is `a7239bdd1c71d45be1f74b2aa2fdd1832aa354bb` / `08f028902b1b2b4e1b98182a142b9ea145cbef74`. Author checks and actual unchanged hooks pass152 suites/1,154 tests, all runtime typechecks and lint0errors/896warnings. Independent final Standards/Spec reviews report zero findings. Native APK compilation passes; built Android assets hash-match the previously verified production5023 assets. Root did not repeat unrelated full verification for an androidTest-only change.

The final API34 interval passes24 actual invocations:12 real input journeys,6 independent native-text oracles and6 physical-window/WebView measurements. Profiles cover native font1/1.5/2 portrait, landscape2, short/narrow2 and restored defaults. Back hides the real IME before task dismissal, invalid Pairing text/drafts survive, successive task Back acknowledgments return one level with focus, and a recreated Activity becomes ready and loads a real QR image. Image loading is not QR visual/scanner qualification. The owned read-only guest is closed; the original host emulator clipboard-sharing preference is exactly restored. Every guest ran under the previously approved guest-only dual-family network isolation.

Exact ignored evidence: `native34-instrumentation-integrated-verification-20261017.json`, author handoff, all three merger receipts, final review reports and `native34-stable-matrix-a7f82ee1/receipt.json`. Earlier receipts retain the first IME expectation failure, intermittent150% failure, successful unchanged-source rerun and prior QR-only pass. Additional supported-API intervals remain separately recorded and are not implied by this API34 result.

34 stays claimed. Full native activation/readiness/late-event, failed Save, clipboard eligibility/baseline and remaining host/layout gates retain their required scope; scanner15 and desktopG14 are not qualified here. Electron CUA input remains unavailable after approved targeted `open -a` activation and a user-confirmed visible production window; physical human typing is observed, while automated keyboard/coordinate attempts remain failed or unqualified. These observations do not justify speculative product activation/Dock repairs. TT35's explicit bounded acceptance, other claims/dependencies, original collectors and all deferrals remain unchanged.

## Native focus repair and continuing qualification — 2026-10-17

Integrated5c81eb8 observes real decor-window focus and samples actual resumed state on lazy native load, repairing the confirmed clipboard capture while an unfocused confirmation owns input. Required checks/hooks, merger and both review axes pass; exact native focus verification is in ignored `native34-native-focus-integrated-verification-20261017.json`. Later ec638 startup/settings cycle and751 numeric admission repairs remain separately source-bound.

Recorded native journeys cover supported API/input/QR scopes, actual extreme geometry and same-document external Settings return. Exact short340×350/font2 Save remains failed. Strong root-Back assumptions await ordinary AppCompat control comparison; orientation focus readiness and API31 external-return input corrections await native execution. Frozen acceptance-only source receipt `native34-host-lifecycle-controls-source-ready-20261017-7518306-3611f2e.json` makes no pass claim. Electron distinct-bundle native keyboard/editor/Pairing, fullscreen/maximize and measured geometry observations are scoped in its ignored evidence; later controller failures and207.36% versus OS-text-only distinction remain.34 stays claimed; no host split or scanner qualification follows.

## Android host allocation and current Electron failures — 2026-10-20

The coordinator applies the approved cross-runtime refinement: [36](36-deliver-android-task-input.md) now owns and resolves the complete reviewed Android input/IME/root/focus/capture/document-lived output, with exact evidence and no omitted Android gate. Android descriptions above are retained original scope/history; current Android consumer qualification remains with36 and its consumers. This residual34 owns every original remaining Electron activation/readiness, keyboard/focus/context and affected layout gate. Shared bridge compatibility and original13/19 collection remain unchanged.

The fixed b685 tray/Dock interval has user-reported retained context/minimize/restore and separate root native Quit proof. A later precise input interval reports tray-return focus/draft failure and wide/restored keyboard failure. Public AX currently shows retained `native-returnx` and focus on Close name editor; root is collecting exact failure details, not inferring success or a source cause. Minimum Electron audit `native34-electron-scope-remaining-audit-20261020.md` and ignored `electron-input-final-b685-20261020/` retain these failures.34 remains claimed. No extension of TT35's user acceptance or silent native waiver follows.

## Electron focus continuation dispatch — 2026-10-20

The user clarifies the fresh native failure: “Draft remained, keyboard focus wrong”, after reporting tray-return and wide/restored failure. Retained draft is not draft loss. Passive current interval has only measured520×760 outer/520×728 content at zoom1; the requested320/wide geometry was not independently observed, so those remain unqualified. Public AX shows raw native-returnx with focus on Close name editor. Keep these facts distinct; neither derives a source cause or a native pass.

Resume existing ux-native-input-34 in preserved ticket34 worktree/branch codex/ux-34-back-sequence-repair. Inspect and preserve its sole generated Gradle4825 delta and sanitized helper1dbfd; fast-forward from clean-source fa30 to this coordinator tip before editing. Diagnose the actual Electron activation/shared TaskDialog/sessionFocus consumer and establish an owning-interface RED for the observed focus failure before a minimal fix. Preserve meaningful retained focus/selection and user navigation, one document-lived owner and real task/draft state. Do not unconditionally force input focus, add a second manager, mask failure with repeated activation or change the passed Dock contract speculatively. Reuse real consumer tests; external OS boundaries may be inert, private task/controller substitutes do not qualify the caller. Any shared change includes affected live hosts and requalifies the changed Android36 slice.

Root owns native candidate input, exact narrow/wide geometry and final human/controller qualification, check/hook serialization, mandatory merger/reviews. At most two implementers:15 scanner and this34 focus repair. Source author launches no CUA/Electron/SDK/native/clipboard/camera operation. Read ignored electron-input-final-b685-20261020/reported-input-failure-20261020.json and native34-electron-scope-remaining-audit-20261020.md; retain later clarification and every earlier failed/unqualified observation. No whole34/26/finding closure or TT35 exception expansion follows.

## Retained-focus repair integrated — 2026-10-20

Actual passive tray cycles corroborate Device name before hide and Close name editor after return despite focused document/window; the user's retained-draft report remains distinct from focus loss. Source64fb5d7ea68b151d72246a1e9bb7d6080eb6eb42 retains one pre-blur target/task intent in the existing Electron adapter and validates it through the shared focus policy. Newer trusted input, target/task ineligibility, disposal and consume-once semantics prevent stale override. Owning real-consumer regression passes10 cases; required check/actual hook and fresh root verify pass155 suites/1169tests/all3builds. Spec0 actionable; Standards0 breaches and one optional P3 duplicated-lookup note, accepted as maintenance feedback. Exact ignored integrated receipt: `electron34-retained-focus-integrated-verification-20261020.json`.

The fresh “Clipp Focus Fixed 64fb5d7” candidate binds the repaired renderer and uses process-local clipboard memory. Required real tray return, failed Save keyboard recovery and measured minimum/wide/restored keyboard checks remain pending; no source pass substitutes for them.34 and26 remain claimed. Later scanner integrationcb preserves the shared focus-policy bytes and passes the Electron owning harness; no native success follows by implication.

## Answer — 2026-10-20

Scoped output is complete on integrated client6d9dca7448461b03f316083736b28e7cad7896f5/tree17f07b5ad970dc074e9ef9ceb18aec9e83e8aa0b. Fresh root npm run verify passes160 suites/1201tests, all runtime typechecks/all3productionbuilds, lint0errors907warnings. Existing source reviews/mandatory mergers and actual/human native facts are bound in ignored `electron34-26-completion-integrated-verification-20261020.json` (SHA2564f03971cde602506b45a5d1b258ad73d361ff81b784d4dd35b50a4e95cefd0cc); independent `electron34-26-scoped-completion-audit-20261020-human52cc.md` finds no indispensable remaining scoped native gate.

Direct human response “all passed” covers corrected tray-return immediate typing, three-space validation/correction, Escape/Return retained draft and minimum/wider/restored ordinary keyboard access. Passive logs corroborate fixed-return→fixed-returnx, focused controls at320×728 and wider742→740×728; final ordinary outer740×760 is recorded without claiming exact original520 restore. Prior actual Dock/query/task/minimize/restore and independent native-menu Quit remain valid for unchanged window policy. The final owned fixed candidate also exits through actual native app-menu Quit: passive window-closed/will-quit and absent exactPID24576, profile retained inert. Every previous failed input/provider/controller observation and optionalP3 source note remains preserved.

This resolves only the named host/tray output.13 retains collection,15 scanner,16 notifications and17/18/19/later consumers retain their own gates. E10 awaits24 reachability and E17 original13/shared-host contribution; no broad finding, G14/assistive/hardware/clipboard/reset pass or TT35 exception extension follows.
