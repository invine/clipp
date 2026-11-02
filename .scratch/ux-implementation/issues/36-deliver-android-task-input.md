# Deliver Android task input against existing tasks

Type: implementation
**Status:** resolved
Assignee: ux-android-input-36
Priority band: 1
**Blocked by:** [07](07-preserve-session-tasks-and-editor-recovery.md), [12](12-integrate-android-content-bounds.md), [32](32-deliver-local-assets-and-android-shared-controls.md)
Dispatch: 2026-10-20 coordinator scope-preserving host allocation from reviewed claim34
Parent: [Clipp UX implementation](../spec.md)

## Outcome

One actual Android native Back reaches the existing shared UiSession/task owner once, with meaningful focus entry/return and resumed-and-focused clipboard eligibility. This is the independently completed Android output formerly allocated within34. [34](34-deliver-android-electron-task-input.md) retains every remaining Electron input/activation/layout gate; this issue does not resolve it.

## Work and boundaries

Consume completed07 session/task recovery,12 measured content bounds/IME and32 compatible shared controls. Keep one document-lived UiSession and existing Android wrapper/HostTaskInput, with no second router, store or focus manager. Preserve draft/query/scope/scroll and failed/newer Save semantics while the document lives; no destroyed-document draft promise.

Native Back owns visible IME first, registered overlay next, one task level next, then ordinary host root behavior. Repeated/late events, readiness/disposal, late Save and disappeared-invoker recovery retain their owning-interface checks. Keep native handles out of public UI state. Maintain resumed AND focused clipboard eligibility and observation baselines through native dialog/focus loss/Settings return; input does not create an unintended Clip or background access.

Supply the typed overlay/capture hook for15 without enabling an unsafe scanner provider. Scanner-specific acquisition/abort/camera tracks/late decode and native scanner Back remain15. Displayed QR, Pairing chooser without automatic keyboard and nested existing tasks are this foundation's scope.

Normative: [native task input](../../ux-implementation-plan/native-host-delivery-proposal.md#native-task-input-and-focus), [shared session/host contract](../../ux-implementation-plan/shared-interface-proposal.md#ui-session-and-host-task-contract), [preserved contracts](../spec.md#preserved-contracts). All live shared bridges remain compatible. This allocation changes no accepted behavior, qualification or ADR.

## Verification and acceptance

The scoped Android requirements remain the full original34 Android gates: actual Back/IME/nested tasks, failed Save/raw and newer drafts, focus return/last control, native focus/dialog/Settings baseline, document-lived return/reflow, default/intermediate/enlarged portrait/landscape and320px/exact340×350 extremes. Source tests own repeat/late ACK/readiness/disposal/late Save/missing-invoker races and are labelled fixtures, not OS runs. Record actual physical/content/CSS sizes and native font behavior separately.

Apply common candidate checks, affected native build and both independent review axes. Camera/provider/physical/OEM/assistive gaps retain their accepted dispositions; no scanner, desktop G14, full19 navigation or broad collector closure follows. Later consumers requalify their changed presentation.

## Answer — 2026-10-20

Coordinator resolves the genuinely completed Android-only output on clean integration `9d602988c57f592f0005e42dbe6160235de2113a` / tree `9464a8cd2155f5cd68a3d14555edaefd07bd74ed`, under the specification's approved cross-runtime refinement. Reviewed production repairs and existing shared/native task interfaces are integrated; final5-file acceptance increment contains no production change. Mandatory merger, independent Standards0/Spec0, fresh required sourcecheck and actual sanitized hook pass155 suites/1169tests with lint0errors/899warnings. Fresh b685 full verification passes all runtime typechecks/three production builds, unchanged by this acceptance-only increment; exact final native APK compilation passes.

Actual final native input uses one guarded accepted OS DOWN/UP pair with current timestamps, real elapsed gesture duration and stable public/native geometry. Exact340×350/nativefont2 rejected Save/raw/newer typing/Back/reopen/final Save, nested IME/Pairing and QR/recreation pass. Separate current normal-root, live document rotation and default input pass; final capture/dialog/Settings baseline passes after correcting a proven stale SystemUI accessibility-node race. Plain AppCompat and ordinary passthrough controls both finish once on this host; actual product root Back matches that ordinary lifecycle. No guarantee is made across a destroyed document. Live Settings return and orientation separately preserve same Activity/WebView/document, draft/query/Pinned scope/scroll/focus.

Seven representative methods pass across immutable intervals: `native34-final-os-3685dc07` contributes3 passes before its preserved stale-node failure, `native34-final-os-remaining` manifest identifies3 further passes, and `native34-final-overlay-3b86ef6d` contributes final capture. FinalHost466/private-overlay-only change and commonNativePublic088 are bound to committed source. Earlier actual API31 capture, post-ec API33 four input/QR cases, API35/36 input/QR and default/intermediate/enlarged/landscape/320/exactshort measurements retain their exact source/profile mappings. This does not relabel earlier failures as passes or require an invented fault-timing campaign. NativefontScale2/API34 WebViewtextZoom175 is recorded honestly.

Ignored evidence root: `/Users/invine/src/js/clipp/.local/ux-implementation/run-20261010/`. `native34-final-host-integrated-verification-20261020.json`, `native34-final-native-contribution-20261020.json`, source handoff, merger and both final reviews bind exact source/APK/commands and all earlier observations. Every owned Android interval closed and the prior host emulator clipboard-sharing setting was exactly restored after closure.

Residual34 retains Electron native return-focus, failed Device Name Save/recovery and narrow/wide/restored keyboard qualifications, including the latest user-reported failures.15 scanner,16 notifications,17 desktop controls/G14,19 full navigation/reflow and original13/A03 collection remain separate. TT35's exception is unchanged. No finding or release qualification closes here.
