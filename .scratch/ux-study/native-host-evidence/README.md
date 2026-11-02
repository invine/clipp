# Native host evidence

See the [observation report](../native-host-observations.md) and [gallery](index.html). This follow-up preserves the original runtime runs in their own directories. It adds actual host lifecycle, controlled real offline networking and settled window measurements with fresh synthetic profiles.

The `chrome` and `electron` harnesses launch compiled app outputs from the repository. They accept study commands over stdin; the `phase-*.js` files retain the substantial sequences. Native window/menu/keyboard input was performed with CUA. Runtime APIs/CDP supply instrumentation, offscreen/worker lifecycle and network controls; they are not substituted app responses. Clipboard reads/writes are memory guarded, so this run cannot qualify actual OS clipboard permissions, application or restart recapture.

`chrome/recheck.cjs` resumes only the exact study-owned paths in `chrome/environment.json`, writes a separate `chrome/recheck` ledger, and leaves earlier trials intact. It depends on those temporary paths still existing; it is a retained study script, not a portable acceptance test. Do not point it at a personal Chrome profile. Electron's `phase-helpers.js` closes the specific owned process and clears its timeout before relaunch; use that helper for restarts, not the older generic quit closure.

## Interpretation and exclusions

- `chrome/cold-offline-popup.png`: excluded as offline evidence. The actual popup stayed online and had loaded icons. The context-level network flag and first selector were insufficient.
- `chrome/offline-popup-verified.png`: valid target-specific offline failure. The popup had offline network state, no loaded font faces and literal icon labels/overlap.
- `chrome/native-zoomed-window.png`: do not use for settled maximized geometry. Replace with `chrome/recheck/native-maximized-settled.png` (1512×862 content).
- Worker `Execution context was destroyed` occurred when a capture helper reused the stopped worker's Playwright object. The real stop/wake state check completed before that harness failure. Target-ID reuse is expected in this trace and does not disprove restart.
- Electron close/minimize inspection activates the app. Read the event timeline; do not infer spontaneous reopening, sustained background behavior or native tray success from the final visible state.
- Chrome File-menu click retained the popup. Native menu exploration is not equivalent to an outside-content click. Escape dismissed it afterward.
- Native fullscreen state does not imply screen-height renderer content. Use recorded native and DOM dimensions; no screenshots here establish another physical display or OS text scaling.
- Early Electron AX observations showed font ligature names while later captures loaded icons. No network assets were intercepted for this follow-up, and no separate controlled cold-offline Electron result is asserted.
- The CUA provider refused selecting Codex as another focus target. That attempt produced no app observation and is not UX evidence; no bypass was attempted.

## Provenance and shutdown

[Source/build receipt](source-build-receipt.json) records source consistency, build commands/results and current artifact hashes. Build output is generated locally, with no production source changes. [Public relay setup](public-relay-setup.json) contains only the user-supplied portal/registered ID and public unauthenticated endpoint status; it proves no login or callback completion.

`chrome/closed.json`, `chrome/recheck/closed.json` and `electron/closed.json` confirm normal shutdown of the owned hosts. Temporary profiles contain only fresh synthetic state; no profile databases, renewable credentials or private keys are exported with these evidence files. Preserve these records and the original 51-finding register; additional supporting evidence is not an extra finding count.
