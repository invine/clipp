# Reducer-backed UI behavior and runtime adapters

## Outcome

Run the real Clipp UI and interaction behavior in automated tests and an interactive browser harness without real connection, Pairing, Clip sending, clipboard writes, persistence or native runtime startup. Production uses the same behavior module with platform adapters. Whole application scope, not just recent changes or Pairing.

## Requirements

- R1: Pure reducer transitions own shared workflow state and operation lifetimes. Effects run outside reducers. Deepen existing uiSession and preserve navigation, drafts, notifications, focus intent, retries, duplicate prevention and uncertainty acknowledgement; keep DOM focus/geometry application in React.
- R2: Extract workflow decisions still stranded in ClipboardApp: Pairing submission/approval/scan, Device Revocation, Clipboard History reuse/Share Now/pin/delete/clear, naming, relay edits/actions, settings/recovery, and Identity Rotation invalidation. Retain useful internal modules rather than create one giant switch. Runtime-owned settings/reset authority remains authoritative; UI presentation state may use focused reducers.
- R3: Introduce a typed runtime-facing UI adapter seam with snapshots/subscriptions, action outcomes and explicit host capabilities. Production and scripted adapters both satisfy it. Do not merely rename the large props interface: hide subscription lifetime, message translation and refresh sequencing from runtime views.
- R4: Migrate Electron renderer, AndroidApp and extension popup/page to adapter composition, preserving runtime differences. Android native startup, scanner/input/geometry integration stay in its adapter/composition; extension background/offscreen ownership and popup-only capture remain intact. No global clipboard/confirm/network dependency is required when mounting shared UI with a scripted adapter.
- R5: Scripted adapter offers deterministic initial state, runtime publications, queued delayed/success/failure/unconfirmed outcomes and observable requested effects. It supplies no real network/native imports and does not reimplement production UI behavior. Support old results after Identity Rotation, authority revision changes and task closure.
- R6: Automated mounted UI tests click real controls through production behavior. Cover Pairing pending/failure/duplicate submission, Share Now or reuse failure/retry, connection presentation, identity-change stale results, capabilities and adapter cleanup. Existing regression coverage stays unless demonstrably replaced at the agreed seam.
- R7: Add a local browser scenario harness and documented npm commands to inspect/control disconnected/connected, Pairing pending/failure, Clip actions, recovery/settings and Identity Rotation scenarios. Use existing Clipp styles with separate scenario controls. No live credentials/services needed; harness is not shipped in production.
- R8: Preserve existing accepted domain semantics and UX. Pairing results/publications and independent settings/history authority/revisions must not collapse into optimistic success. Preserve ADRs 0006/0010/0011/0012 and startup-empty managed relay settings.

## Design guidance

Shared UI workflow state belongs in packages/ui; reusable cross-runtime consumption policy belongs in packages/core without importing UI/React into core. Production bridges translate at apps/*; Electron main/preload keep relative imports. Reducers are deterministic; clocks, IDs, clipboard, confirmation, scanning, subscriptions and promises are effects. Use operation identity/generation to ignore stale completions with safe cleanup. No new state-management dependency required.

## Agreed test seams

User approved real reducer + effect runner + mounted UI with scripted runtime adapter (D2). These prove interactions/lifecycle, not native/transport delivery. Adapter contract tests prove translation/cleanup; existing core tests retain protocol coverage. Routine verification: npm run verify plus mounted scenario tests and harness build. Native/live acceptance is out of scope.

## Delivery

Isolated integration branch based on main cbfa8887c9f54778c9820f41f4c83460d33b0173. Local preparation/commits only; preserve pre-existing work. Standards/Spec review and fresh integration verification precede resolution.
