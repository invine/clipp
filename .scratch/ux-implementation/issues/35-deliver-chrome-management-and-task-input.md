# Deliver complete Chrome management, secure handoff and task input

Type: implementation
Status: claimed
Assignee: ux-chrome-management-35
Priority band: 1
Blocked by: 02, 03, 06, 07, 08, 32, 33
Dispatch: 2026-10-14 coordinator claim; approved scope-preserving allocation recorded in run.md
Parent: [Clipp UX implementation](../spec.md)

## Outcome

Exact canonical full-page Chrome provides complete live management, authenticated recoverable handoff and shared task input before popup management is retired.

## Work and boundaries

Consume resolved02 authoritative History/query,03 Clear review/results,06 QR/Copy results,07 session tasks/editor recovery,08 recovery composition,32 compatible shared assets/controls,33 common Pairing outcome interface. Co-deliver Chrome13 input: genuine uninspected toolbar Escape/click-away can destroy the popup; full-page Back/Escape/Close uses the shared UiSession/TaskDialog and real native keyboard/focus entry/return. No destroyed-popup draft promise.

Compose complete shared Clip details with full exact content and Copy/Pin/Delete, Requests/guarded approval, Pairing chooser/Paste/QR/image-import and outcomes/recovery, Device Name/alias, relay configuration/actions and real General/Appearance/Clip settings with Clear review. Supply minimum functional details/settings presentation now; later21/23/24 density/M1/M3 polish remains. Replace independent options projections only after corrected live consumers exist. Shared rendering does not grant runtime authorization. Full-page must have neither popup-only current-clipboard Send nor automatic focus capture; retained Copy still uses its proper owner.

Implement approved named runtime.Port page registration + bounded trusted chrome.storage.session navigation mailbox. Actual sender ID/exact canonical URL/page-tab identity, allowlisted destination/context/handoff ID only; no body/history/credentials/URLs/editor drafts. Reject query/hash/lookalike/content/offscreen senders. Persist acceptance before source can disappear; expose actual pending/applied/failed/unconfirmed and bounded retained failure notice with retry/dismiss. Prefer ready idle same-window then another idle page; all occupied creates new canonical tab. Destination atomically declines stale-idle reuse, matching current task may focus while retaining context/draft, duplicate handoff is idempotent. Await usable authority and reconcile stale targets. Worker reconnect/lost ack/uncertain creation must reconcile original handoff before retry. No reload, task URL router, tabs.sendMessage page delivery or exactly-once tab creation promise. Preserve Chrome109 callback-listener compatibility. Native notification entry calls the same coordinator internally; actual delivery/permission/selection remains16's contribution to original11 and is not a fabricated popup sender.

Normative: [complete management contract](../../ux-implementation-plan/correctness-delivery-proposal.md#complete-chrome-management-and-secure-destination-handoff), [Chrome handoff/session contract](../../ux-implementation-plan/shared-interface-proposal.md#chrome-destination-handoff), [preserved contracts](../spec.md#preserved-contracts). Every affected live runtime bridge changes with shared action contracts; use core/shared UI, preserve credentials/background/offscreen transport authority, ADR0012, partial outcomes and accepted capability limits.

## Verification and acceptance

Actual-owning-interface RED/GREEN covers canonical sender/schema, trusted mailbox acceptance/readback/failure, new/idle/occupied/matching/stale-idle and two rapid destinations, target removed, duplicate/lost ack/worker reconnect/uncertain create/expiry/failure notice, callback transport failure, actual authority readiness and no full-page capture/Send. Render/action tests exercise the real full-page wrapper+shared session/action consumers and all actions/errors/live state, failed/newer/suspended draft/return focus. A helper alone behind old options path is incomplete.

Every affected [common candidate gate](../spec.md#verification-and-evidence) and [coverage disposition](../validation-coverage.md) remains required. Root verifies real ordinary uninspected toolbar popup Escape/click-away and destruction after accepted handoff, complete full-page real keyboard/tasks/drafts/actions/errors/current authority, simultaneous views/worker interruption and actual new/reuse/occupied/stale/duplicate/failure routes. Include actual popup bounds and full-page320px/narrow/short/restored/wide/default/intermediate/200% text/zoom/spacing, themes/offline assets/named controls/full long values/last controls. G36/G39/G40 and own affected desktop/control gates includingG13/G14 remain explicit;32's Android result is no Chrome pass. Requalify actual Chrome Pairing G01 through normal permitted transport, retaining10's collector and broaderG31 disposition. An unavailable owned Chrome peer route leaves that required portion unqualified; no source-only completion or policy weakening.

Functional state/action/error/draft/focus parity and secure handoff must pass before retiring popup management. Stage destination with old entries retained; record explicit candidate-bound cutover decision and then repeat affected paths.16 owns genuine notification delivery/permission/selection, original11 collectsG02 and Requests entry when supplied. If35 changes or claims that OS route, its affected actual entry proof becomes required here too; source dispatch does not grant a gate waiver. Other original candidate/native/control/Pairing/cutover/collector gates remain allocated in11/13/17/19/16/10 and later migrations. Sign-in/export/native participation deferrals remain unchanged.

Run focused owning-interface tests and npm run check before code commit; root performs merger, Standards+Spec and fresh integrated verify/native checks. Label fixtures/DOM/programmatic input vs actual native and human selection. No passing SDK/build substitutes for acceptance.

## Coverage and closure

35 resolves only for its integrated/reviewed/freshly verified scoped output with every required candidate gate. Original11 retains C11/C12 collection and original supporting17/19/16 contributions;13 retains A03/input collection, with Chrome output supplied here and Android/Electron34.10 retains Android/Chrome G01 collection; all statuses/findings stay open until their own completion gates. Later compact consumers requalify migrated surfaces. No source-only resolution or broad finding closure.

## Source anchors

- apps/extension/manifest.json; src/options.html/options.tsx/options-host.css; popup.tsx/popup-host.css; background.ts; managedRelayUi.ts; popupClipboardActions.ts; popupCapture.ts; runtimeRecovery.ts; useSettings.ts; useHistory.ts; pairingActions.ts
- packages/ui/src/ClipboardApp.tsx; uiSession.ts; TaskDialog.tsx; sessionFocus.ts; ManagedRelaySettings.tsx; PairingCodeContent.tsx; ClipSettings.tsx; ClearHistoryReview.tsx
- packages/core/runtime/uiRecovery.ts; state/settings/action authorities and notifications.ts; core-owned destination schema only if genuinely shared
- tests/extension/managedRelayUi.test.ts; popupCapture.test.ts; tests/ui/uiSession.test.ts/workspaceNavigation.test.ts/optionsRecovery.test.ts/clearHistoryReview.test.ts; tests/harness/workspace-navigation.mjs (rendered fixture only)

## Handoff

Root refreshes canonical claim/tip/decision and records the co-delivered Chrome13 allocation. Implementer records RED/GREEN, meaningful focused checks/npm check/full commit, each real wrapper/bridge, current-tip incorporation, parity/cutover state, secure mailbox/native results and exact outstanding gates. Source-only handoff cannot resolve35. This DRAFT has not run or changed source.

## Resume assessment — 2026-10-16

Resume existing claim `ux-chrome-management-35` after confirming all named predecessors remain resolved. Two fresh isolated contributors start from integration `f3e1a531bef8d746126a6af39c386608f44fb840`: `codex/ux-35-ui` owns shared UI/session and actual popup/options composition; `codex/ux-35-runtime` owns trusted Port/mailbox/handoff runtime and the pure destination schema. Preserve the old worktree and stash `c6058cba77d010d497c4bfc31674af4f7c10b634`; its tracked patch and 13 untracked source files were exported only as reference. Do not apply or drop that stash wholesale. Exact access/ownership is in ignored run `ticket35-resume-worktree-handoff.json`.

Continue the real producer/consumer implementation and current-source correctness through approved owning-interface TDD. Preserve ticket29's generation/auth/startup protections and invalidate old reset handoffs without losing ordinary worker-reconnect reconciliation. Root owns native execution, canonical updates, mandatory integration, both reviews and fresh integrated verification.

Stage the complete canonical management destination while existing popup management remains functional. **No popup retirement or cutover before required actual parity, secure handoff and native qualification.** G01/G13/G14/G36/G39/G40 and every original collector/contribution remain required; missing public peer/alternate OS text-size host are not waived. No repeated approval/readiness request, real account/sign-in, operator profile, push or deployment is introduced.

## Reviewed implementation and partial native results — 2026-10-16

Two isolated contributors delivered runtime `b545bddeb552d51b985170f03d1be123ed6accee` / `64781b5b9502fd1a3d2f99c1b623d52317e46cae` and UI `b6049cab7cf718b2a1628ef7e7eb270ccd9441e5`. Mandatory fast-forward merges preserve every source commit. The implementation restricts session storage to trusted contexts, enforces canonical page/tab/frame identity, retains original handoffs across ordinary worker reconnect, invalidates reset handoffs, preserves shutdown safety on mailbox failure, bounds callback/window lookup uncertainty, and makes management callbacks exclusive to their installer. Shared session/editor/import activity and the real full-page wrapper consume current ordered authority; popup management remains functional.

Spec review found a P2: explicit Discard during an unread image import could still submit after the read completed. Single-author repair `b415af1508e70e84a4ca061726057839e9d1620f` retires unread import/retry ownership and ignores old success/error without disturbing newer work. Ordinary Close and already-started submission retain their behavior. Original RED/failure and Spec report are preserved; renewed Standards and Spec reviews pass with zero findings. Fresh root `npm run verify` on clean b415 passes 152 suites / 1,088 tests, all typechecks / all three builds, lint 0 errors / 871 warnings. Hash-bound receipt: ignored run `ticket35-integrated-verification.json`; author, merge, review and original/supplemental rendered-fixture pointers are included. DOM fixtures remain distinct from native proof.

Actual uninspected Chrome143 canonical full-page checks on the b415 production assets observed native Search typing, Device Name task focus, Escape return focus, retained query/draft on reopen, actual Save, current Settings and a visibly applied Dark preference followed by a saved System selection. Five browser zoom-in chords and reset were observed; exact percentage was not independently read, so no 200% gate passes. Initial direct startup navigation showed Network error and recovered with native Reload after extension startup; that failure remains recorded. All 43 assets match launch hashes. The supervisor signal probe returned EPERM; exact original traceback and a separate OS inventory proving owned PID/group absent and profile removed are retained. Evidence: `ticket35-native-fullpage-b415/`, independent scope/asset audit `ticket35-native-partial-audit.md`. Earlier actual headless Port metadata at `ticket35-actual-port-observation/` remains bound to 8cf/f3e and proves only its stated sender seam.

**35 stays claimed.** No popup retirement/cutover, actual toolbar lifetime/handoff matrix, full simultaneous-view/worker interruption routes, complete native action/keyboard/layout/appearance matrix, G01/G13/G14/G36/G39/G40 or collector closure follows. Required public Chrome peer and alternate OS text-size host remain unavailable. No clipboard or global setting access occurred in this full-page run. All earlier failures, deferrals, reset29 gates, primary changes and preserved worktrees/stashes remain.
