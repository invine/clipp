# Runtime module interfaces and adapter conformance

Status: ready-for-agent  
Owner: client (Clipp)  
Date: 2026-11-04  
Execution: specification only

## Problem Statement

Clipp maintainers need to change cross-runtime behavior and verify the result without mounting the workspace or recreating timing-sensitive failures by hand. The three runtimes already share domain modules, but their adapters and startup code still own parts of the same rules. A test can pass against a scripted adapter even when a production adapter publishes an unstable snapshot, accepts a result from a retired workspace, or applies a preference through a second authority.

The review reproduced unstable consecutive reads from the Electron adapter, a late notification action rejection reaching a restarted Chrome adapter, and a superseded startup publishing after the shared runtime stopped. It also identified repeated Clip exchange assembly, Device Identity retirement ordering, and Pairing rejection policy. These are separate ownership problems with different observable effects.

## Solution

Define the production adapter interface independently of rendering and make shared modules own the cross-runtime behavior at their existing seams. A developer can start each real adapter in its own execution environment, drive controlled host inputs, and observe snapshots, actions, capabilities, and shutdown without mounting UI.

Use the same adapter conformance cases in Node for Electron, in Chrome for the extension, and in the Android WebView for Capacitor. Exercise durable settings, exchange, retirement, and Pairing through the production runtime interfaces that own those effects. Preserve the established Clip, Device Identity, membership, and transport policies.

## User Stories

1. As a maintainer, I want an explicit adapter interface, so that a renderer change does not silently change what every runtime must supply.
2. As a maintainer, I want observations, actions, and capabilities defined at the adapter seam, so that I can tell which host behavior a caller can rely on.
3. As a tester, I want to start and stop the Electron adapter in Node, so that I can exercise the production preload translation without mounting the workspace.
4. As a tester, I want to exercise the extension adapter in Chrome, so that popup and options can be checked under their own browser capabilities.
5. As a tester, I want to exercise the Capacitor adapter inside the Android WebView, so that conformance uses the runtime that will consume the adapter.
6. As a tester, I want to drive focus, visibility, and host responses deterministically, so that ordering cases are reproducible.
7. As a workspace user, I want stable observations between publications, so that idle reads do not trigger repeated work.
8. As a workspace consumer, I want a retained snapshot to keep the values it originally exposed, so that I can compare it reliably with the next one.
9. As a workspace consumer, I want subscribers to read the new snapshot during notification, so that publication and observation agree.
10. As a workspace user, I want unavailable capabilities to remain explicit, so that unavailable actions retain their established presentation and effects.
11. As a workspace user, I want to close a workspace while a native action is pending, so that disposal does not depend on the native action finishing.
12. As a workspace user, I want callbacks from a retired adapter generation to leave my reopened workspace alone, so that old work cannot overwrite current observations.
13. As a user managing notification permissions, I want availability to refresh while my action is pending, so that I can see new state without losing the pending indication.
14. As a user managing notification permissions, I want one current action at a time, so that repeated input does not start duplicate native operations.
15. As a user managing notification permissions, I want an action failure to survive an older successful read, so that I can see the failure and refresh deliberately.
16. As a user managing notification permissions, I want a current refresh to show a native change that completed after I closed an earlier workspace, so that the new workspace reflects the system state.
17. As a user changing Auto Sync, I want every entry point to use the same write order, so that concurrent inputs settle to one durable value.
18. As an Android user, I want notification Pause and Resume and the workspace toggle to use the same preference authority, so that Android Background Continuity and Clip exchange agree.
19. As a Chrome user, I want popup and options to converge after overlapping Auto Sync writes, so that either surface shows the confirmed value.
20. As a user changing Auto Sync, I want the action outcome and confirmed preference distinguished, so that a lost acknowledgement or publication failure does not misrepresent the saved setting.
21. As a user changing Auto Sync, I want uncertainty shown when storage cannot confirm the result, so that I know when the last confirmed policy still applies.
22. As a user sharing Clips, I want live exchange and Clipboard History Reconciliation to follow the same confirmed Auto Sync value, so that the preference governs both paths.
23. As a user with no connection, I want local capture to continue while transport is unavailable or changing, so that I can keep using Clipboard History.
24. As a user receiving Clips, I want a callback from a retired transport to leave my clipboard alone, so that a replacement connection cannot revive stale delivery.
25. As a user relying on Clipboard History Reconciliation, I want missed Clips repaired without writing them to my system clipboard, so that reconciliation preserves what I am using.
26. As a user invoking Share Now, I want an eligible pending Clip to survive a transport replacement within the same Device Identity, so that an ambiguous offer can be retried.
27. As a user receiving a retried Share Now offer, I want one retained Clip for that Clip ID, so that a lost result does not duplicate the event.
28. As a user resetting a Device Identity, I want late-starting owners retired before destructive cleanup, so that the former runtime cannot recreate identity-bound data.
29. As a user resetting a Device Identity, I want uncertain cleanup to keep admission fenced and retain the recorded reset phase, so that recovery can resume safely.
30. As a user retrying a reset during cleanup, I want to join the existing retirement attempt, so that I do not start a second teardown.
31. As a maintainer, I want stopped runtimes to stay stopped when an old startup completes, so that startup cannot revive a retired runtime or publish its state.
32. As a Trusted Device user, I want rejection during Pairing to preserve an Active Member's connection, so that unrelated Device Network traffic continues.
33. As a maintainer, I want rejection cleanup to use authenticated peer identity, a confirmed Membership View, and current transport ownership, so that stale or uncertain observations do not trigger disconnect.
34. As a maintainer, I want Pairing diagnostics and disconnect decisions to have independent ownership, so that exhausting diagnostic output does not suppress eligible cleanup.
35. As a maintainer, I want outgoing and pending Pairing paths to share rejection policy, so that the same decision holds across all three runtimes.

## Implementation Decisions

### R1 Adapter interface and snapshot publication

- Define the production adapter interface explicitly in the adapter module. The workspace consumes the interface, and each runtime maps its host observations and effects onto it. Represent capabilities explicitly and preserve the established behavior when a capability is unavailable.
- Reuse the shared publication module for stable reads and coherent publication. A snapshot keeps its reference between publications. Previously published observation values, including nested notification state, remain stable. Store the new snapshot before notifying subscribers.
- Keep focus, visibility, and native bridge inputs controllable at the host seam. Start and stop the real adapter independently of workspace rendering. Stop retires the current generation and releases its subscriptions even while an outstanding native permission or settings action is pending.
- Keep independent runtime, settings, and Clipboard History authority and ordering. A delayed observation cannot overwrite a newer authoritative publication or feed a replacement adapter generation.

### R2 Notification availability and action lifetime

- One notification availability module owns refresh ordering and action settlement for the current adapter generation. The runtime adapters supply native permission and settings operations and availability events. Notification-driven Requests navigation retains its own module.
- Admit one current permission or settings action at a time. A current passive refresh can update availability while the action owns pending state. A late action result from a retired generation has no effect on the replacement. The replacement can observe native state through a refresh it owns.
- A new action or a successful refresh started after an action failure may clear the action error. An earlier successful read may provide usable availability under normal observation ordering, while the action error remains visible.

### R3 Auto Sync authority and feedback

- Use one settings authority to order durable Auto Sync writes and resolve the confirmed value. The dedicated toggle, generic settings writes, Android Background Continuity actions, and extension surfaces reach that authority. The confirmed value drives live exchange, Clipboard History Reconciliation, and the runtime and settings observations.
- Preserve each entry point's existing feedback semantics. A lost acknowledgement can leave the original action uncertain even when durable read-back establishes the value. A publication failure after confirmed persistence is a distinct outcome. When both acknowledgement and read-back fail, report uncertainty and continue using the last confirmed runtime policy until recovery.
- Preserve local capture, Clipboard History, the one-Clip Share Now override, and Android's native Continuity acknowledgement behavior.

### R4 Clip exchange and transport replacement

- A shared core module owns Clip exchange assembly, activation, and retirement after the runtime adapter supplies ready transport. It owns one current attachment within a Device Identity. Local capture can run independently of network readiness. Preserve Android's bounded recovery of eligible live clipboard writes and the extension's background and offscreen ownership.
- Keep live gossip and Clipboard History Reconciliation as independent internal modules and protocols. Retirement prevents old transport callbacks from producing clipboard effects or completing work owned by a replacement. A still-eligible pending Share Now record may be offered again with its original Clip ID. A confirmed offer on the current transport clears the pending record. Receiving adapters rely on existing Clip ID deduplication, with no additional wire acknowledgement.
- Preserve immutable Clip IDs, Clip Sharing Lifetime, Clip Suppression Tombstones, Active Member authorization of exchange, and historical import without a system clipboard write.

### R5 Device Identity retirement

- Shared Device Identity lifecycle code owns stop, drain, and final stop. Keep native admission, offscreen document shutdown, durable storage commits, and host-specific cleanup with their adapters. The shared runtime also rejects publication and revival from a superseded startup.
- Attempt drain and final stop after a failed first stop. Gate destructive cleanup on confirmed quiescence. Keep admission fenced and preserve the accepted reset's recorded phase while cleanup is uncertain. Retry during an in-flight retirement joins that attempt. A later retry may resume after an unconfirmed attempt settles.
- Preserve Identity Rotation, Device Revocation, Identity Loss, and runtime key storage semantics. A transport replacement within one Device Identity follows R4. Identity retirement applies the existing durable cleanup rules.

### R6 Pairing rejection policy

- Put outgoing and pending rejection cleanup in the shared Pairing module. Require an authenticated peer, a confirmed current Membership View that places the peer outside the Active Member set, and current transport ownership before requesting disconnect. Handle failed membership reads and disconnect failures explicitly. A failed membership read leaves the connection in place.
- Give diagnostic throttling and disconnect policy separate ownership. Eligible disconnects continue after the diagnostic allowance is exhausted. Coalesce overlapping disconnects for the same peer and transport. Preserve existing low-level malformed-frame rejection semantics.
- Keep Pairing and Membership Reconciliation separate. Preserve stateless signed Trust Requests, existing Admission authority, and Signed Peer Record semantics.

## Testing Decisions

### R7 Production adapter conformance in each runtime

Reuse the production adapter interface as the shared test seam. Run the same conformance cases against the actual adapters in their own environments, with no workspace or React mount.

| Adapter                | Required execution environment  | Host-specific coverage                                                                                           |
| ---------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Electron               | Node.js                         | Preload translation, subscription disposal, and stable publication across reads.                                 |
| Chrome extension       | Chrome in the extension context | Popup and options capabilities, message translation, and independence of the two document lifetimes.             |
| Android with Capacitor | Android WebView                 | Capacitor client translation, focus and visibility input, notification effects, and full adapter start and stop. |

Use controlled bridge operations, event sources, and deferred results. Drive the real interface through start, stop, subscription, snapshot reads, and actions. Assert published state, outcomes, and observable effects. A portable scenario can share inputs and assertions across runners. Each runner supplies its actual environment and production adapter. A scripted UI adapter and a Node substitute for the Chrome or Android WebView runner cannot satisfy production adapter conformance.

Cover snapshot identity, nested snapshot values after publication, publication ordering, capability differences, late callbacks, duplicate action prevention, and listener cleanup. For notifications, hold an old action across stop and restart, settle it with success and failure in separate cases, and observe a current refresh. In a current generation, interleave passive reads with an action. Verify availability can advance while pending remains set, older reads cannot overwrite newer availability or erase a newer error, and a fresh successful read can clear that error.

Use the existing headless Electron and Chrome production-adapter fixtures as prior art for controlled host inputs. Android's full adapter action fixture and lower-level lifecycle coverage provide prior art for a full WebView start and stop case. Preserve the existing mounted workspace journeys and native acceptance coverage for the behavior they exercise.

### R8 Production runtime and domain verification

Use the highest existing production interface that owns each effect. Callers and tests cross the same seam. Use deterministic scheduling, storage faults, and controlled transports to verify external behavior and persistence. Native acceptance remains the evidence for actual OS permissions, clipboard operations, and live connectivity.

| Area                       | Required observable cases                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auto Sync                  | Overlap Electron's dedicated toggle and generic settings write, Android's workspace toggle and notification control, and Chrome popup and options writes. Cover a failed or ambiguous commit, confirmed read-back after a lost acknowledgement, failed publication after confirmed persistence, both directions of unresolved persistence, and subsequent recovery. Observe durable reopen, caller outcomes, both publication paths, and whether live and historical exchange run. |
| Clip exchange              | Delay transport readiness while local capture continues. Replace transport during a held send and inbound callback. Verify retired callbacks cannot write the clipboard, Auto Sync re-enable allows fresh exchange, and historical import never applies a Clip to the system clipboard. With Auto Sync off, re-offer an eligible pending Share Now Clip after ambiguous delivery, observe one retained Clip by Clip ID, and clear pending on a confirmed current offer.            |
| Device Identity retirement | Hold an admitted startup past stop, then verify that its owner closes before destructive cleanup. Cover a failed first stop with confirmed final stop, unconfirmed final cleanup, and concurrent retry. Exercise Android native acknowledgement and Chrome offscreen startup at their respective seams. Verify that a superseded shared startup cannot revive or publish a stopped runtime.                                                                                        |
| Pairing rejection          | Exercise outgoing and pending paths on all three hosts. Verify preserved Active Member connections, eligible non-Active Member disconnects, failed membership lookup, Admission while lookup is pending, retired transport, and contained disconnect failure. Exhaust diagnostic allowance and observe eligible cleanup. Verify overlapping requests to disconnect the same peer on the same transport coalesce.                                                                   |

Reuse the existing ordered settings and Auto Sync failure fixtures, in-process Clip exchange conformance, identity-bound work and Android reset lifecycle cases, and Pairing conformance as prior art. Keep protocol, storage, and native tests that cover behavior observable only through those seams.

## Out of Scope

- Clipboard History batch encoding and CPU optimization.
- A generic runtime rewrite, a global UI state container, or a redesign of Pairing Target readiness.
- Changes to Clip wire formats, Clip identity, Membership Reconciliation, Device Identity storage, or the accepted single retained Relay Session and transport fallback policy.
- Implementation, ticket dispatch, commits, push, and native or live acceptance as part of publishing this specification.

## Further Notes

- Start with R1 and its R7 conformance cases. Build R2 on the established adapter interface. R3–R6 use the runtime seams in R8.
- The architecture review used Clipp's UI behavior integration branch at commit 2957bfa30be2ce809f87be9f61393cae43a3826f. The production adapter and workspace work from that effort is a prerequisite for R1, R2, and R7. Start later work from the recorded main lineage and wait for that prerequisite to reach main before dispatching dependent work.
- Accepted ADRs 0004–0009 and 0010–0012 remain applicable. Pairing rejection cleanup after diagnostic throttling is the deliberately changed behavior recorded in R6.
