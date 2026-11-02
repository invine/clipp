# Explore compact connection status

Date: 2026-10-09 (Asia/Dubai). Status: resolved; S2 and partial-problem attention approved. [Explore compact connection status](issues/12-explore-compact-connection-status.md) owns the decision. The user selected M1 Devices + M3 Settings; all status variants use that combination and the approved History layout.

The user's “ember” is interpreted here as a warm amber/orange. The requested direction is gray offline, amber relayed, green direct, with preferably one icon in History's top row and no exact counts.

## Device text and direct icon — approved selection

The user explicitly approved restoring Compact summaries device statuses as text and retaining the original triangle in the top row when direct connections are available. The [approval record](issues/12-explore-compact-connection-status.md#comments) is authoritative for this refinement. Device rows again show the secondary text “Connected · direct”, “Connected · relay” or “Offline” beneath the name, without path icons. An unknown path is named explicitly. The top-row direct symbol is the original green three-node triangle, shared across the S1/S2/S3 hosts and their status panels. This supersedes the diagonal two-node refinement. [Preview History](http://127.0.0.1:4195/?variant=S2&view=history&surface=phone&connection=direct) or [Devices](http://127.0.0.1:4195/?variant=S2&view=devices&surface=phone&connection=direct).

[Six focused captures](layout-prototype/evidence/text-status-triangle/measurements.json) verify the restored triangle and header above Search on phone/restored desktop, plus device text/no row icons in the status host and original M1, including 320px/200% text. No script errors, horizontal overflow or controls outside the viewport width were recorded. The user subsequently approved S2 for other status glyphs and attention for partial relay problems; the [resolution](issues/12-explore-compact-connection-status.md#answer) records the complete decision.

## Direct icon alternatives — rejected references

During the preceding exploration, the user reviewed and rejected three replacement motifs. Their top-row reference variants and earlier capture ledgers are retained; current Device rows use text:

| Option | Meaning and tradeoff |
| --- | --- |
| [L1 · Linked chain](http://127.0.0.1:4195/?variant=L1&view=history&surface=phone&connection=direct) | Earlier recommendation, now rejected: a compact link motif suggests an available connection without a completion checkmark. It still needs its accessible label/hint to identify the path as direct. |
| [L2 · Device pair](http://127.0.0.1:4195/?variant=L2&view=history&surface=phone&connection=direct) | Emphasizes connected devices. More illustrative, but may resemble the Devices navigation destination. |
| [L3 · Status light](http://127.0.0.1:4195/?variant=L3&view=history&surface=phone&connection=direct) | A green dot inside a quiet ring. Lowest visual weight, but the least explanatory without opening the status panel. |

The bottom arrows cycle only these three alternatives. Each changes the direct motif; the other states use S3 as a comparison host. S3 is not thereby approved, and the original S1–S3 variants remain references. The compact Clipp top line above Search is preserved. These replacements and the later diagonal refinement are superseded by the current selection above. Partial-problem attention was subsequently approved.

The [focused render ledger](layout-prototype/evidence/direct-icons/measurements.json) records twelve captures covering each option in phone History and Devices, plus linked-chain popup, restored desktop, 320px/200% light text, relayed, offline and warning states. Geometry, visible History header placement and consistency between History/device glyphs passed after correcting the capture checks to use the visible wide Search input and scope header expectations to History. Escape focus return and cycling through all three URL-addressable options passed. These are browser simulations.

## Status comparison context (current device/direct treatment above supersedes earlier proposals)

**Devices:** keep the original Compact summaries layout with visible status text beneath each device name. Path icons have been removed from the rows at the user’s request. The row remains a button whose accessible name includes its visible name and status; full status text also remains in device details.

**History:** retain the Clipp icon/name in a compact top line above Search at every width, following the user’s explicit header correction. One 24px connection icon sits at the right of that line inside a 40px pointer / 48px Android-simulation target. Search, Filters and Send occupy the next row. The status icon opens a short Connections panel containing Devices/Relay summaries, Auto Sync and management links. Wide places the icon next to the existing Auto Sync control. Exactly one connection-status icon is visible at a time; the normal header has no status text or counts.

| Variant | Approach | Tradeoff |
| --- | --- | --- |
| [S1 · Path glyph](http://127.0.0.1:4195/?variant=S1&view=history&surface=phone&connection=direct) | Approved direct triangle; routed-link and broken-link shapes for other states | The symbol changes more substantially between states. |
| [S2 · Network glyph](http://127.0.0.1:4195/?variant=S2&view=history&surface=phone&connection=direct) | Keeps a network silhouette; changes route, break or attention mark | Recommended: recognizable as connection status while shape and color both convey state. |
| [S3 · Health ring](http://127.0.0.1:4195/?variant=S3&view=history&surface=phone&connection=direct) | Approved direct triangle; circle with route, slash or attention mark for other states | Compact health cues; non-direct shapes remain proposals. |

[See Devices with text statuses](http://127.0.0.1:4195/?variant=S2&view=devices&surface=restored&connection=direct). The workbench's Connection scenario selector covers direct/mixed, relayed-only, direct without relays, relay-ready/no-devices, offline, first-use, unknown path, connecting, retrying, sign-in, degraded service and ready-with-warning. The three variants use the same state policy so the glyph comparison is controlled.

## Approved aggregate policy

| Known state | History indication | Meaning |
| --- | --- | --- |
| Direct Trusted Device connection, no known configured-relay issue | Green direct/network shape | A direct connection is available. This does not claim all devices are online or that a Clip was delivered. |
| Only relayed Trusted Device connections | Amber routed shape | Connected through relay; this is a working state. |
| Configured relay requires sign-in, is degraded/retrying, or reports a warning | Amber **exclamation** shape | A service needs attention, even if device connections remain usable. This priority is approved. |
| Relay ready, other devices offline | Gray waiting shape | Relay readiness is separate from having a device to exchange with. |
| No connected devices | Gray disconnected shape | No active peer connection. It does not imply that local history or clipboard capture has failed. |
| First use / initial connection setup / unknown path | Neutral gray idle/starting/question shape | Avoid asserting a fault or inventing a direct/relay path before it is known. |

An ordinary offline Trusted Device does not make otherwise usable connections a fault. No configured relay is a valid starting state and remains healthy when a direct connection is available. The user is not asked to interpret protocol details or a device count in History.

Auto Sync stays separate: a green connection icon can coexist with Auto Sync off. The existing visible off-state control remains, and the Connections panel reports the preference. The icon never says “Synced” or claims delivery. The panel is intentionally brief; exact identities and detailed diagnostics stay in Devices/Connections settings.

## Remaining decision round and acceptance checks

The user approved the S2 network family for non-direct states and a known configured-relay problem taking attention priority over an available device path in the single History indicator. The direct triangle and visible device status text are already approved. The following cases make the accepted behavior concrete:

| Scenario | Recommended presentation | What opening the icon must explain |
| --- | --- | --- |
| [Direct connection, configured relay ready](http://127.0.0.1:4195/?variant=S2&surface=phone&view=history&connection=direct) | Approved green triangle | A direct Trusted Device connection is available; other offline devices are normal. |
| [Only relayed device connections](http://127.0.0.1:4195/?variant=S2&surface=phone&view=history&connection=relayed) | Amber routed triangle | Sharing has an available relay path. Amber alone is not an error. |
| [Relay ready, devices offline](http://127.0.0.1:4195/?variant=S2&surface=phone&view=history&connection=waiting) | Gray dotted network | The relay is ready, but no other device is currently connected. |
| [No available device connection](http://127.0.0.1:4195/?variant=S2&surface=phone&view=history&connection=offline) | Gray slashed network | No device path is available; local History still works. |
| [Direct connection plus relay warning](http://127.0.0.1:4195/?variant=S2&surface=phone&view=history&connection=warning) | Approved amber attention mark | The configured relay needs attention; a direct connection remains usable. This precedence is approved. |

Acceptance checks for the eventual implementation:

- Keep one named status button in the Clipp branding row above Search, with a 40px pointer / 48px Android target. Give it a hover/focus hint and a short panel for touch and keyboard access. Preserve the current Search query and return focus after closing the panel.
- Use shape as well as color to distinguish a working relay route from an attention state. State changes update the accessible label and panel consistently.
- Derive device connectivity from Trusted Devices. Do not count transport peers that are merely participating in Pairing as healthy device connections. Offline members do not themselves create a warning.
- A direct path with no configured relay remains green. An unknown path stays explicitly unknown. A device with both direct and relayed paths is direct for the headline.
- Apply the chosen partial-problem priority consistently to sign-in requirements, degraded service and explicit ready-with-warning states. Report any usable connection in the panel; do not say all sharing has stopped merely because one configured relay has a problem.
- Initial startup/waiting is neutral. If another usable path is already known, starting an additional relay must not erase that fact. Real runtime projections must be checked against this rule; the current starting fixture contains no connected devices.
- Keep Auto Sync independent from connection availability. “Direct connection available” never means “Clip delivered” or “Synced”. Show an actionable Auto Sync off state separately.
- Preserve visible text statuses and row activation in Compact summaries, including long names, unknown paths, narrow views and enlarged text. Do not reintroduce per-device status icons through the History decision.

These checks describe the accepted status direction for the implementation handoff, not native acceptance evidence. Final layout reconciliation still owns typography, responsive boundaries and competing notices.

## Source constraints

The [shared UI types](../../packages/ui/src/types.ts:29) expose connected-peer path summaries (`direct`, `relay`, `unknown`, `hasDirect`, `hasRelay`), while all three runtime projections expose Trusted Devices, managed relay configurations/states and Auto Sync. Production implementation must intersect peers with Trusted Devices: an untrusted transport peer involved in Pairing is not evidence of a healthy trusted connection.

A device can have direct and relay paths simultaneously; [existing derivation](../../packages/ui/src/ClipboardApp.tsx:88) prefers direct for its headline. Managed relay `ready` is stronger than a raw socket connection. [Relay states](../../packages/core/network/managedRelays.ts:130) can report degradation or authentication/renewal trouble while a session or device connection remains usable, and `ready` may include a warning. A non-ready state must not automatically be rendered as physically disconnected. [Single-session fallback](../../docs/adr/0012-relay-transport-fallback-and-concurrent-sessions.md) also means unused alternative transports are not missing required connections.

These constraints explain the approved partial-problem priority. The alternative is to show healthy whenever some usable connection remains, reserving attention for total loss. That would hide a configured-relay problem from the History glance; the user explicitly selected showing partial problems.

## Browser evidence

The [pre-header-correction render ledger](layout-prototype/evidence/connections/measurements.json) records **59 captures and 14 passing interaction checks**, with all three glyphs in twelve scenarios plus representative Devices, popup, restored/wide/fullscreen, tablet, landscape, 320px, 200% text, query and Auto Sync off states. It checks one visible status icon, normal geometry, targets, hints, panel Escape/focus return, search retention, selected management destinations and URL-based workbench switching. No recorded script, geometry, status-count or interaction failures remain.

After the user clarified that the Clipp top line must remain above Search, the [focused header ledger](layout-prototype/evidence/history-header/measurements.json) records **eight captures** across phone, 320px, popup, landscape, restored desktop and 200% text, including the selected management and Search first variants. All captured headers/brands are visible above Search; S2 has exactly one visible status icon in that header, and Escape returns focus to it. No script errors, horizontal overflow or controls outside the viewport width were recorded.

At 360×720, the corrected History has a **48px branding line**, **48px toolbar**, **236px empty Search input** and its first Clip at **y=132**. The popup first Clip starts at y=92; restored desktop remains y=114. These measurements supersede the earlier narrow y=84/184px layout. At 200% text and short heights, the existing page reflow can place navigation before the Clips. Device rows remain 56px minimum height at normal text, with visible status text beneath each device name in the approved refinement.

The [token calculation](layout-prototype/evidence/connections/contrast.json) found a minimum **5.52:1** against the sampled light/dark surfaces for the green, amber and gray colors. This is token arithmetic, not proof of native accessibility. Meaning also appears in shapes, accessible names and optional text. Native font scaling, safe areas, screen readers, dynamic runtime updates and real connection outcomes remain implementation-time checks.

No runtime telemetry, real clipboard, relay credentials or production behavior is connected to this prototype. The device text and direct triangle are approved. The S2 non-direct glyphs and partial-problem attention are also approved; implementation and native acceptance remain separate work.
