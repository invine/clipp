# Compare Devices and Settings organization

Date: 2026-10-09 (Asia/Dubai). Status: the user selected **M1 Devices + M3 Settings**. The [decision ticket](issues/11-compare-devices-and-settings-organization.md#answer) owns the verdict. The material below retains the comparison that informed it. The requested follow-up is [connection status](connection-status-exploration.md).

## What the comparison asks

How much management should be visible together, and how much should open only when needed? Compare each destination independently; combining a Devices layout from one option with Settings from another is valid.

| Option | Devices | Settings | Tradeoff |
| --- | --- | --- | --- |
| M1 · Compact summaries | Request summary, This device entry and compact Trusted Device rows; focused dialogs for detail/edit work | Everyday preferences inline; named entries for connections, sharing lifetime, history, identity and troubleshooting. Two groups sit beside each other wide. | Strong overview and direct everyday access; focused tasks take a detail step. |
| M2 · Inline sections | Requests, This device and Trusted Devices expand in the page | Expandable groups contain their controls directly | Good for scanning multiple groups together, but expanded sections make the page taller and move later controls. |
| M3 · Category tabs | Trusted devices, Requests and This device share one content area | General, Connections and Advanced share one content area | Shorter visible page; a category change is needed to inspect another group. |

**Recommendation to evaluate:** M1 for Devices, M3 for Settings. The former exposes pending work and device status together; the latter avoids another long settings page. This is a recommendation, not a user answer or a usability-test result.

## Open the same route

| Option | Devices, phone | Settings, restored window |
| --- | --- | --- |
| M1 · Compact summaries | [Preview](http://127.0.0.1:4195/?variant=M1&view=devices&surface=phone) | [Preview](http://127.0.0.1:4195/?variant=M1&view=settings&surface=restored) |
| M2 · Inline sections | [Preview](http://127.0.0.1:4195/?variant=M2&view=devices&surface=phone) | [Preview](http://127.0.0.1:4195/?variant=M2&view=settings&surface=restored) |
| M3 · Category tabs | [Preview](http://127.0.0.1:4195/?variant=M3&view=devices&surface=phone) | [Preview](http://127.0.0.1:4195/?variant=M3&view=settings&surface=restored) |

The bottom arrows cycle these three options. Use Destination and Available window to inspect the same option on the other page or surface. All variants retain the approved History layout. Chrome popup demonstrates the agreed link to full-page management; it does not settle the unanswered allocation of individual approval/detail actions to popup versus full page.

## Tasks to try

1. Review the two incoming requests. Inspect one request's Peer ID. Find the outgoing waiting state without confusing dismissal with cancellation.
2. Open the offline Reading tablet, inspect its Peer ID, set a Local Device Alias, then choose Use device name. Membership persists while offline.
3. Open This device, change its Device Name, and find its Pairing information. Pair a device includes a paste route; Android shows Scan QR and the Chrome full page shows QR-image import. QR is a labelled, non-scannable study placeholder.
4. Change appearance, Auto Sync and retention. Locate Clip Sharing Lifetime and read why it differs from retention.
5. Open Connections. The normal fixture has no relays. Add a relay and resize while editing its endpoint. The dense fixture supplies seven synthetic relays and twenty remote devices for layout inspection.
6. On Android, find the background-connection limitation and diagnostics without reading a large technical panel in the ordinary page. Recovery places Pairing feedback beside the input; technical detail stays inside the dialog.

Preferences and aliases have in-memory previews. Pairing submission, approvals, QR generation/import, clipboard, relay changes, permissions, diagnostics, revocation, history clearing and identity reset are demonstrations. No backend or personal state is connected. Drafts survive direct resizing; changing a workbench preset reloads the fixture.

## Evidence behind the question

The current shared drawer combines This device, outgoing Pairing, incoming approvals, Pairing input, Trusted Devices, relays and routine settings. The device list also has a nested 200px scroller. The measured dense drawer reaches **2814px / 724px visible in Electron**, **3079px in the Chrome popup**, and **3248px / 716px visible in Android**. In Chrome options, Settings begins at y=2276. These are the existing runtime fixture observations, not measurements of this proposal: [Electron E14](electron-observations.md), [Chrome C14](extension-observations.md), [Android A16](android-observations.md).

The fact review checked [shared management](../../packages/ui/src/ClipboardApp.tsx:1114), [relay settings](../../packages/ui/src/ManagedRelaySettings.tsx:143), [the action inventory](flow-control-inventory.md), [glossary](../../GLOSSARY.md) and the [pending control decisions](issues/06-decide-control-gaps-and-retirements.md). Local Device Alias is local presentation; Device Name is self-reported; Peer ID identifies the Device Identity. Retention and Clip Sharing Lifetime have different effects. Android background continuity and Auto Sync are separate preferences. Relay account management is distinct from Device Identity and does not imply local sign-out.

## Browser render observations

The [ledger](layout-prototype/evidence/management/measurements.json) records 65 captures and 17 passing interaction checks. Base renders cover all three options at phone, restored/wide desktop, Chrome full-page, tablet, 320px with 200% text/long names, empty/dense/recovery states, short landscape and popup handoff. Representative detail views cover remote identity/alias, Pairing, request review, relays and Android background connection. Checks include alias save/clear, Pairing and relay drafts across resizing, Escape focus return, and availability of the approved History controls.

| Default 360×720 phone fixture | M1 | M2 | M3 |
| --- | ---: | ---: | ---: |
| Devices content extent / available viewport | 615 / 615px | 770 / 615px | 615 / 615px |
| Settings content extent / available viewport | 760 / 615px | 968 / 615px | 615 / 615px |
| Initially exposed settings controls | 3 | 4 | 3 |

M3's smaller default extent comes from showing one category; it does not imply fewer settings or faster completion. At 900×668, M1's two Settings groups and M3's General category fit within the 612px content viewport; M2's initially expanded sections need 782px. These synthetic comparisons are not native before/after benchmarks.

No script errors, horizontal page/dialog overflow, controls outside viewport width, undersized simulated Android targets or dialog bounds failures were detected. Screenshots were visually reviewed for all six normal phone views, representative restored layouts, 200% categories/dialogs and recovery/draft views. Simulated text scaling and 24px Android insets do not establish native font scaling, IME, Back, system bar or assistive-technology acceptance.

The remaining confirmation/reset/account decisions stay open. This prototype demonstrates their entry points without resolving those lifecycles. No production changes or commits were made.
