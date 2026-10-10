# Observe Android layouts and native interactions

Type: task
Labels: wayfinder:task
Mode: AFK
Status: resolved
Assignee: Codex (current session, 2026-10-08)
Parent: [Clipp cross-runtime UX study](../map.md)
Blocked by: 01, 02

## Question

Where does Clipp's Android UI become difficult or impossible to use across compact/expanded layouts, orientation, text scaling, keyboard and native lifecycle states?

Use an isolated native app/emulator installation and synthetic data under the documented Android acceptance boundary. Record model/emulator, Android/WebView versions, physical resolution, dp/logical viewport, density, font/display scaling, navigation mode and actual safe insets. Browser rendering is supplementary, with its limitations explicit.

Cover representative compact widths of 320, 360, 393 and 412 logical pixels/dp as appropriate to the measured WebView mapping; compact heights, landscape, split screen/resizable windows where supported and an expanded tablet-sized surface. Use default, intermediate and maximum supported font scaling, including a 200% case where supported; repeat name/relay/Pairing entry with the keyboard visible. Test gesture and system navigation insets, cutouts and edge-to-edge behavior on available supported API levels.

Walk the common scenario matrix plus Android Back, Sharesheet and selected-text ingress, notification entry/permission denial, background continuity states, stop/reopen, camera scanning and resume after external sign-in. Check reachability of save/cancel/close actions under the keyboard and whether rotation/Back/foreground transitions retain or deliberately discard user input.

Capture clipped/stretched controls, overflow, unreadable fields, touch-target/focus problems, wasted vertical space, redundant panels and status text that obscures the main task. Separate an intentional Android capability limit from a missing recovery control. Native coverage gaps stay explicit and unresolved until addressed or bounded by a user decision.

## Comments

2026-10-07 inventory handoff: use [user flows and control coverage](../flow-control-inventory.md) and [fixtures/evidence format](../inventory-fixtures.md). Prioritize compact search/navigation, keyboard-covered relay/name actions, notification-to-approval navigation, camera Back/background cleanup, stacked notices plus Pairing diagnostics, long continuity guidance and notification Pause/Resume/Stop. Distinguish queued/accepted Sharesheet feedback from actual delivery and Auto Sync from continuity opt-in.

2026-10-08 observation checkpoint: [Android observations](../android-observations.md) now contain 18 findings with proposed acceptance criteria and native/fixture evidence. The [gallery](../android-evidence/index.html), [ledger](../android-evidence/evidence.jsonl), [reproduction notes](../android-evidence/README.md) and [source/build receipt](../android-evidence/source-build-receipt.json) retain the tested dimensions, actual Android font scaling, keyboard, Back, notifications, intent ingress, camera provider failure/fallback, gesture navigation and native freeform windows. The acceptance build passed; all 145 inventory source hashes still match. No production fixes or commits were made.

The findings establish native inset overlap, keyboard-covered relay actions, drawer Back leaving the app, text labels in 32px icon buttons, verbose continuity controls, redundant notification actions, missing permission recovery, an environment-specific native barcode-provider crash, hidden search/small touch targets, mixed styles, short-window space costs, Pairing diagnostics displacing the app, 200% card overflow, narrow history overflow, dense navigation/identifiers, overlapping notices and initially cropped landscape QR. Native and fixture observations are distinguished; stale/ANR frames and invalid editor attempts are excluded.

**Closure pending a coverage decision.** The async question in this chat asks whether remaining native gaps may be carried as explicit handoff follow-ups. No answer has been recorded. The report lists the full boundary: physical-camera QR decoding and lifecycle, external sign-in return, two-device approval routing, OEM background behavior, stable Android 16 (both attempts hit System UI ANR), the incomplete 200% relay/Pairing keyboard matrix, physical cutout/foldable and split-screen checks, assistive/hardware-keyboard navigation, and a successful external export recipient. The user must bound these gaps or they must be addressed before this ticket resolves. Keep `Status: claimed`; this checkpoint is not an Answer or a decision on behalf of the user. The main and comparison emulators are closed.

2026-10-08 coverage decision: after the recommendation to accept the documented native gaps as follow-up work, close this observation ticket and advance to the controls decision, the user instructed “proceed with the next frontier.” This authorizes that proposed study boundary. It does not certify the untested native behavior or approve any product changes. This supersedes the pending-closure checkpoint above.

## Answer

[Android observations](../android-observations.md) establish 18 findings across native system/keyboard overlap, Back behavior, missing recovery controls, redundant notification actions, scanner failure in the tested environment, visual inconsistency, compact-window space cost, diagnostic displacement, enlarged-text overflow, dense navigation and QR presentation. [The gallery](../android-evidence/index.html) retains 111 images from 114 attempts; 30 images are excluded from usability conclusions. Native observations and simulated public-state/capability fixtures remain distinct.

The observation work is complete for this UX study under the user-authorized boundary: carry all [documented native coverage gaps](../android-observations.md#coverage-boundaries) into the final handoff as unverified follow-up checks. Do not turn them into passes or use them to imply release qualification. This includes both platform/device access gaps and the incomplete or invalid test cases listed in the report. Proposed controls and layouts remain decisions for the next tickets.

The acceptance build passed, all 145 inventory source hashes matched, and the owned emulators were closed. [Reproduction notes](../android-evidence/README.md) and [source/build receipt](../android-evidence/source-build-receipt.json) preserve the isolation and verification boundary. No production fixes or commits were made.
