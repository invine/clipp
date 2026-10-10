# UX inventory fixtures and evidence format

Use with [the flow/control inventory](flow-control-inventory.md) and [platform constraints](platform-constraints.md). These are reproducible recipes and recording rules; no fixture has been executed in a runtime by the inventory task.

## Fixture construction

Create identities and Pairing Targets through the existing core helpers in an isolated study profile. Keep private keys in that profile; evidence contains public fixture aliases such as `study-desktop`, not private material. Use fresh UUIDv4 Clip IDs and canonical generated public Peer IDs for domain/native tests. A DOM-only mock may use display strings, but must be labelled a UI fixture and cannot demonstrate accepted Pairing or Clip capture.

For comparable UI captures, freeze a fixture clock and store its epoch in the receipt. Use synthetic text only. Reset the study state between destructive cases through the fixture owner; never clear an operator installation. See [Electron acceptance](../../docs/electron-relay-acceptance.md), [Chrome isolation](../../apps/extension/README-managed-relays.md), and [Android isolated package](../../docs/android-managed-relay-native-acceptance.md). A mocked bridge rejection establishes UI feedback, not a native storage or network failure.

| Fixture name                                | Recipe                                                                                                                                                                                                                                                                                                     | Main observations                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Empty and local-only**                    | Fresh default identity, zero Trusted Devices/Clips/relays, Auto Sync enabled; then capture one text value without configuring a relay.                                                                                                                                                                     | First-use instructions, drawer discovery, truthful offline/local operation, no required-relay dead end.                                                                                                                                                                                                                                                                                                                 |
| **Typical daily use**                       | Three generated identities; one local, one online Trusted Device, one offline; two synthetic relay configurations; twelve Clips (local/remote, text/HTTP URL), three pinned. Ages: now, 2h, 2d, 10d, 40d.                                                                                                  | Every ordinary action, filters, offline labels, retention versus sharing expiry. Old ages must be seeded with appropriate local retention/firstStoredAt so expected records remain.                                                                                                                                                                                                                                     |
| **Dense history and lists**                 | 200 Clips, 20 Trusted Devices, six relay cards, eight pending requests and four waiting targets; deterministic varying names/content/ages.                                                                                                                                                                 | Scroll ownership, source dropdown, clipped menus, visible useful history, card density, focus location after mutation. These counts are stress samples, not asserted user limits or a performance benchmark.                                                                                                                                                                                                            |
| **Presentation boundaries**                 | Device Names/aliases with 1, 63 and 64 Unicode code points; invalid 65; NFC/decomposed accents; emoji; RTL/mixed-direction text; duplicate reported names with distinct IDs. Blank, newline and control-character submissions separately.                                                                  | Name validation is NFC + trim + ≤64 code points, excluding control/line/paragraph separators ([validator](../../packages/core/pairing/presentation.ts)); inspect save failure, cancellation, full identity access and alias clearing. Count code points after normalization, not bytes or JS string length.                                                                                                             |
| **Long Clip inspection**                    | Text of 219/220/221 code units plus a 2,000-character unbroken value; multiline text with an important last line; two Clips sharing the first 220 characters; long HTTP(S) URL; Unicode around truncation boundary.                                                                                        | Preview versus full content, selecting the correct Clip, Copy exactness, touch inspection and URL behavior. Do not assume the preview limit is a storage limit.                                                                                                                                                                                                                                                         |
| **No results and filtered deletion**        | Retain populated history; select unmatched search, empty Pinned, time cutoff, and one source with no matches. Clear while only one of many Clips is visible, with pinned data also present.                                                                                                                | Correct empty message, escape from filters, Clear scope and destructive-action comprehension. Use isolated state only.                                                                                                                                                                                                                                                                                                  |
| **Connectivity and Auto Sync combinations** | Auto Sync on/off × zero/one connected Trusted Device; relay ready with zero members; members offline while retained as trusted. Reuse a retained Clip and Share Now separately.                                                                                                                            | “Synced” versus connected, local capture while paused, one-Clip override, history import without clipboard write. Rendered fixture states are not live transfer proof.                                                                                                                                                                                                                                                  |
| **Pending approvals**                       | Two distinct incoming requests, replacement request from same peer, near-expiry request, four waiting outgoing targets, one storage-retry state.                                                                                                                                                           | Native notification → actual approval control; full Peer ID; concurrent actions; expiry/decline/retry feedback; reopen/resume and retained pending state. Generate valid signed requests for native/domain evidence; UI stubs only prove layout.                                                                                                                                                                        |
| **Identity recovery**                       | Inject initialization failure/retry, rotation recovery, revoked notice, identity-loss notice and successful acknowledgement using a fixture seam. Test real rotation only in an isolated identity.                                                                                                         | Available/inappropriate controls, recovery text, post-rotation empty singleton, renewed Pairing and old history cleanup. No voluntary healthy-identity reset is currently exposed.                                                                                                                                                                                                                                      |
| **Relay form and state breadth**            | Managed endpoint such as `https://relay.example.invalid/v1/relay`, long synthetic name/hostname; explicit relay with generated Peer ID and complete test addresses. Render each `connecting`, `login_needed`, `ready`, `degraded`, `refused`, `retrying`, `conflict`, missing-state and long-warning case. | Type switch clears endpoint; valid/invalid save; duplicate detection; busy controls; login/portal/retry availability; context after external return. `.invalid` is for mocked validation/layout, never a working relay. Use isolated approved test service for real auth. No finite relay-name length is enforced by the current normalizer; use 80/256-character names as stress samples, not “maximum legal” lengths. |
| **Operation failures and partial success**  | Reject name/alias save, approval, Auto Sync, delete/clear/pin/retention, relay save/login/portal/retry and QR copy. For retained Copy, separately return `complete`, `copied-without-clip`, or reject. For Share Now, distinguish read failure and processing failure.                                     | Correct inline/alert feedback, input retention, honest success, retry availability, recovery without duplicate unintended actions. Keep bridge-stub results separate from native outcomes.                                                                                                                                                                                                                              |
| **Stacked notices**                         | Three variants: copy failure + pending storage failure + cleanup error; rotation recovery + history warning; dismissed rotation notice followed by a fresh operation failure. Add Android's open failed-Pairing diagnostics.                                                                               | Shell sizing, main content not pushed outside reach, independently dismissible notices, keyboard focus and long error text. UI-only impossible combinations must be labelled stress states rather than product flows.                                                                                                                                                                                                   |
| **Android native interruptions**            | Camera denied/no-camera/no-QR; overlay open then rotate/Back/Home; relay editor with soft keyboard; permission/channel blocked; background enabled/stopped; three recorded interruptions → limited support; notification Pause/Resume/Stop; explicit text while runtime alive/absent.                      | Insets, recovery controls, retained opt-in, unsaved inputs, stream cleanup, queued versus accepted feedback, native settings return. Repeat on available supported API levels with honest gaps.                                                                                                                                                                                                                         |
| **Chrome lifecycle and multiple surfaces**  | Popup opens/closes; focus read fails; worker restarts; keep options open while changing Auto Sync/device name/history elsewhere; active search receives unmatched Clip; QR import fails; notification attempts popup open.                                                                                 | Stale state, query preservation, ignored failures and restart recapture. The latter has an existing external decision ticket; record evidence without redefining Clip semantics.                                                                                                                                                                                                                                        |

Large-capacity errors should be injected through existing seams or lowered test policy limits where possible; a UX study need not allocate a 100MiB clipboard payload. Current production defaults are 10,000 unpinned Clips / 100MiB history, 100 pending captures / 10MiB pending queue, 24-hour sharing lifetime / 30-day maximum, 30-day retention / one-year maximum. These numbers describe source defaults, not end-user controls. See [history policy](../../packages/core/history/store.ts), [capture coordinator](../../packages/core/clipboard/captureCoordinator.ts), and [Clip model](../../packages/core/models/Clip.ts).

## Viewport and interaction schedule

Use the full runtime ticket's matrix; pairwise sampling is sufficient initially, then expand around a failure. The following crossings are compulsory because the inventory found a relevant control/state boundary:

- Shared widths 599/600/601, 899/900/901 and 1099/1100/1101 CSS px; heights 759/760/761 for the auto-collapsing filters. Record actual renderer size, not requested outer-window size. For Android these synthetic CSS widths supplement native window/dp cases.
- Minimum/default E windows and restored/maximized/fullscreen modes; real P popup and independent options tab; Android portrait/landscape, keyboard open and available split-screen/expanded window. A normal tab displaying popup HTML is not real toolbar popup evidence.
- Default/intermediate/enlarged text and zoom; narrow/short plus large text; default/large OS display scaling; available 1×/2× DPR. Text scaling, page zoom and screenshot pixels must have separate fields.
- Pointer, keyboard-only and touch routes; long editor/QR dialog open while resizing; notification entry with drawer closed; menus at the bottom/right of the visible area; return from external sign-in; error banner appears during a form edit.
- Count clicks/keystrokes and scroll depth to the primary action, visible Clip cards, permanent header/sidebar/diagnostic area and unused space. Do not choose density by screenshot aesthetics alone: confirm labels, focus and targets remain usable.

## Evidence ledger

Keep one append-only JSONL record per scenario/configuration attempt, with screenshots/logs in an adjacent retained directory. The ledger is authoritative for what ran; this recipe document is not a results ledger. Use descriptive scenario names from the inventory, and stable local IDs for receipts/findings (these are not issue numbers).

```json
{
  "evidenceId": "electron-approval-entry-default-001",
  "scenario": "Incoming approval and notification entry",
  "fixture": "Pending approvals",
  "runtime": "electron",
  "surface": "main-window-from-notification",
  "timestampUtc": "<actual capture time>",
  "source": {
    "head": "<full commit>",
    "diffSha256": "<relevant tracked diff>",
    "manifest": "<source hash manifest path>",
    "build": "<actual build command/artifact identity>"
  },
  "environment": {
    "os": "<version>",
    "runtimeVersion": "<Electron/Chrome/Android and WebView>",
    "isolation": "<owned synthetic profile/package>",
    "input": "pointer",
    "windowMode": "restored",
    "outerBounds": null,
    "contentBounds": null,
    "viewportCss": null,
    "visualViewport": null,
    "physicalResolution": null,
    "dpr": null,
    "displayScale": null,
    "pageZoom": null,
    "fontScale": null,
    "androidWindowDp": null,
    "systemInsets": null,
    "keyboardInsets": null
  },
  "preconditions": ["<observed state>"],
  "steps": ["<reproducible actions>"],
  "expected": "<accepted contract or explicitly labelled UX criterion>",
  "actual": "<observed result>",
  "outcome": "not-run",
  "evidenceClass": "source-only",
  "artifacts": [],
  "impact": "<blocked task / extra steps / cosmetic / none>",
  "confidence": "<observed / source-confirmed / hypothesis>",
  "sourcePointers": [],
  "recommendation": "<investigate / proposed change / accepted difference>",
  "limitations": ["<missing native prerequisite or surrogate boundary>"]
}
```

Allowed outcomes: `pass`, `fail`, `blocked`, `not-run`. Evidence classes: `source-only`, `rendered-fixture`, `native-isolated`, `live-isolated`. Preserve unknown measurements as null, never inferred successful defaults. Real platform interactions require a runtime receipt; stubbed auth/storage/network states must remain `rendered-fixture` even when hosted inside a native window.

For every finding retain the smallest reproducible fixture, environment, expected/actual result, source pointer, screenshot/geometry where relevant, impact and recommendation. Store no personal clipboard text, tokens, raw credentials or private keys. Synthetic fixture text may be shown. After a source change, mark affected evidence stale rather than silently reusing a screenshot from another revision.
