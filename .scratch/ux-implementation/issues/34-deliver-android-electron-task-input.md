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
