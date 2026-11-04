# UI behavior scenarios

Run `npm run ui-behavior` from the repository root and open
<http://127.0.0.1:4175>. The Pairing screen uses the production shared UI and
its document-lived Pairing submission behavior. Scenario controls can settle a
pending request as success or failure, inspect requested Pairing effects, and
reset the mounted session.

Run `npm run test:ui-behavior` for the mounted Chromium journeys. The Vite entry
is under `tests/harness`, so it is not included in any production application
build.
