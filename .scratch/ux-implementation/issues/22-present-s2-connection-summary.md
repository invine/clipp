# Present the S2 connection summary

Type: implementation
**Status:** resolved
Assignee: ux-summary-22
Priority band: 2
**Blocked by:** [02](02-reconcile-authoritative-history.md), [08](08-compose-actionable-recovery-issues.md), [17](17-unify-local-assets-and-shared-controls.md), [19](19-deliver-accessible-navigation-and-reflow.md)
Dispatch: authorized UX implementation run ux-implementation-20261010; coordinator claim ux-summary-22
Parent: [Clipp UX implementation](../spec.md)

## Outcome

One header icon gives an honest S2 connection summary and opens useful detail.

## Work and boundaries

Derive trusted direct/relayed/offline and configured-relay faults from real runtime state, preserving unknown. Use original green triangle for direct, accepted amber/attention distinctions and grey offline/unknown. Expose an accessible status name and expandable panel.

Direct connectivity does not suppress a configured relay fault. No healthy count from untrusted transport; Auto Sync is separate and no Synced/delivery guarantee. Devices retains text statuses.

The [approved package contract](../../ux-implementation-plan/workspace-delivery-proposal.md#s2-connection-summary-and-panel) is normative detail for this ticket. Preserve the [shared interfaces](../../ux-implementation-plan/shared-interface-proposal.md) and [specification invariants](../spec.md#preserved-contracts). Update every affected live runtime bridge with its consumer; do not leave a successful helper behind a broken caller.

## Dependencies and integration

- [Reconcile authoritative History and queries](02-reconcile-authoritative-history.md) — consume its completed, scoped output.
- [Compose actionable recovery issues](08-compose-actionable-recovery-issues.md) — consume its completed, scoped output.
- [Unify local assets and shared controls](17-unify-local-assets-and-shared-controls.md) — consume its completed, scoped output.
- [Deliver accessible navigation and task reflow](19-deliver-accessible-navigation-and-reflow.md) — consume its completed, scoped output.

Only the output scoped here must be complete to resolve this ticket. Later consumers requalify their changed presentation; broad finding collection is separate and cannot block this ticket on its own descendants. Follow [phase admission](../spec.md#delivery-order-and-completion) rather than treating file numbers as an execution sequence.

## Verification and acceptance

Test direct/routed/mixed/offline/unknown, partial relay failure, intentionally no relay and changing trust, with real projection consumers. Verify shape/name/contrast in every theme and compact header without requiring a permanent panel.

Run the [common candidate gates](../spec.md#verification-and-evidence) plus affected suites/builds/native checks. Record exact revision/dirty state, environment, commands and actual outcomes. Preserve regressions through the owning interface; use rendered/native evidence for the behavior that requires it, not implementation-mirroring helper tests.

## Coverage and closure

Candidate status presentation; authenticated relay lifecycle/transfer remains external, not fabricated from fixtures.

The [coverage ledger](../validation-coverage.md) specifies Candidate, External and Retained dispositions and fresh native intervals. Required missing evidence leaves the affected portion unqualified; report it explicitly. No old observation or planning approval is a pass. Primary finding collector: Supporting package or separate approved addition; see traceability. Full finding closure requires all [traceability contributions](../traceability.md), not merely this ticket's completion. Separate additions keep their own names and are not counted as new runtime findings.

## Source anchors

- [ClipboardApp.tsx](../../../packages/ui/src/ClipboardApp.tsx)
- [orchestrator.ts](../../../packages/core/runtime/orchestrator.ts)
- [main.ts](../../../apps/electron/src/main.ts)
- [background.ts](../../../apps/extension/src/background.ts)
- [client.ts](../../../apps/android/src/client.ts)

## Handoff

Implementation is integrated on `codex/ux-implementation-integration` at `ccd1f223c1791c3c0f36eddc4db311715d4ecb9b`; final `npm run verify` and combined Standards/Spec review passed for implementation quality. Keep this ticket claimed: the Android native S2 header/panel acceptance has not run. Ticket 21's compact History/details profiles do not qualify S2. No authenticated relay delivery or broader external qualification is inferred. No push, publication or deployment occurred.

## Dispatch assessment — 2026-10-24

Coordinator claims `ux-summary-22` after resolved predecessors 02/08/17/19, including completed18/19. Consume their scoped qualified outputs and the exact [Chrome Options fullscreen Search-return exclusion](../decisions/20261024-chrome-options-fullscreen-search-return-exclusion.md); this supplies no broader acceptance for changed compact consumers. Preserve one document-lived UiSession, authoritative Clip/query/action state, honest unknown status and ADR-0012; this dispatch changes no accepted invariant.

Client baseline is clean `b9afeb48485ce277a9d75dee71c6fc53c767c045` / tree `08d6f3ca6d7a3b1b67e9cf97fbe8e3ac156dc86a` before coordinator documentation. The coordinator records the resulting claim commit and inspected isolated branch/worktree before source dispatch. No branch, worktree, implementation, native interval or new test result is asserted by this claim. Root serializes broad/native/clipboard/global-setting operations; at most two source implementers across the run, with other claimed owners idle or blocked as recorded. All ticket verification, finding collection and External/Retained boundaries remain.

## Scoped Android first-use observation — 2026-10-25

On the user-connected OnePlus 7 Pro (`GM1917`, API level not re-read), the isolated `com.clipp.app.acceptance` package was updated from its 2026-10-05 install to the integrated worktree build; `com.clipp.app` was not installed, launched, or modified. Installed APK SHA-256: `353a852e69693e116dcb2d8a920c5583fe5c7050350e6f0fec6abae2b07429ce`; worktree HEAD/tree: `a8a4f390b0f202c7424fae9ed18e97fc72729343` / `5a72efe4a2d5cc609e682d050db6c270d063c4f2`.

With no trusted devices and no relay configured, the actual Android header rendered the gray three-node status control. Native touch opened the real Connections panel, which reported “No Trusted Devices yet,” “No relay configured,” Auto Sync separately, and that connection availability does not confirm Clip delivery. Android accessibility exposed `Connections: No Trusted Devices yet`. The focused status control activated with a native Enter event; native Escape dismissed the panel and accessibility focus returned to that status control. A separate native touch Close also returned to History. This qualifies only the observed first-use/no-relay presentation and these entry/dismissal/focus paths.

Direct, mixed, relay-only, offline-member, unknown/unavailable projection, configured-relay fault/retry/sign-in, live ordered updates, theme/contrast matrix, and delivery behavior were not exercised. The acceptance package retained an existing synthetic local History Clip; no history or clipboard actions were taken. The phone showed 2% battery, so the interval ended after these bounded checks. Ticket remains claimed pending its remaining candidate cases; no healthy transport or remote delivery is inferred.

## Scoped disposable Chrome no-trust observation — 2026-10-26

On the same integrated build in the disposable Chrome profile recorded in ticket21's 2026-10-26 receipt, the actual Options header exposed `Connections: No Trusted Devices yet`. Activating it opened the real Connections panel. Its accessible content and rendered screenshot stated “No Trusted Devices yet,” “No relay configured,” “Auto Sync: On,” and “Connection availability does not confirm Clip delivery”; it offered Open Devices and Open Connections settings. Native Escape dismissed the panel and focus returned to the header status control. This qualifies only Chrome's no-trust/no-relay presentation and keyboard dismissal in the observed default theme; it does not extend Android native acceptance or qualify any transport. Direct/routed/mixed/offline/unknown/fault/retry/sign-in/live-update and theme/contrast cases remain untested. Ticket22 remains claimed.

## Candidate check run — 2026-10-26

At candidate HEAD `a8a4f390b0f202c7424fae9ed18e97fc72729343`, tracked dirty diff SHA-256 `257b0d24d1e02bcc7572a1517ff64f60bb1755dfefff69ec396115126f95f280`: `npm run verify` passed lint (warnings only) but stopped in typechecks before Jest/builds. TypeScript reported incompatible duplicate `@libp2p/interface` types (`Uint8ArrayList` generic mismatch) in relay/pairing harness consumers including `tests/harness/managedRelayFallbackInterop.ts` and `tests/harness/pairing-harness.ts`. Running Jest separately outside the sandbox passed all 178 suites / 1,363 tests; running the two directly affected suites first passed 2 suites / 16 tests. Electron, Android web, and Chrome extension production builds each passed. The real disposable Chrome S2 no-trust/no-relay panel and Escape/focus-return check passed as previously recorded. Android direct/routed/mixed/offline/unknown/fault/retry/sign-in/live-update/theme cases remain untested; no phone package or user data was changed. Ticket22 remains claimed.

### Direct/offline and rendered consumer continuation — 2026-10-26

Live desktop acceptance used the trusted disposable Chrome extension and running Electron, with no relay configured. Disabling only that extension made Electron's actual Connections panel report “No device connection available”; re-enabling it restored “Direct connection available” and “1 Trusted Device connected directly.” Both live panels separately stated that availability does not confirm Clip delivery and showed Auto Sync apart from transport. Actual Electron and Chrome panels were also inspected in Dark appearance for readable contrast; both settings were restored to System afterward. A real disable/enable transition and restored state were observed; this does not qualify relay or mixed transport.

`npm test -- --runInBand tests/core/runtime/connectionSummary.test.ts` passed 1 suite / 13 tests. The shared `ClipboardApp` consumer harness was run for `--host=electron`, `--host=chrome`, and `--host=android`, each with `--connection-summary`, covering System/Light/Dark presentation and direct, mixed, relay-only, no-relay, relay-ready-no-devices, offline, first-use, unknown/unavailable and relay warning/recovery projections. Each run reported 52 assertions passed, browser closed, and no errors. These are rendered host-style/projection fixtures, not live relay or Android native transport evidence. Android direct/mixed/offline/fault/live-update/theme acceptance and authenticated relay behavior remain open; ticket22 stays claimed.

### Android configured-relay attention and theme check — 2026-10-26

On the user-connected OnePlus 7 Pro (`GM1917`, Android API 31, build `GM1917_11_H.41`), the already-installed isolated `com.clipp.app.acceptance` app displayed the actual native S2 Connections panel with “Connections need attention,” “0 of 1 configured relays ready,” a Connections settings recovery direction, Auto Sync separately, and the no-delivery-guarantee statement. The existing isolated `Test Relay` setting was marked “Login needed”; no authentication or transfer was performed, so this is UI presentation evidence only. The panel had readable contrast in the device's original System/dark appearance and in app Light appearance. Light was restored to System in the acceptance app; the normal `com.clipp.app` package was untouched and restored to the foreground. Screenshot and environment receipt: [ticket22-s2-native-20261026](../../.local/ux-implementation/run-20261010/ticket22-s2-native-20261026/acceptance.md). Android direct/routed/mixed/offline/unknown/live-update states and authenticated relay behavior remain open; ticket22 remains claimed.

## Live Android–Electron pairing retry — 2026-10-26

The fresh Electron pairing text was placed in the isolated Android acceptance app and submitted. The signed peer record verified, and the Android pairing diagnostic recorded `inputLength: 830`, `error: dial_failed`, and `durationMs: 48139`; this was a real dial attempt, not payload validation failure. The peer record advertised 6 addresses: 2 WebRTC Direct UDP, 2 raw TCP, and 2 plain WS; it advertised no WSS. Android's browser runtime has no TCP transport and intentionally denies `/ws` dials for its secure Capacitor origin, leaving WebRTC Direct as the only eligible direct route. The attempt emitted WebRTC ICE `disconnected` and SCTP `socket is not connected` diagnostics. Electron listens on local `/tcp/0/ws` and has no TLS/WSS listener; this profile had no configured WSS relay. Trust was not established. This narrows the live failure to WebRTC Direct reachability/ICE or providing an allowed secure route; it does not qualify successful connection, delivery, or the remaining S2 states. Acceptance-app log level was restored to `info`, normal package returned to foreground, temporary debug forwarding removed, and the Mac clipboard restored to the synthetic fixture. Keep ticket claimed.

### Android → Electron direct pairing and delivery — 2026-10-26

The first trace isolated the actual selection bug: Android's browser transport was given the peer-record loopback address first (`/ip4/127.0.0.1/udp/.../webrtc-direct`). The connection gater rejected loopback, but peer-ID dialing still selected it from the stored signed-record address list, causing a full dial timeout before a reachable candidate was used. `Libp2pMessagingTransport.eligibleDialAddresses` now removes loopback candidates whenever `allowInsecureBrowserDials` is enabled; the shared loopback classifier is used by both address eligibility and the node connection gater. A focused engine regression test verifies that the secure browser peer-ID dial skips a leading loopback address and dials the same-LAN WebRTC candidate.

On the user-connected OnePlus 7 Pro (`GM1917`, Android API 31, `GM1917_11_H.41`), updated only the isolated `com.clipp.app.acceptance` package with the acceptance APK built from the candidate; `com.clipp.app` remained untouched. Pasting the fresh Electron record into the actual Android pairing form selected `192.168.2.138` rather than loopback, opened the WebRTC handshake channel, and submitted the request. Accepting that actual request in the isolated Electron app established trust. Android's Devices screen showed Electron `Connected · direct`; the actual Android S2 panel showed `1 Trusted Device connected directly`, `0 of 1 configured relays ready`, a relay recovery direction, Auto Sync separately, and the no-delivery-guarantee statement. Screenshot: [actual Android direct + relay attention panel](../../../.local/ux-implementation/run-20261010/ticket22-s2-native-20261026/android-direct-relay-attention.png).

Using the actual Android `Share current clipboard now` control with synthetic marker `CLIPP_ANDROID_DIRECT_TEST_20261026` produced remote History entries in the actual Electron app from device `Mobile`. Two entries were observed after the system clipboard watcher and explicit Share-now action; no private content was used. This qualifies direct pairing and live synthetic delivery for this one LAN profile.

For a bounded offline/recovery check, stopped only the isolated debug Electron process. Android's actual Connections panel lost its direct-device line while retaining the independent configured-relay attention state and Auto Sync separation. The saved trust survived Electron restart. The old signed address then timed out because the listener had restarted on a new UDP port; Android's reconnect loop kept trying the stale endpoint. Pasting Electron's refreshed signed record reconnected the already-trusted device and Electron showed `Mobile · Connected · direct`; no new trust approval was needed. This is a manual signed-record refresh, not automatic post-restart discovery qualification.

Implementation verification: `npm test -- --runInBand tests/core/network/engine.test.ts` passed 1 suite / 56 tests; `npm --workspace apps/android run build`, `npm --workspace apps/android run cap:sync`, and isolated `:app:assembleAcceptance` passed. The installed acceptance APK package was `com.clipp.app.acceptance`, versionCode 3, SHA-256 `9a77784d3f94ec65e0709730da0d0652b74062f8d73a18c915d458abb2fdbd8b`. Focused ESLint passed with existing warnings; `git diff --check` passed. Shared and Android TypeScript checks remain blocked by the pre-existing duplicate `@libp2p/interface`/`Uint8ArrayList` generic mismatch in `packages/core/network/peerId.ts` (also seen in the prior harness failures); no new diagnostic pointed to the loopback filter or its test.

Still unqualified: mixed direct+relayed transport, relay-only/live authenticated relay, direct with no configured relay on Android, unknown/unavailable Android native projection, relay sign-in/retry and live ordered relay updates. The restart probe also showed that a stale signed address needs an explicit fresh record after the WebRTC listener changes port. Ticket22 remains claimed.

## Android large-text landscape continuation — 2026-10-26

On the isolated OnePlus 7 Pro acceptance app (`GM1917`, API 31), the actual S2 panel was inspected at Android Font size “Large” (`font_scale=1.35`) in portrait and landscape. The portrait panel displayed its information and controls; in landscape its scrollable content exposed Open Devices, Open Connections settings, and Close connections after a swipe. The direct device plus configured-relay attention state remained visible, with Auto Sync separately described and no delivery guarantee. Screenshot evidence is in `.local/ux-implementation/run-20261010/ticket21-android-followup-20261026/` (`s2-portrait-large.png`, `s2-landscape-large.png`, `s2-landscape-large-after-swipe.png`). The font scale and rotation mode were restored to their initial defaults. This adds a live native text-scale/orientation presentation pass only; no authenticated relay, mixed/relay-only state, unknown/unavailable projection, sign-in/retry, or ordered relay-update behavior is inferred. Ticket22 remains claimed.

### Actual Chrome toolbar-popup offline/no-relay snapshot — 2026-10-26

The actual pinned toolbar popup Connections panel was opened in the `Clipp QA disposable` profile. Its accessibility tree and rendered panel reported “No device connection available,” “No relay configured,” Auto Sync On, and “Connection availability does not confirm Clip delivery”; Open Devices, Open Connections settings, and Close connections were available. This is a live popup snapshot with no deliberate network/disconnect mutation during this check; it qualifies only the Chrome popup's offline/no-relay projection and action visibility, not an offline transition, Android projection, or relay behavior. Ticket22 remains claimed for the remaining live transport/projection cases.

### Live Electron direct/no-relay S2 panel — 2026-10-26

On the integrated Electron candidate, the actual Connections panel was opened from the live header status control. It reported “Direct connection available,” “2 Trusted Devices connected directly,” “No relay configured,” Auto Sync separately, and “Connection availability does not confirm Clip delivery.” The live Devices screen showed Mobile and Extension as Connected · direct. This qualifies the current Electron direct/no-relay projection and truthful delivery wording only. It does not cover relay routing, mixed direct/relayed, configured-relay fault, unknown/unavailable, live trust changes, or authenticated relay lifecycle. Ticket22 remains claimed.

### Electron direct/no-relay and Android direct-plus-relay attention reconciliation — 2026-10-26

Live Android acceptance evidence already records the trusted direct Mobile connection alongside `0 of 1 configured relays ready` / `Login needed`, Auto Sync separately, and the no-delivery-guarantee text. This is the direct-plus-configured-relay-attention projection; it does not prove relay routing. The live Electron panel independently reported direct connection available, two trusted direct devices, and no relay configured. Today’s popup Share retry delivered only the synthetic marker through the direct trusted connection; this verifies delivery on that direct route, not S2 routed/mixed status. The matching Electron History item was visible and no private clipboard contents were inspected.

Still required for #22: live mixed and relay-only/routed transport projections and delivery, unknown/unavailable native projection, changing-trust/live ordered relay-state behavior, and the authenticated relay lifecycle. The isolated Android test relay remains `Login needed`; relay authentication was previously deferred and no credentials/session have been supplied for this acceptance interval. Keep the ticket claimed; fixtures and direct delivery cannot stand in for these live route cases.

### Existing-session relay login handoff — 2026-10-27

The user authorized opening the isolated acceptance app's Test Relay login and continuing only if an existing session was available. The app's `Test Relay` card showed `Login needed`; its login opened a Chrome Custom Tab to Google sign-in for `everk8s.duckdns.org`. Google presented two stored accounts. Selecting either would transmit its account email to that relay portal, so no account was selected while awaiting the user's choice. No credential, one-time code, auth grant, relay session, or relay transfer was entered or established. Android remains on the account chooser; mixed/relay-only live acceptance and ticket resolution remain open.

### Relay login callback mismatch — 2026-10-27

After the user authorized the selected existing Google account and explicitly approved the relay portal's “Authorize Clipp” consent for the isolated Android acceptance app, the portal returned using `clipp-relay://oauth/callback`. Android resolved that production scheme to the normal `com.clipp.app` package, which became foreground; the isolated `com.clipp.app.acceptance` package did not receive the callback. No further UI action or inspection of the normal app was performed. Whether the normal app persisted or exchanged the callback is unverified. No token/code was copied into the receipt.

This is consistent with `apps/android/src/managedRelayAuth.ts` and the native plugin declaring the production callback while the acceptance manifest deliberately resolves only `clipp-relay-acceptance://oauth/callback`. `docs/android-managed-relay-native-acceptance.md` explicitly states the production OAuth client still uses the production callback and the acceptance build is not for browser login acceptance. Therefore this live relay-auth path cannot safely continue on the isolated build without a dedicated registered acceptance OAuth client/redirect. No live authenticated relay route was qualified; ticket22 remains claimed. Do not interact with `com.clipp.app` as part of this acceptance run.

### Isolated Android callback implementation and verification — 2026-10-27

At integration HEAD `a8a4f390b0f202c7424fae9ed18e97fc72729343` (tracked diff SHA-256 `96867aad33512cce74528d4796645c6c445ded869e3eb5aa43c88f640c78bf1c`), Android now reads OAuth configuration from the native build variant. The acceptance variant uses `clipp-relay-acceptance://oauth/callback` for authorization, raw callback validation, and code redemption; debug/release keep `clipp-relay://oauth/callback`. Its package remains `com.clipp.app.acceptance`. The relay server accepts only `client_id=android` and one exact Android redirect per deployment, so the acceptance callback requires a dedicated isolated Test Relay deployment; the pinned live Test Relay remains on the production callback and was not changed. No second login or interaction with `com.clipp.app` occurred.

Passed: `npm test -- --runInBand tests/android/managedRelayAuth.test.ts` (14/14), `npm run typecheck:android`, Android debug and acceptance APK/instrumentation APK compilation, and the connected OnePlus 7 Pro method `ManagedRelayCredentialStoreTest#onlyExactPrivateCallbackResolvesToClipp` (1/1). APK manifest inspection confirmed the debug package registers only the production scheme and the acceptance package registers only the acceptance scheme. APK SHA-256: debug `9ebaf0dd72bd2d4d128d519971e12ffc146d52d218509ccd6367b46f0dabe0a9`; acceptance `ff28b277b2fa0b0036e29555dbb7500d016a95ff974fba60706e4cdf0f1be3cd`.

The unrestricted `npm test -- --runInBand` rerun passed 178/178 suites and 1,365/1,365 tests. `npm run verify` passed lint (935 existing warnings, 0 errors), then stopped at shared typecheck with 12 duplicate `@libp2p/interface` major/type incompatibilities in `packages/core/network/relay/server.ts`, `scripts/web-rtc.ts`, `tests/harness/managedRelayFallbackInterop.ts`, and `tests/harness/pairing-harness.ts`; Jest therefore ran separately. `git diff --check` passed. Ticket22 remains claimed: mixed and relay-only delivery, unknown/unavailable native projection, changing-trust/live ordered updates, and authenticated relay lifecycle still require live acceptance against an isolated Test Relay.

### Normal Android Test Relay callback — 2026-10-27

At the user's direction, rebuilt and installed the normal `com.clipp.app` debug APK over the existing installation (install with replace, preserving app data) so it registered Test Relay's production callback `clipp-relay://oauth/callback`. The callback returned to this app. Using the already-authorized Google account and relay consent, the actual Relay settings card changed from Login needed to Ready and reported “Relay authentication completed.” The actual Android Connections panel showed one trusted direct device and one configured relay ready, with Auto Sync separate and the no-delivery-guarantee wording. This proves authenticated relay readiness and a live mixed _availability projection_ only; no relay-routed Clip delivery is inferred.

Electron was then configured locally with `Test Relay` at `https://relay-portal-test.everk8s.duckdns.org/v1/relay`; it currently reports Login needed. The user authorized the Android app's relay consent, not an Electron OAuth grant, so Electron sign-in is awaiting separate approval. Android's normal app is installed and currently foregrounded. Ticket22 remains claimed pending mixed and relay-only transfer, unknown/unavailable native projection, live trust/relay state updates, and Electron relay authentication/lifecycle.

The user subsequently approved Electron's Test Relay authorization. Chrome showed the same selected Google account (`artyhere@gmail.com`) and Test Relay's consent for “Clipp desktop”; after approval, the browser displayed “Clipp authorization received. You may close this tab.” The visible Electron Settings card still showed `Login needed` / `Relay action pending…`. Accessibility snapshots separately reported `Ready`, but were inconsistent with the screenshot and the page shown. Treat Electron relay readiness as unconfirmed and do not count a mixed or relay-only pass. No transfer or clipboard operation followed. The Mac locked before route checks could continue, and permission to disable Android Wi-Fi temporarily for one synthetic relay-only transfer is pending. Ticket22 stays claimed.

### Mixed-route attempt and relay-only constraint — 2026-10-27

After the user reported the Mac unlocked and clarified that the phone has no mobile data, the Electron Settings view and rendered Connections panel coherently showed Test Relay Ready / authenticated, direct availability with three directly connected trusted devices, one configured relay ready, and the no-delivery-guarantee wording. Android remained on Wi-Fi; its native Connections panel showed two directly connected trusted devices and one configured relay ready. This qualifies authenticated relay readiness and mixed availability presentation only.

For a bounded synthetic transfer attempt, wrote the approved marker `CLIPP_MIXED_RELAY_READY_20261027` to the Mac system clipboard (exact value verified), invoked Electron's “Share current clipboard now”, and searched Android History for the marker. Electron stored it locally; Android History had no matching Clip after the send. Mixed delivery therefore remains failed/unverified and no route is inferred. The temporary Android History search was cleared. Relay-only cannot be attempted on the phone because it has no mobile data; Wi-Fi remained on. Ticket22 remains claimed. Remaining acceptance includes successful mixed and relay-only transfers, unknown/unavailable native projection, live trust/ordered updates, partial relay fault/retry/sign-in, and appearance/theme coverage.

### Forced-WSS relay-only Android-to-Electron transfer — 2026-10-27

The isolated live Electron acceptance runner enforced `wss` and disabled direct peer paths while using the authenticated Test Relay session. From the OnePlus Android app, synthetic marker `CLIPP_T22_RELAY_ONLY_WSS_20261027_02` entered Clipp through the explicit `ACTION_SEND` text ingress. The runner's sanitized receipt reports pass: relay ready, a new Remote Clip received, isolated memory clipboard boundary applied, circuit and selected relay server transport observed, authenticated reservation/rendezvous ready, zero direct peer connections, graceful shutdown. Full receipt: [forced-WSS receipt](../../.local/ux-implementation/run-20261027/ticket22-live-wss-02/receipt.json) (local ignored run artifact). No system clipboard was read or written for this marker. This qualifies a forced relay-only transfer, not ordinary mixed-path route selection.

The previous mixed-availability transfer attempt remains failed/unverified: the synthetic marker was not found in Android History, so neither delivery nor selected route is claimed. Remaining #22 gates include successful mixed delivery with route evidence, unknown/unavailable Android projection, live trust and ordered updates, partial relay faults/retry/lifecycle, and remaining appearance/theme cases. Android has no mobile data; Wi-Fi stayed on. Keep the ticket claimed.

### Android mixed-availability projection after relay-only pass — 2026-10-27

Immediately after the forced-WSS receipt, the connected OnePlus S2 panel rendered “Direct connection available,” one trusted device connected directly, and `1 of 1 configured relays ready`; Auto Sync remained separately stated and the panel warned that connection availability does not confirm Clip delivery. This is a live mixed-availability projection on the normal installed app. It does not show which route an ordinary transfer selects. The forced-WSS transfer is separately qualified; the earlier ordinary mixed transfer remains failed/unverified. No network settings were changed.

### Mixed-availability delivery on the direct route — 2026-10-27

The isolated Electron profile initially had one saved Test Relay configuration but reported `login_needed`. Repeating the already-approved “Clipp desktop” Test Relay authorization returned the Electron runtime to `ready`. With one managed relay ready and one trusted direct device connected simultaneously, a new synthetic Android `ACTION_SEND` text Clip arrived in Electron History as a new Remote Clip. The public peer summary for its source showed `hasDirect: true`, `hasRelay: false`, while the relay remained ready. This passes delivery under mixed availability and identifies this transfer's selected direct route; it does not show a relayed Clip selected while direct was available. The exact marker, peer IDs, authorization URL/code and Clip content are omitted. Electron clipboard was isolated in memory; no OS clipboard was read or written. Sanitized receipt: [ticket22 mixed-route receipt](/Users/invine/src/js/clipp/.local/ux-implementation/run-20261027/ticket22-mixed-route-04/receipt.json). The test-owned Electron process was terminated after receipt; graceful close was not observed.

This Android-to-Electron result supersedes the earlier failed mixed-direction attempt only for this bounded transfer. Still open for #22: Android native unknown/unavailable projection, live trust and ordered state updates, partial relay fault/retry/lifecycle, and remaining theme/contrast cases. Forced-WSS relay-only transfer and current Android mixed-availability projection are separately qualified. Keep ticket22 claimed until remaining required gates are covered.

### Android startup and disposable-extension state probe — 2026-10-27

Temporarily disabled Clipboard Share in disposable Chrome for Testing, then restored its extension toggle to On and confirmed its service worker returned. While disabled, Android's actual S2 panel continued to show one direct trusted device and one configured relay ready; the peer was not isolated, so this produces no trust-change or disconnect-transition pass. No Wi-Fi, trust records, system clipboard or relay settings were changed.

A no-data-clear force-stop/relaunch of normal `com.clipp.app` returned the actual Android app to History. The first post-restart S2 panel showed direct connection available, one trusted device connected directly, `1 of 1 configured relays ready`, Auto Sync separately and no delivery guarantee. A subsequent immediate-start capture showed only a blank startup frame at 200 ms; around one second later the Clipp header was rendered with its green connection control, not an unknown label. One later native capture went black while the Android WebView DevTools snapshot still showed a rendered DOM; returning Home and reopening `MainActivity` restored the visible History screen. No AndroidRuntime fatal exception was recorded. This does not qualify native unknown/unavailable projection; treat the black capture as an unresolved screen-capture/rendering anomaly, not an S2 pass.

The phone is left with Clipp visible on History, the synthetic search cleared, and the Chrome test extension enabled. Unknown/unavailable native state and a verified live trust/path transition remain open for #22.

### Android S2 Wi-Fi-loss and relay-recovery transition — 2026-10-27

On OnePlus 7 Pro / Android API 31 / normal `com.clipp.app` 1.0.2, with S2 open, the baseline showed direct available, one directly connected trusted device, and 1/1 relays ready. The Devices screen taken immediately afterward showed the visible trusted peers Offline; reopening S2 still showed one direct peer. This possible stale/inconsistent projection is not resolved.

Wi-Fi was disabled for about 12 seconds and restored. The off-network screenshot showed “Connections starting” and 0/1 relays ready (“Relay setup is in progress”). About 12 seconds after restoration, Android confirmed Wi-Fi enabled and S2 showed “Waiting for Trusted Devices” with 1/1 relays ready. Auto Sync and the delivery disclaimer remained present. No trust records, app data, History, or clipboard were changed. Sanitized receipt and screenshots: [Android Wi-Fi transition evidence](../../.local/ux-implementation/run-20261027/ticket22-android-wifi-transition-01/receipt.json).

This qualifies a live transient network-loss/recovery summary update, but not stable unknown projection or changing trust. Preserve the observed direct-count/Devices-list mismatch as unresolved.

A second Wi-Fi outage held for 35 seconds. S2 then showed “Connections need attention,” 0/1 relays ready, and the recovery direction “Open Connections settings for recovery.” Fifteen seconds after restoring Wi-Fi, the fault state remained. By about 17 seconds after restoration, the panel returned to “Waiting for Trusted Devices” and 1/1 relays ready; Wi-Fi was confirmed enabled. This qualifies a live single-relay fault and automatic recovery state sequence. No manual retry was used; a multi-relay partial-failure case remains open. The same sanitized receipt and screenshots above include this continuation.

### Live partial-relay fault with direct path retained — 2026-10-27

In actual Android Settings, temporarily added a second relay using the reserved unreachable discovery URL `https://clipp-qa-fault-probe.invalid/v1/relay`, leaving the existing Test Relay unchanged. Android S2 showed “Connections need attention,” one trusted device connected directly, 1 of 2 configured relays ready, a configured-relay recovery direction, and “Available device connections remain usable.” Auto Sync and the delivery disclaimer remained separate. The actual Open Connections settings action navigated to Settings. Removed only the temporary QA config; Test Relay remained Ready, and S2 returned to direct available and 1/1 relays ready. Wi-Fi remained enabled; no trust record, History, credential, or clipboard was changed. This passes the live partial configured-relay projection and cleanup/recovery gate. [Sanitized receipt and screenshots](../../.local/ux-implementation/run-20261027/ticket22-android-wifi-transition-01/receipt.json).

Before the Wi-Fi interruption, S2 counted one direct trusted device while a fresh Devices view showed the visible trusted peers Offline. A later refresh returned to direct available. This transient inconsistency remains unexplained. Ticket22 remains claimed for stable unknown projection and changing-trust/live ordered updates.

Ticket22 remains claimed for the unresolved Devices/S2 direct-count inconsistency, stable unknown projection, changing trust/live ordering, and multi-relay partial-failure/manual-retry coverage.

### Current candidate verification and live-gate checkpoint — 2026-10-27

At integration HEAD `8497ff8d021bd4d5c64f0a98973215263e0ef499` (dependency code is integrated at `e573922`; the tested ticket22/native source diff SHA-256 was `4d727838e57960e2267e41e70c2a4298a4509034a405a3edfe5afe238cac6fe7`), `npm run verify` passed lint (935 warnings, no errors), all TypeScript checks, 178 Jest suites / 1,365 tests, and Electron/Android web/Chrome production builds. Focused `tests/core/runtime/connectionSummary.test.ts` passed 13/13. The rendered connection-summary consumer passed 52/52 independently for Electron, Chrome and Android, with all three harnesses closed and no errors.

Using JDK 21 and the installed Android SDK, `./gradlew --no-daemon -PclippAcceptance :app:assembleDebug :app:assembleAcceptance :app:assembleAcceptanceAndroidTest` passed. This compiles the current normal debug package and isolated acceptance/instrumentation APKs; no package was installed in this checkpoint. The handset is connected by ADB but currently Dozing at its keyguard (`mWakefulness=Dozing`, NotificationShade focused); CUA also reports the Mac locked. I did not try to bypass either lock or mutate the normal app.

Prior live evidence still covers direct/no-relay, direct with relay attention, forced WSS relay-only delivery, mixed availability with a successful direct-routed transfer, network loss/recovery, configured relay attention, and 1-of-2 partial-relay failure with cleanup. Remaining required live gates are Android native unknown/unavailable projection, a demonstrated trust/path transition with ordered S2 updates, multi-relay failure with an actual manual Retry outcome, and investigation of the earlier transient direct-count-versus-Devices-list inconsistency. Ticket22 remains claimed; no current locked-screen capture or rendered fixture substitutes for these gates.

### Acceptance callback build check — 2026-10-27

The current `-PclippAcceptance` APK (`com.clipp.app.acceptance`, versionCode 3) and its instrumentation APK were built from the recorded candidate diff. APK inspection confirmed the acceptance callback scheme `clipp-relay-acceptance` in the manifest. On the connected OnePlus, installed only these isolated acceptance packages (the normal `com.clipp.app` was not replaced) and ran `ManagedRelayCredentialStoreTest#onlyExactPrivateCallbackResolvesToClipp`; Android instrumentation returned `OK (1 test)`. This verifies exact manifest routing/build configuration only. It does not authenticate to the Test Relay or pass S2 unknown/trust/retry states. The device remained at its locked/Dozing keyguard; those remaining live gates are still pending unlock.

## Answer — 2026-10-27

Resolved by the user's explicit scoped acceptance in [the ticket 22 decision](../decisions/20261027-ticket22-user-acceptance.md). The user instructed: “Skip these checks. Mark ticket as complete,” referring to the remaining Android native unknown/unavailable projection, live trust/path transition with ordered S2 updates, multi-relay failure with an actual manual Retry outcome, and the transient direct-count-versus-Devices-list inconsistency. These checks remain **unqualified/not run**; this decision does not turn them into passes or qualify another ticket, external relay lifecycle, or broader finding. All previously recorded actual outcomes, failures, and limitations remain unchanged. Routine verification, current S2 consumer checks, Android builds, and the isolated callback manifest test have their recorded results above. This is scoped administrative acceptance, not release qualification or broad finding closure.
