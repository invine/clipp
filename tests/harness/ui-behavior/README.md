# UI behavior scenario catalog

The harness mounts Clipp's production shared UI, UI session, reducers and effect
runner with scripted host observations and effects. It does not start an
Electron, Android or extension runtime. Scenario pages use in-memory adapters;
host boundaries that are not scripted throw so accidental external work fails
instead of succeeding silently.

## Launch and choose a scenario

From the repository root, run:

```sh
npm run ui-behavior
```

Open <http://127.0.0.1:4175>. The landing scenario has a catalog of links to
Pairing code and scanning, Clip actions, History mutations, device naming and
revocation, relays, preferences and recovery, notifications, Background
Continuity, identity reset and Trust Requests. It also publishes unknown,
offline, direct and relayed connection observations. The pages share the same
production UI; use each page's controls to publish observations, resolve or
reject pending effects, or replace the scripted runtime where supported.

Reload any scenario page to restore its initial observations and pending work.
The Pairing landing page also has a **Reset scenario** control, which discards
its pending Pairing result, clears recorded effects and restores its initial
observations. Pending effects are settled through the visible scenario
controls; they never trigger platform work.

## Automated journeys

Run all mounted UI behavior journeys:

```sh
npm run test:ui-behavior
```

The workflow-specific Playwright commands are:

```sh
npm run test:ui-clip-actions
npm run test:pairing-code
npm run test:relay-management
npm run test:device-management
npm run test:trust-requests
npm run test:history-mutations
npm run test:notification-journeys
npm run test:identity-reset
```

`test:ui-behavior` includes Pairing submission, preference recovery, background
continuity, and wide/narrow navigation and focus journeys. The specific test
commands select other pages already covered by their corresponding tickets;
they are not duplicate implementations of those journeys. For the complete
story-to-evidence index, see [SCENARIO-COVERAGE.md](./SCENARIO-COVERAGE.md).

## Build and delivery boundary

Build every harness page with:

```sh
npm run build:ui-behavior
```

The build output goes to `.cache/ui-behavior-harness/`. Vite's root and all
scenario entries live under `tests/harness/ui-behavior`; the production runtime
builds use their own app entry points and do not import the harness or its
fixtures. Harness build output is for local inspection, not production delivery.

These tests prove mounted UI behavior against controlled effects and
observations. They do not establish real connectivity, camera or notification
permissions, native background execution, system clipboard access, or Clip
delivery. Keep domain, adapter, runtime and native acceptance evidence
separate; the production adapter tests and platform acceptance workflows retain
those responsibilities.
