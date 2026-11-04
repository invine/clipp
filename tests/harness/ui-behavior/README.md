# UI behavior scenarios

Run `npm run ui-behavior` from the repository root and open
<http://127.0.0.1:4175>. The Pairing screen uses the production shared UI and
its document-lived Pairing submission behavior. Scenario controls can settle a
pending request as success or failure, inspect requested Pairing effects, and
reset the mounted session.

Open <http://127.0.0.1:4175/background-continuity.html> to exercise the
Background Continuity controls. This scenario scripts confirmation, delayed
enable/stop/refresh results, notification settings, diagnostics export, and
runtime replacement without invoking Android native behavior.

Open <http://127.0.0.1:4175/pairing-code.html> to control Pairing QR
generation, copy acknowledgements, scripted scan outcomes and permission return.
Reload the page to reset its pending effects. This scenario does not open a
camera or write to the system clipboard.

Open <http://127.0.0.1:4175/settings-recovery.html> to inspect Appearance and
Clip preference saves through the real settings client with controlled writes
and refresh outcomes.

Open <http://127.0.0.1:4175/relay-management.html> to exercise relay edits,
login/account/retry actions, uncertain removal, and notification return using
deferred scripted effects. Relay list and connection status change only when
the scenario publishes an observation.

Run `npm run test:ui-behavior` for the mounted Chromium journeys,
`npm run test:pairing-code` for Pairing code and scanning,
`npm run test:relay-management` for relay journeys, and
`npm run test:ui-behavior -- --grep settings` for settings recovery. The Vite
entry is under `tests/harness`, so it is not included in any production build.
