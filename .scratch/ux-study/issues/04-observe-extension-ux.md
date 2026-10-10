# Observe Chrome popup and options flows

Type: task
Labels: wayfinder:task
Mode: AFK
Status: resolved
Assignee: Codex (current session, 2026-10-07)
Parent: [Clipp cross-runtime UX study](../map.md)
Blocked by: 01, 02

## Question

How do the actual Chrome popup and separate options page behave during common and exceptional journeys, and where do their controls, appearance or space use diverge without a user benefit?

Use an isolated unpacked extension profile and synthetic state, following the existing extension fixture guidance. Exercise the real toolbar popup within Chrome's verified host limits; opening `popup.html` in a normal tab is only supplementary evidence. Record its actual content dimensions, clipping, scroll containers and loss of temporary state when it closes.

Compare popup and options control/style inventories side by side: navigation, headings, colors/themes, typography, spacing, inputs/buttons, notices, Pairing/QR, Trusted Devices, history and relay management. Check manual clipboard capture permissions/errors and whether opening options preserves enough context to complete the user's goal.

For options use representative content viewports 480×640, 768×800, 1024×768, 1440×900 and 1920×1080, narrow/short nonmaximized browser windows, maximized and fullscreen. Exercise 100%, 125%, 150% and 200% zoom where useful, supported display scales, keyboard focus and long/dense fixtures. Popup host limits and options tab reflow must be evaluated separately.

Source reconnaissance found `apps/extension/src/popup.html` requesting 480×800 with an 800px minimum height. Compare that request with the official host limit and actual granted viewport; do not infer accessible bottom controls from a tab-rendered screenshot of that HTML.

Document offscreen buttons, huge fields/strings, nested scroll traps, duplicate paths, missing feedback, popup-to-options dead ends and excessive persistent chrome. A browser fixture without native toolbar popup evidence cannot close the popup portion of this study; name any remaining gap.

## Comments

2026-10-07 inventory handoff: use [user flows and control coverage](../flow-control-inventory.md) and [fixtures/evidence format](../inventory-fixtures.md). Cover real popup height/navigation, ignored Pairing failures, notification entry, inert Expiry/type controls, options QR feedback, missing history mutations/approval UI and cross-surface stale state. Inspect emitted options CSS before asserting that its directly imported relay component is unstyled; its source import path does not import shared styles. Existing content-script and restart-recapture tickets retain their ownership.

## Answer

Resolved 2026-10-07 with [Chrome extension UX observations](../extension-observations.md), [94-capture gallery](../extension-evidence/index.html), [evidence ledger](../extension-evidence/evidence.jsonl) and [reproduction/limitations](../extension-evidence/README.md). The report records 16 findings with scenarios, source pointers, impact, confidence and proposed acceptance criteria.

The study ran the actual Chrome toolbar **POPUP** host in a disposable unpacked-extension profile, verified its 480×600 viewport and detached inspection before demonstrating that dismissal loses relay drafts. The requested 800px document height does not prevent reaching the bottom drawer controls. Options was observed in short/restored/maximized windows, Chrome's reported fullscreen state, the five requested controlled viewports, 320px reflow and native tab zoom through 200%. The popup did not inherit tab zoom. Defective Playwright zoom images were replaced with verified direct-CDP captures.

Native observations establish stale options writes that silently re-enable Auto Sync, ineffective Expiry/type controls, stale cleared/search history, rejected settings shown as saved, unstyled relay editing and missing feedback for invalid Pairing text. Synthetic public response fixtures establish Pairing/error-state rendering, low-contrast dark styling, hidden approvals and dense layout costs. Popup recovery banners and keyboard navigation reproduce shared Electron defects. Long relay names overflow options; popup relay actions wrap and remain reachable.

The [source/build receipt](../extension-evidence/source-build-receipt.json) records the successful relay-acceptance build and confirms all 145 inventory source hashes unchanged. Production code, JS/CSS and operator data were preserved. Both owned Chrome processes closed.

Remaining gaps are explicit: native notification/permission journeys, real Pairing/auth handoffs, service-worker restart, other physical displays/OS text scaling and independently enlarged popup UI. Chrome reported fullscreen but retained 1100×820 bounds; display-filling fullscreen is unqualified. These are handoff coverage decisions, not implied passes. No application fixes or control/layout decisions were made.

Evidence is linked into [Decide missing controls and obsolete entry points](06-decide-control-gaps-and-retirements.md) and [Decide visual consistency and efficient layout](07-decide-layout-and-visual-direction.md). The next frontier is [Observe Android layouts and native interactions](05-observe-android-ux.md).
