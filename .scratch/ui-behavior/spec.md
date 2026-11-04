# Reducer-backed UI behavior and runtime adapters

Status: ready-for-agent
Execution: implementation authorized by the user on 2026-11-04 via the request to implement tickets in this directory.
Owning repository: client (Clipp)

## Problem Statement

Clipp's UI is difficult to exercise as a complete interactive application without starting runtime behavior such as connecting devices, Pairing, accessing the system clipboard, or sending Clips. A developer needs to reproduce loading, failure, recovery and timing-sensitive states reliably, and inspect them visually without arranging real devices or network conditions.

The application already has useful seams: the shared UI accepts action callbacks, the document-lived UI session holds some interaction behavior, runtime consumers reject stale publications, and tests inject dependencies. However, workflow decisions remain distributed among rendering, session owners and three runtime compositions. Existing tests can verify an isolated helper or rendered state without proving that a user's click drives the correct sequence of pending work, outcomes and recovery.

The intended change covers the application as a whole: shared UI, Electron, Android, and the Chrome extension's popup and management page. Pairing is a useful first migration slice, but is not the completion scope.

## Solution

Introduce a coherent seam between shared UI behavior and runtime effects. The real UI uses reducer-backed interaction behavior in production and in tests. A production adapter performs platform operations; a scripted adapter supplies controlled results and observations without performing those operations.

Consolidate runtime-to-UI adaptation so that views consume the same interface while each runtime retains its capabilities and lifecycle. Keep durable domain behavior authoritative in the existing core modules.

Provide automated tests that operate the mounted UI and an interactive browser scenario harness using the same production behavior and scripted adapter. Developers can reproduce pending Pairing, unavailable connections, failed Clip actions, uncertain saves and Identity Rotation without connecting devices or modifying their clipboard.

## User Stories

1. As a Clipp developer, I want to mount the real UI without starting a native runtime or network connection, so that I can test interaction behavior in isolation.
2. As a Clipp developer, I want tests and production to execute the same reducers and effect runner, so that a passing test describes the behavior users receive.
3. As a Clipp developer, I want one shared UI-facing effect seam across runtimes, so that I can reuse scenarios without rebuilding their setup for each host.
4. As a Clipp developer, I want shared interaction rules to have a clear owner, so that fixes to pending work and recovery apply across runtimes.
5. As a Clipp tester, I want to provide initial runtime observations and publish later observations, so that I can reproduce changes while the UI is mounted.
6. As a Clipp tester, I want to delay an operation's result, so that I can inspect pending controls and duplicate-action prevention.
7. As a Clipp tester, I want to supply success, rejection, failure, partial completion and unconfirmed outcomes where supported, so that I can test the corresponding feedback.
8. As a Clipp tester, I want to observe requested effects and their arguments, so that I can verify the UI requested the intended action without executing it.
9. As a Clipp tester, I want to complete earlier operations after newer state arrives, so that I can reproduce stale-result races deterministically.
10. As a Clipp tester, I want unexpected runtime effects to be visible failures, so that a scenario cannot silently exercise a real dependency.
11. As a Clipp developer, I want an interactive browser harness with named scenarios, so that I can inspect the real UI without writing a new test for each visual investigation.
12. As a Clipp developer, I want to reset a scenario and control its pending outcomes, so that I can reproduce the same journey repeatedly.
13. As a Clipp tester, I want to inspect the same scenarios at wide and narrow sizes, so that I can verify navigation and task presentation across supported layouts.
14. As a Clipp user, I want unknown connection state to remain distinct from a confirmed lack of connectivity, so that the UI does not misrepresent my Device Network.
15. As a Clipp tester, I want to publish Direct Connection and Relayed Connection observations without dialing, so that connection presentation can be tested independently of transport.
16. As a Clipp user, I want Pairing submission to preserve my input when it fails, so that I can correct it and retry.
17. As a Clipp user, I want repeated Pairing submissions to be suppressed while a result is pending, so that one gesture sequence does not create duplicate work.
18. As a Clipp user, I want successful submission to show waiting for approval until authoritative outcomes arrive, so that the UI does not claim Admission prematurely.
19. As a Clipp tester, I want to simulate Trust Request acceptance, rejection and unconfirmed decisions, so that approval feedback can be verified without another device.
20. As a Clipp tester, I want to control Pairing code generation, scan results, cancellation and camera-permission outcomes, so that Pairing entry paths can be exercised without a camera.
21. As a Clipp user, I want leaving a scanning task or changing Device Identity to retire its work, so that a late scan cannot submit against the wrong context.
22. As a Clipp user, I want Share Now to show pending work and actionable failures, so that I understand when to retry.
23. As a Clipp user, I want Clip reuse to distinguish completion, copying without a new Clip, and an unconfirmed result, so that I do not accidentally repeat a potentially completed action.
24. As a Clipp tester, I want to exercise pinning and deleting Clips using scripted results and history observations, so that those controls can be verified without storage access.
25. As a Clipp user, I want uncertain history clearing to require reconciliation before another attempt, so that the UI does not assume the operation had no effect.
26. As a Clipp user, I want Clipboard History searches, filters and selected tasks to retain their established behavior, so that restructuring the application does not disrupt navigation.
27. As a Clipp user, I want Device Name and Local Device Alias drafts to survive supported navigation and handle removed targets, so that edits remain tied to the intended Device Identity.
28. As a Clipp tester, I want to control confirmation and completion of Device Revocation, so that I can verify cancellation and failure without revoking a real device.
29. As a Clipp tester, I want to copy device details through a scripted host effect, so that the test never writes to my system clipboard.
30. As a Clipp user, I want relay edits and login, account and retry actions to preserve their existing pending and recovery behavior, so that the refactor does not change connection management.
31. As a Clipp user, I want Auto Sync and appearance settings to retain their authoritative values while saves are pending or unconfirmed, so that uncertain writes are not presented as confirmed.
32. As a Clipp tester, I want to deliver settings and history observations independently, so that I can test their separate revision and recovery rules.
33. As a Clipp user, I want recovery actions to keep failures visible until recovery is confirmed, so that failed refreshes do not appear successful.
34. As a Clipp tester, I want to simulate notification availability and navigation requests, so that notification-driven tasks can be tested without native notifications.
35. As a Clipp user, I want a notification-opened task to respect existing drafts and task return context, so that responding to it does not lose my work.
36. As a Clipp tester, I want to simulate Android Background Continuity controls and confirmations, so that their presentation can be tested without enabling native background behavior.
37. As a Clipp tester, I want to present existing identity-reset phases and outcomes through the adapter, so that their controls can be tested without resetting a real Device Identity.
38. As a Clipp user, I want Identity Rotation to invalidate obsolete identity-bound work, so that old results cannot affect the new Device Identity.
39. As a Clipp tester, I want to unmount, remount or replace an adapter while work is pending, so that subscription cleanup and operation ownership can be verified.
40. As a Clipp developer, I want Electron, Android and extension adapters to preserve their capabilities, so that shared behavior does not erase meaningful platform differences.
41. As an extension user, I want popup-only clipboard capture and management-page behavior to retain their existing limits, so that the refactor does not expand clipboard access or runtime lifetimes.
42. As a Clipp developer, I want the scenario harness to be excluded from production delivery, so that test controls cannot become product functionality.
43. As a Clipp maintainer, I want existing domain and native tests to retain their separate role, so that stubbed UI tests are not mistaken for proof of real Clip delivery.
44. As a Clipp developer, I want documented local commands for the harness and automated journeys, so that the same scenarios are easy to run and maintain.

## Implementation Decisions

- **R1 — Shared behavior ownership.** Deepen the existing document-lived UI session and related interaction modules. Reducers own deterministic transitions for workflow state; an effect runner owns asynchronous execution. The interface should expose enough behavior for production callers and tests without exposing private reducer structure. A collection of focused reducers is appropriate; a single application-wide reducer is not required.
- **R1 — State categories.** Keep runtime observations, UI workflow state and host presentation concerns distinguishable. The UI may derive display state from authoritative observations, but must not create an independent authoritative Membership View, Clipboard History or settings store. DOM measurement, actual focus movement and geometry handling stay in the rendering/host integration; workflow intent and task ownership belong in shared behavior.
- **R2 — Workflow coverage.** Move remaining interaction decisions out of rendering across Pairing submission and approval, Pairing code and scan tasks, Device Revocation, Clip reuse and Share Now, history pin/delete/clear actions, naming, relay editing/actions, settings and recovery, notification navigation, background controls and identity-reset presentation. Preserve useful existing modules behind the seam instead of flattening them into a generic state container.
- **R2 — Operation ownership.** Preserve duplicate prevention, draft versions, identity generations, task lifetime and uncertainty acknowledgement. Late results must not overwrite newer drafts, retired tasks or a replacement runtime owner. Navigation that intentionally suspends a task must preserve its existing allowed completion behavior. Cancellation and cleanup must not invent cancellation of an already accepted durable runtime operation.
- **R3 — Runtime-facing interface.** Provide one shared UI-facing runtime adapter interface for current observations, change subscriptions, typed action outcomes and host capabilities. Runtime adapters own bridge translation, refresh sequencing and subscription lifetime. This is a behavioral seam, not merely a new container for the existing large callback surface.
- **R3 — Effects.** Keep network activity, clipboard access, native prompts, scanning, persistence, notifications and lifecycle work outside reducers. Provide controllable time and generated identifiers where they affect workflow decisions. Mounting the shared UI with the scripted adapter must not implicitly construct or start production dependencies.
- **R3 — Capabilities.** Represent unavailable operations explicitly. A missing capability must retain its established hidden or disabled presentation rather than be replaced with a successful no-op. Snapshot stability and subscription cleanup must support normal React rendering and lifecycle replay.
- **R4 — Production adaptation.** Use the shared interface in Electron, Android, and both extension surfaces. Electron supplies its preload bridge; Android supplies its runtime and native capabilities; the extension supplies messaging and its document-specific behavior. Composition selects the adapter.
- **R4 — Runtime distinctions.** Preserve Android startup/shutdown ownership and native integration, the extension's background/offscreen ownership split, popup-only capture and distinct document lifetimes. Keep Electron main/preload bundling and import constraints. Shared domain and cross-runtime consumption rules belong in shared core modules; shared UI workflow behavior belongs in the UI modules.
- **R4 — Authority and ordering.** Retain runtime-session authority checks, publication revisions, retired-owner protection and independent settings/history ordering. A delayed read must not overwrite an accepted newer publication. Replacing or restarting an adapter must not permit callbacks from a previous owner to feed the new owner.
- **R5 — Scripted adapter.** Implement a reusable adapter with initial observations, controlled publications, queued or deferred outcomes and an observable record of requested effects. It must support failures, uncertainty and late completions without performing real operations. Scripted observations represent external facts; the adapter must not reproduce the production reducer or decide UI transitions.
- **R6 — Shared test surface.** Mounted tests and the interactive harness use the real UI, shared reducers and effect runner. Tests trigger user interactions through the rendered UI and control only external observations and effects. Existing lower-level tests remain useful where they cover domain or adapter behavior that the UI seam cannot establish.
- **R7 — Interactive harness.** Provide a local browser entry with named scenarios and controls for resetting, publishing observations and completing pending effects. Use the existing Clipp UI and styles, with scenario controls visibly separate. Reuse scenario data and the scripted adapter between manual inspection and automated journeys; do not build a second imitation of the UI.
- **R8 — Domain invariants.** Preserve Pairing and Membership Reconciliation as separate processes, including eventual consistency of Admission. Preserve Clip event identity, Clip Sharing Lifetime, Auto Sync semantics, history-reconciliation behavior and the accepted single retained Relay Session with transport fallback. Managed relay settings continue to start empty.
- **R8 — Existing behavior.** Preserve existing navigation, focus, feedback, capability availability and error semantics. Identity-reset presentation must remain subordinate to the durable runtime operation; testing its UI does not enable a capability that is currently unavailable. No protocol, database schema or wire-format change is required.
- **Delivery scope.** Pairing may establish the initial vertical slice, but completion requires both architectural opportunities across all runtime surfaces and the remaining workflows. Exact exported names, file layout and reducer decomposition remain implementation choices; the interrupted implementation is not an approved reference design.

## Testing Decisions

- **Confirmed primary seam:** the mounted shared UI, executing production reducers and the effect runner, with a scripted adapter replacing runtime effects. The user explicitly accepted this test arrangement and the interactive harness. This existing callback/session seam should be deepened into one reusable UI-facing seam rather than supplemented with many public testing interfaces.
- **Test external behavior.** Assert visible state, enabled actions, retained input, navigation, requested external effects and resulting feedback. Avoid private reducer-state assertions, source-text checks, mocking internal collaborators, or assertions tied to helper-call sequences.
- **Keep behavior real.** Stub runtime effects and observations, not reducers, the effect runner or the behavior under test. In particular, settings authority behavior should be exercised through its real consumer with scripted external responses when that behavior is part of the scenario.
- **Control timing deterministically.** Hold and settle effects explicitly; publish observations in chosen orders; use controlled time where relevant. Await observable conditions rather than fixed sleeps. Deliberately settle old operations after task closure, Identity Rotation, disposal and adapter replacement to verify stale-result protection.
- **Required mounted journeys:** cover Pairing pending, duplicate prevention, failure, retry and waiting for approval; approval outcomes; scan cancellation and permission recovery; connection unknown/offline/direct/relayed presentation; Share Now failure/retry; Clip reuse uncertainty/acknowledgement; pin/delete/clear recovery; naming drafts; Device Revocation confirmation; relay actions; settings uncertainty and refresh; notification navigation; background-control presentation; identity-reset presentation and Identity Rotation.
- **Capabilities and lifetime:** verify unavailable capabilities do not execute effects, subscriptions are removed on disposal, pending operations do not revive a disposed UI, remounting does not duplicate work, and callbacks from a former adapter cannot update its replacement.
- **Adapter coverage:** test each production adapter through its public consumption interface with controlled bridge dependencies. Verify translation, refresh/publication ordering, startup/shutdown and capability differences. A scripted adapter that chooses not to publish stale data does not prove that a production adapter rejects stale data.
- **Prior art:** extend the existing UI session and Pairing submission tests, static rendering tests, and mounted Pairing scanner fixture. The runtime conformance harness already demonstrates substitutable network, clipboard and clock dependencies; reuse its principles while keeping the new UI tests at the higher seam.
- **Preserve useful coverage:** retain domain, transport, persistence and native tests. Replace helper-level tests only when equivalent observable behavior is demonstrated through the shared seam. Stubbed UI journeys establish UI behavior, not native permissions, actual network connectivity or Clip delivery.
- **Harness checks:** prove the scenario harness can run without credentials, real devices, external network access or system clipboard writes; verify scenario reset, controlled outcomes and representative wide/narrow layouts. Unexpected real effects must fail automated journeys rather than silently succeed.
- **Implementation acceptance:** run the repository's routine lint, type, test and runtime-build verification, plus the automated UI journeys and harness build. Record separate native/live acceptance as outside these results. These checks are requirements for a future implementation, not work authorized by the current specification-only request.

## Out of Scope

- Implementing application changes as part of the current request.
- Redesigning Clipp's visual language, navigation model or established product workflows.
- Rewriting core transport, Pairing, Membership Reconciliation, Clipboard History, or persistence as a global reducer system.
- Changing authorization, Admission, Device Revocation, Clip identity, Auto Sync policy or relay transport policy.
- Introducing new wire formats, database schemas, relay-side changes or persistent concurrent Relay Sessions.
- Building a full simulated peer network or reimplementing domain behavior inside the scripted adapter.
- Making UI tests prove real network delivery, native permission handling, background execution or platform installation.
- Adding a public scenario/debugging mode to production builds, new product capabilities, or a general-purpose state-management framework.
- Deployment, publication, release packaging or changes to external accounts.

## Further Notes

The user requested a whole-application analysis, selected both architectural opportunities, and confirmed the real-behavior/scripted-effect test arrangement and interactive browser harness. The later instruction explicitly stopped implementation and requested this specification instead.

The ready-for-agent label records that the specification is ready for future execution; it does not override the instruction to stop. No implementation should resume without a new instruction from the user.

Clipp's local Markdown issue tracker is the publication destination. The earlier implementation attempt produced partial work in isolated worktrees; it remains preserved, unintegrated and unaccepted. That work must not constrain the eventual interface or count as delivered behavior.

Accepted ADRs 0006, 0010, 0011 and 0012 continue to govern the relevant domain semantics. The refactor is intended to preserve them. The initial architecture report examined an older checkout; future implementation must re-read the current integration baseline and preserve the current UI.
