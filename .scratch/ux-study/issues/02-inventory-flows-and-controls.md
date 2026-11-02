# Inventory user flows and control coverage

Type: task
Labels: wayfinder:task
Mode: AFK
Status: resolved
Assignee: Codex UX study coordinator
Parent: [Clipp cross-runtime UX study](../map.md)
Blocked by: none

## Question

What user goals, states and control entry points actually exist in each runtime, and which source-supported gaps or duplicate paths must the visual study exercise before making product decisions?

Produce a scenario/control matrix grounded in shared UI, each runtime bridge, the separate extension options page, native entry points and accepted requirements. This inventory is prerequisite evidence for the study; do not implement controls or approve redesigns.

Cover these journeys and their failure/return paths:

- First launch, identity initialization failure/retry, local capture without relays, discovering how to connect another device.
- Device Name and Local Device Alias; displaying/copying Peer ID; automatic Identity Rotation, its notice/recovery/re-pairing, and whether any deliberate generate-new-identity action exists. Separate missing exposure of existing capability from a new domain operation.
- Generate/copy/scan/import Pairing Target; denied/unavailable camera, malformed target, waiting/expired/rejected requests, multiple approvals, notification deep link and return to previous view.
- Connected/offline Trusted Devices, revocation, confirmation, persistence failure and recovery; distinctions among member connectivity, relay health and Auto Sync.
- Capture, receive, search/filter, inspect/reuse/copy, Share Now, pin/unpin and delete Clips; Auto Sync off; empty and dense history; long text/URLs, multiline text and unsupported input.
- Sharing lifetime and history retention/capacity settings, validation, save/cancel/feedback, and theme selection if present.
- Empty relay setup, add/edit/remove, sign-in/cancel/failure, portal link, expired/refused/degraded status, retry and multiple configurations; compare tray entry points with in-app controls.
- Chrome popup close/reopen, options navigation and manual clipboard capture; Android Sharesheet/selected text, background continuity opt-in, notification permission/channel states, stop/reopen and diagnostics; Electron open/close/tray/quit.

For every action record where it is reachable, its handler/bridge, enabled/disabled/hidden conditions, completion/error feedback, persistence implications and intentional platform exception. Use names and terms from the glossary; treat outdated spec prose as a conflict needing evidence.

Also define reusable synthetic fixtures: zero/one/many Clips, devices and relays; longest accepted names and identifiers; long unbroken URLs; concurrent status/error notices; loading and recovery. Record source revision/diffs and an evidence ledger format that the runtime studies can share. Source risks are not rendered defects until observed.

## Comments

2026-10-07: Claimed by the coordinator for the user-requested continuation. Current HEAD remains `a2e1a64cad05eadb7c567b48e3ec45ce7cd51e33`. The dirty set now contains only `apps/electron/src/managedRelayAuth.ts` and `tests/electron/managedRelayAuth.test.ts` plus this study directory; earlier tray/main working-copy changes are no longer present. Re-read current sources rather than treating charting pointers as current truth.

2026-10-07 charting reconnaissance (not a completed control audit or rendered evidence):

- Electron `apps/electron/src/renderer.tsx:119`, Chrome popup `apps/extension/src/popup.tsx:302` and Android `apps/android/src/main.tsx:133` render the shared app. `apps/extension/src/options.tsx:133` is separate and must be compared explicitly.
- The current dirty Electron `apps/electron/src/main.ts:882–883` maps both **Open Clipp** and **Configure Relays** to `showWindow()`. Trace the resulting destination and the apparently uncalled legacy relay dialog before recommending retirement.
- Shared `packages/ui/src/ClipboardApp.tsx:275–334` exposes rename, initialization retry and rotation notices, but no voluntary Identity Rotation callback. Inventory runtime bridges before concluding capability is absent.
- Chrome options exposes Images/Files settings despite their deferral in `.scratch/runtime-capabilities/spec.md:21–22`; check current handlers and runtime support. Its history/device controls also differ from the shared app.
- Inspect the shared theme icon with no apparent click handler at `ClipboardApp.tsx:1622`, narrow-width hidden search, logo-driven drawer access and the exact 1100px CSS/JavaScript boundary. These are candidates requiring verification.
- Android adds a diagnostics panel outside the shared shell; examine its space cost with banners and an open keyboard.
- No maintained screenshot/viewport baseline was found in the bounded tracked `.scratch`, `docs`, `packages/ui` and `tests` inventories. This does not establish absence of untracked or external evidence.

## Answer

Resolved on 2026-10-07 by the Codex UX study coordinator. [Clipp user flows and control coverage](../flow-control-inventory.md) inventories the four active UI surfaces, runtime bridge actions, state/availability rules, success/failure/return paths, persistence implications and intentional runtime differences. It defines 23 scenario families for the visual studies. [Fixtures and evidence format](../inventory-fixtures.md) supplies 14 reusable synthetic fixture recipes, breakpoint/interaction sampling and a JSONL receipt format that separates source, rendered, native and live evidence.

The source investigation confirms missing or ineffective controls: search hidden at compact widths; inaccessible sidebar actions at exactly 1100px; non-keyboard drawer trigger; alias clearing blocked by the UI despite core support; sharing lifetime without runtime/UI exposure; duplicate tray routing; theme controls without an effective implementation; unused extension expiry/type settings; and several missing feedback/approval-navigation paths. Voluntary identity replacement is a new user-initiated lifecycle decision, distinct from exposing an existing rename or recovery callback. The report also identifies stale Chrome state projections, long-content inspection limits and layout/density inputs requiring rendered evidence. These findings are not user approval of a redesign.

The production/specification source baseline is recorded in [inventory-source-baseline.json](../inventory-source-baseline.json): HEAD `a2e1a64cad05eadb7c567b48e3ec45ce7cd51e33`, branch `codex/agent-workflow-integration`, source diff SHA-256 `00feb38ed3957a083c49dd5d6f01487590708c397982d305c763dce800715f27`. All 145 recorded source hashes and the diff/HEAD remained unchanged at verification. Local links/heading anchors and the example receipt JSON were checked; Markdown/JSON formatting passed. Existing Electron auth/test changes were preserved. No app code changed, no runtime was launched and no native visual result is claimed; implementation tests were not run for this source/documentation task.

Newly precise findings were attached to the existing Electron, Chrome, Android, missing-control and visual-layout investigations. Content-script capture/restart-recapture questions retain their existing external ticket ownership. No duplicate child ticket or domain-contract change was needed. The three runtime investigations are now unblocked; comparative prototype needs and native access gaps remain to be established there.
