# Device Network Sync v1

Status: ready-for-agent

## Problem Statement

Clipp's current implementation demonstrates clipboard sharing across Electron, Android, and the Chrome extension, but it does not yet implement the settled v1 model for Pairing, Device Membership, reachability, Device Revocation, Clip identity, live propagation, or Clipboard History Reconciliation.

The current shared core uses legacy JSON protocols, a mutable trusted-device list, application-supplied sender fields, content-shaped Clip records, and check-then-insert history behavior. Important behavior also differs by runtime: Electron is the most complete reference, the Chrome extension owns part of its networking in an offscreen document and does not persist pins, and Android has its own adapter and storage fallbacks. These foundations cannot provide the accepted guarantees around authenticated authority, remove-wins revocation, immutable event identity, atomic duplicate suppression, restart recovery, or cross-runtime protocol parity.

The user needs one implementation-ready specification that turns the already settled Pairing and Membership, runtime capability, and Clip History designs into a coherent v1 delivery boundary. The implementation must establish shared behavior in the core first, keep platform-specific work behind runtime adapters, preserve local usefulness during network failure, and make deferred optimizations and compatibility work explicit so later tickets can be delivered as tracer bullets without reopening the design.

## Solution

Implement a shared Device Network and Clip synchronization model in which every installation durably establishes an Ed25519 Device Identity before capture or networking, represents trust through a convergent Membership View, and communicates through bounded protobuf protocols whose immediate sender is authenticated by libp2p.

Pairing directly admits its two participants through stateless signed Trust Requests and independently delivered Trust Responses. Membership Reconciliation then converges complete Admitted and Revoked Peer ID sets, with remove-wins Device Revocation and Signed Peer Records carried only as replaceable reachability information. Runtime-native notifications surface pending Trust Requests, while the shared UI supplies approval, device presentation, revocation, history, pinning, and settings interactions.

Represent every clipboard capture event as an immutable Clip with an origin-assigned UUIDv4, originating Peer ID, capture time, finite sharing expiration, and exact text or HTTP(S) URL content. Route every capture source through one shared coordinator, persist before sending, atomically suppress duplicates and locally deleted Clips, gossip new live Clips once, and repair missed delivery through bounded full-history reconciliation that never overwrites the current clipboard.

Electron, Android, and the Chrome extension must expose the same domain behavior except where this specification records an intentional platform difference. Runtime adapters own clipboard APIs, native notifications, persistence backends, bridge wiring, and platform defaults; they do not independently define Clip identity, authorization, membership merge, capture, or synchronization semantics.

### Acceptance Criteria

1. A fresh installation persists a valid Ed25519 Device Identity and singleton Membership View before clipboard capture or networking begins.
2. Identity initialization failure starts neither capture nor networking, creates no placeholder Peer ID, and exposes a persistent retryable error.
3. Pairing Target version 2 is the only accepted bootstrap format and importing it immediately initiates Pairing without granting Device Membership.
4. Pairing and Membership use their v1 Clipp protobuf protocol IDs, bounded length-prefixed frames, strict recognized-field validation, and no legacy JSON fallback.
5. Trust Requests are verified from their original signed bytes, remain target-specific and time-limited, and can be approved after the request stream or original connection has closed.
6. Each initiator Peer ID has at most one durable pending approval and one native notification; different initiators remain independent across restart, expiry, and decision.
7. Accepted Pairing directly admits both participants when each side durably commits its transition; Membership Reconciliation remains a separate retryable process.
8. Membership Views converge by union of Admitted and Revoked Peer ID sets, with revocation always winning for the same Peer ID.
9. Only an authenticated Active Member can use trusted application protocols or contribute Membership View, Clip, history, or revocation state.
10. Device Revocation is durable before side effects, propagates through full Membership Views, prevents resurrection of the revoked Peer ID, and triggers crash-recoverable Identity Rotation on the revoked installation.
11. Signed Peer Records and interim exact Rendezvous lookup improve reachability but never grant Admission or override Device Revocation.
12. All three runtimes can Pair over a Relayed Connection, reconnect an offline Active Member through Circuit Relay v2 without repeating Pairing, and continue functioning if DCUtR cannot establish a Direct Connection.
13. Every capture entry point creates Clips only through the shared capture coordinator; ordinary unchanged observations are suppressed while explicit reuse and Share Now create new events.
14. A Clip has a valid 16-byte UUIDv4, canonical origin Peer ID, precise capture and expiration timestamps, finite sharing lifetime, and exactly one valid text or URL content alternative.
15. A new Local Clip is durably stored before any live send; persistence failure retains the same immutable event in the bounded in-memory pending queue.
16. History storage atomically reports newly stored, exact duplicate, immutable conflict, or locally suppressed, and can atomically perform the first `liveHandled` transition.
17. A newly accepted live Clip is persisted before clipboard application or forwarding, is applied at most once, and is forwarded once to other connected Active Members.
18. Clipboard History Reconciliation exchanges bounded one-way snapshots of all eligible retained Clips, imports them without applying them to the clipboard, and is idempotent across reconnects.
19. Auto Sync is persisted and defaults on; disabling it stops Clip send and acceptance without stopping capture, Pairing, Membership Reconciliation, revocation, or reachability.
20. Re-enabling Auto Sync immediately reconciles with connected Active Members but does not replay retained history as live clipboard updates.
21. Local deletion, Clear History, retention cleanup, and capacity eviction cannot allow a still-shareable Clip to be restored on that device because required suppression tombstones commit atomically with removal.
22. Pinned Clips are exempt from ordinary retention cleanup; pins persist on Electron and Android, while Chrome-extension pin persistence remains unspecified.
23. Device Names, Local Device Aliases, and their display precedence and validation behave consistently across runtimes without treating presentation metadata as identity proof.
24. Electron, Android, and the Chrome extension pass the same core conformance suite and their adapter contract suites, with only the documented clipboard and pin-persistence differences.
25. Legacy identity, trust, Clip, and history data may be removed during transition; no legacy wire interoperability or migration implementation is required before the 0.0.2 phase.

## User Stories

1. As a new Clipp user, I want my device to establish a durable Device Identity before doing any work, so that every later Clip and network action has an authoritative identity.
2. As a user whose identity cannot be initialized, I want a persistent retryable error instead of a partially working network identity, so that Clipp never publishes ambiguous state.
3. As a user with no other devices, I want my installation to begin as a singleton Device Network, so that local capture and history work before Pairing.
4. As a user adding a device, I want to scan or import a Pairing Target and immediately send a request, so that Pairing has no redundant initiator confirmation.
5. As a user sharing a Pairing Target, I want it to be public bootstrap data rather than a secret credential, so that sharing it cannot itself grant access.
6. As a user scanning stale Pairing information, I want Clipp to refresh verified reachability for that exact target when possible, so that address changes do not unnecessarily prevent Pairing.
7. As a Pairing target, I want an unknown device's valid request surfaced through my platform's native notification system, so that I can notice it without keeping Clipp in the foreground.
8. As a Pairing target, I want notification selection to open an in-app approval view, so that acceptance and rejection happen with adequate identity context.
9. As a Pairing target, I want to see the initiator's Device Name and full Peer ID, so that same-named devices remain distinguishable.
10. As a Pairing target, I want repeated requests from one initiator coalesced, so that retries do not flood my notifications.
11. As a Pairing target, I want requests from different initiators handled independently, so that one decision or expiry does not affect another device.
12. As a Pairing target, I want pending valid requests and notifications restored after restart, so that I can decide without requiring the initiator to stay connected.
13. As a Pairing target, I want expired or invalid requests removed without an approval prompt, so that stale authorization cannot be accepted.
14. As a Pairing target, I want explicit rejection to clear the pending request after one response attempt, so that rejection does not create hidden retry state or a denylist.
15. As a previously admitted device retrying Pairing, I want automatic acceptance of a fresh valid request, so that a lost Trust Response can be repaired without another prompt.
16. As a Pairing initiator, I want a visible but non-persistent waiting state, so that I know a request was sent without mistaking it for Device Membership.
17. As a Pairing initiator, I want rescanning the same target to send a fresh request, so that I can explicitly retry a lost or expired attempt.
18. As a Pairing initiator, I want rejection, acceptance, expiry, or shutdown to clear waiting state, so that the interface reflects the current attempt.
19. As a member of an existing Device Network, I want Pairing with any Active Member to eventually introduce the new device to all members, so that I do not Pair every device separately.
20. As a user merging two Device Networks, I want all active Peer IDs preserved, so that the merge does not silently replace identities.
21. As an Active Member, I want full Membership Reconciliation on connection, reconnection, Admission, and Device Revocation, so that temporarily different Membership Views converge.
22. As an offline member, I want missed membership changes applied when I reconnect, so that temporary disconnection does not require manual repair.
23. As a security-conscious user, I want only authenticated Active Members to send trusted application traffic, so that payload-claimed identities cannot create authority.
24. As a user revoking a device, I want a standard confirmation followed by immediate durable local effect, so that the device stops being trusted without an ambiguous undo period.
25. As a user revoking a device, I want a storage failure to leave the target Active and show a retryable error, so that the UI never claims an uncommitted revocation.
26. As a member receiving a revocation, I want it to win over stale Admission state, so that a revoked Peer ID can never reappear through reconciliation.
27. As a revoked installation, I want to learn my status on reconnect and automatically rotate identity, so that I do not continue using an invalid Device Identity.
28. As a revoked installation recovering from a failed rotation, I want local Clipboard History and local capture available while networking stays disabled, so that recovery is safe without making the app useless.
29. As a revoked installation, I want interrupted rotation to resume with the same stored replacement keypair, so that repeated failures do not create many identities.
30. As a user after rotation, I want a clear persistent notice that history was deleted and fresh Pairing is required, so that the new singleton state is understandable.
31. As a user who lost identity key material, I want the same safe rotation and cleanup path, so that Clipp does not pretend the new identity continues the inaccessible one.
32. As a user with a valid private key but mismatched metadata, I want Clipp to repair derived identity metadata, so that harmless redundancy errors do not destroy history.
33. As a user naming my device, I want a validated Device Name with a monotonic revision, so that newer self-reported names replace older ones without clock ordering.
34. As a user renaming a remote Trusted Device, I want a local-only Local Device Alias, so that my label does not overwrite the remote device's self-reported name.
35. As a user viewing a remote device, I want labels resolved as Local Device Alias, Device Name, then shortened Peer ID, so that the most useful safe label is shown.
36. As a user, I want platform defaults of `Desktop`, `Mobile`, and `Extension`, so that initial names are useful without exposing host or account information.
37. As a user behind NAT or firewalls, I want Pairing and synchronization to work over Circuit Relay v2, so that a Direct Connection is optional.
38. As a user with multiple configured relays, I want my device to maintain reservations on each relay, so that reachability is not tied to one server.
39. As an offline Active Member returning later, I want exact discovery and verified Signed Peer Records to reconnect me without Pairing again, so that trust survives temporary unreachability.
40. As a user, I want a failed direct upgrade to leave relayed traffic working, so that optimization never breaks correctness.
41. As a user copying text or an HTTP(S) URL, I want one immutable Clip event recorded, so that the event can be synchronized and revisited.
42. As a user deliberately copying identical content again after another value, I want a new Clip, so that legitimate repeated actions remain visible.
43. As a user receiving a Remote Clip, I want polling echoes suppressed, so that Clipp does not create a new Local Clip for the same event.
44. As a user starting Clipp, I want the existing clipboard value used only as a baseline, so that startup does not manufacture a Clip.
45. As a user with an empty clipboard, I want it to update the observer baseline without creating history, so that a later return to prior content is recognized as a new event.
46. As a user copying oversized content, I want it retained locally when storage allows even if it cannot fit the network frame, so that protocol limits do not unnecessarily erase local history.
47. As a user with a Clip that cannot fit local storage, I want a content-free error and an advanced observer baseline, so that Clipp does not retry the unchanged value continuously.
48. As a user during a temporary storage failure, I want Local Clips queued with their original identity and time, so that recovery does not alter the captured events.
49. As a user copying additional values during storage failure, I want later captures attempted independently, so that one failure does not block all capture.
50. As a user receiving a new live Clip, I want it persisted before clipboard application, so that restart-safe duplicate suppression precedes side effects.
51. As a user receiving concurrent live Clips, I want them applied serially in local receive order, so that the final clipboard value is deterministic on my device.
52. As a user whose clipboard write fails, I want the Clip retained without automatic repeat writes, so that retries do not unexpectedly overwrite later clipboard work.
53. As a user with an offline device, I want full Clipboard History Reconciliation on reconnection, so that missed live delivery is repaired.
54. As a user receiving historical Clips, I want them stored without changing my current clipboard, so that background repair is non-disruptive.
55. As a user receiving a historical Clip that later arrives live, I want exactly one live application attempt and no duplicate history record, so that protocol order does not change event identity.
56. As a user, I want a finite device-level Clip Sharing Lifetime fixed at capture, so that old Clips eventually stop crossing the network.
57. As a user, I want expiration to stop sharing without deleting my retained history, so that network lifetime and local retention remain independent.
58. As a user disabling Auto Sync, I want local capture and history to continue while Clip traffic stops, so that I can work locally without leaving the Device Network.
59. As a user re-enabling Auto Sync, I want immediate history repair but no live replay of the backlog, so that recovery does not overwrite my clipboard.
60. As a user invoking Share Now, I want a new Local Clip sent once even with Auto Sync disabled, so that I can deliberately share one event without changing the preference.
61. As a user copying a historical entry, I want a new Local Clip only after the platform write succeeds, so that reuse is an explicit new capture rather than mutation of the original.
62. As a user deleting a Clip locally, I want it to remain absent on this device during its remaining sharing window, so that reconciliation does not undo my action.
63. As a user clearing history, I want durable records and required suppression tombstones changed atomically, so that failure cannot leave partially restored history behavior.
64. As a user pinning a Clip, I want it exempt from ordinary retention cleanup, so that selected history remains available locally.
65. As an Electron or Android user, I want pins to survive restart, so that my pinned view is durable on those runtimes.
66. As a user with finite history capacity, I want deterministic eviction of the oldest unpinned events, so that newer useful history has priority.
67. As a user importing history near capacity, I want the candidate evaluated atomically with retained history, so that low-ranked old data cannot displace newer records.
68. As a user, I want Clip content and private keys excluded from operational logs, so that diagnostics do not leak sensitive data.
69. As a maintainer, I want protocol limits, clocks, timeouts, retention, and capacities injectable in tests, so that edge cases are deterministic without becoming end-user settings.
70. As a maintainer, I want all runtimes to use shared domain services and protocol codecs, so that fixes do not diverge among Electron, Android, and the Chrome extension.

## Implementation Decisions

### Current-to-target boundary

- Replace the current legacy JSON Clip, trust, trusted-peers, and history envelopes with shared protobuf codecs and the negotiated protocol IDs `/clipp/pairing/1.0.0`, `/clipp/membership/1.0.0`, `/clipp/clip/1.0.0`, and `/clipp/history/1.0.0`. No legacy fallback or dual-stack behavior is required.
- Replace the mutable trusted-device repository with a durable Membership View repository containing Admitted and Revoked canonical Peer ID sets. Trust remains derived from Active membership; display metadata and reachability remain separate.
- Replace the current content-shaped Clip and separately persisted `isLocal` classification with the immutable v1 Clip model. Local or Remote is derived by comparing `originPeerId` with the current Device Identity.
- Replace history check-then-insert and unconditional overwrite behavior with a backend transaction that combines suppression lookup, immutable comparison, capacity policy, insert-if-absent, local metadata, and optional `liveHandled` transition.
- Replace runtime-owned UUID creation, direct history writes, and broadcasts with one shared capture coordinator used by polling, Android capture, extension popup input, explicit history reuse, and Share Now.
- Expand the current sync manager from direct broadcast/apply behavior into two independent shared services: live Clip gossip and full Clipboard History Reconciliation, both authorized by current Membership View state.
- Keep Electron as a useful wiring reference, but do not preserve Electron-only assumptions in shared behavior. Runtime bridges expose common operations and state while native clipboard, notification, lifecycle, and persistence APIs remain adapter concerns.

### Delivery sequence and dependency constraints

- First establish shared binary primitives: canonical Peer ID and UUID handling, precise unsigned 64-bit time validation, protobuf schemas/codecs, length-prefixed framing, configurable limits, progress timeouts, and privacy-limited rejection reasons.
- Next establish the identity-scoped transactional persistence boundary: Device Identity initialization, Membership View, pending incoming Trust Requests, peer-store durability, presentation metadata, Clip records, suppression tombstones, pins, settings, and rotation marker/candidate state.
- Implement Pairing and Membership Reconciliation on those foundations before allowing new trusted Clip traffic. Protocol authorization must read the durable/current Membership View rather than a legacy trusted list.
- Implement the capture coordinator and atomic Clipboard History store before live propagation. No network path may publish a Clip that does not yet have a committed durable identity.
- Implement live propagation before full-history repair, then add reconciliation triggers and coalescing. The live path provides the first vertical synchronization slice; history completes offline recovery without changing the live semantics.
- Wire one runtime end to end through the shared services, using Electron as the initial reference, then conform Android and the Chrome extension adapters. Shared code must not depend on Electron APIs.
- Add Device Revocation and Identity Rotation only on top of atomic membership, history, peer-store, and identity cleanup operations; networking must honor the startup and in-flight shutdown barriers from the first revocation-enabled slice.
- Add shared UI/bridge operations when their backing behavior exists. UI state must not pretend an operation succeeded before its durable transition commits.
- Later ticketing should keep each slice independently testable and buildable, with protocol/persistence foundations blocking orchestration and runtime integration rather than splitting by runtime first.

### Device Identity and presentation

- Device Identities use Ed25519 libp2p keys. The private key is authoritative; Peer ID and public-key metadata are derived and repaired from it.
- Generate and durably persist the identity before starting capture or networking. Failure exposes a persistent retryable initialization state and never falls back to a random or empty-key identity.
- The initial version stores private keys in ordinary application storage and never includes them in logs, diagnostics, exports, messages, or UI.
- Device Names are self-reported metadata bound to a Peer ID and ordered by an atomically persisted monotonic `nameRevision`; Local Device Aliases are local-only and never propagated.
- Presentation labels use NFC normalization, trimming, a single line, no control characters, and 1–64 Unicode code points. Display order is Local Device Alias, valid latest Device Name, then shortened Peer ID.
- Runtime defaults are exactly `Desktop`, `Mobile`, and `Extension`; rotation resets the new identity to its runtime default and revision zero.

### Pairing

- Pairing Target version 2 is protobuf encoded, unpadded Base64URL with the `clipp:pair:` prefix, and bounded to 16 KiB before parsing. It contains version, canonical target Peer ID bytes, the original Signed Peer Record envelope, and optionally an untrusted Device Name hint.
- A Pairing Target has no application expiry, secret, raw address list, separate public key, or membership authority. Verify its Signed Peer Record and target identity before import and require the connected authenticated Peer ID to match.
- Pairing streams carry exactly one length-prefixed protobuf frame and close. Multiple frames, trailing data, malformed prefixes, decode errors, and oversized frames invalidate only the stream; invalid messages from unknown peers also close their connection.
- A Trust Request envelope contains original `signedPayload` bytes and an Ed25519 signature over the domain-separated bytes `clipp:trust-request:v1` followed by a zero byte and that exact payload. Verify before decoding and never reserialize for signature verification.
- The signed payload binds initiator and target canonical Peer IDs, initiator Device Name and revision, and precise `issuedAt`. The local validity window defaults to 10 minutes and clock-skew allowance to two minutes; both are injectable and not user preferences.
- The target persists the original valid request envelope per initiator, coalesces newer requests from that initiator, and maintains independent expiry and notification state for each initiator. There is no initial global initiator limit.
- Acceptance and rejection occur in Clipp after revalidation. A response carries a nonzero decision, the exact original request envelope, and responder presentation metadata on a new best-effort stream.
- Target-side acceptance atomically checks remove-wins state and commits Admission before response delivery. Delivery failure does not roll back Admission or create a response retry job.
- Initiator-side acceptance atomically checks remove-wins state and commits Admission. A non-conflict persistence failure starts one in-memory capped-backoff retry loop per target using fresh signed requests; restart clears this loop.
- Missing responses are not automatically retried. Rescanning is an explicit retry. Rejections do not change existing Device Membership or prevent later valid requests.
- Active Members retrying a valid request are automatically accepted. This repairs asymmetric Pairing without another approval.
- Invalid Pairing writes structured, rate-limited `pairing_message_rejected` diagnostics with stable reasons and bounded metadata, never raw payloads, names, signatures, or key material.

### Device Membership, revocation, and rotation

- Membership Reconciliation is separate from Pairing and uses symmetric, independent, one-frame full-view pushes on every authenticated Active-Member connection or reconnection and after local membership changes.
- A Membership View carries canonical Admitted and Revoked Peer ID sets, only the immediate sender's Device Name and revision, and optional original Signed Peer Record envelopes for Active Members. It carries no network ID, original issuer, timestamp, Local Device Alias, or application signature.
- Membership frames are bounded to 256 KiB. Validate all authoritative set entries before applying anything; malformed membership rejects the complete view, while invalid reachability entries are ignored independently.
- Merge is union of each set, with revocation winning. Persist the complete merged sets atomically before publishing state or initiating side effects. Propagate only when membership state changed.
- Authorize each received view using the authenticated immediate sender's pre-merge Active status immediately before the atomic merge. Once authorized, that one in-flight merge may finish even if another concurrent view revokes its sender.
- Device Revocation is unilateral for every Active Member and has no application-level origin signature or issuer provenance. The persisted Membership View is the durable retry source.
- Local revocation commits before UI, connection, reachability, or propagation side effects. After commit, remove the target from Active presentation, close its connections, erase its peer-store reachability, and retry full-view propagation with backoff while connected and again on reconnect.
- A current member may send its complete Membership View one way to an authenticated revoked remote device, accepts no application messages from it, and then closes the connection.
- Applying the local identity's revocation creates an immediate networking shutdown barrier: finish only the triggering merge, cancel other in-flight network operations, and begin Identity Rotation.
- Rotation is crash-recoverable and reuses one durably stored candidate keypair. Its atomic commit activates a new singleton identity only after deleting the former key, Membership View, peer store, pending Pairing state, notifications, presentation metadata, and complete local Clipboard History and derived records.
- Rotation failure keeps networking disabled, preserves local history access and local capture under the old Peer ID until commit, surfaces persistent recovery state, and retries. Clips captured during recovery are deleted at commit.
- Identity Loss uses the same cleanup path but does not revoke the inaccessible old Peer ID elsewhere. Empty state is first launch; valid private key plus mismatched redundant metadata is repaired.
- Identity-independent preferences survive rotation. Post-rotation polling baselines the current clipboard before creating new Clips. Chrome-extension post-rotation capture is deferred.

### Reachability

- Signed Peer Records are verified opaque reachability envelopes governed by libp2p sequence ordering. Durable peer stores own them; Membership View storage does not duplicate addresses or envelopes.
- Retain the custom `/clipp/rendezvous/1.0.0` exact-lookup mechanism temporarily. It accepts only authenticated self-registration of a verified Signed Peer Record and uses finite server-enforced leases.
- Register and refresh only while the matching Circuit Relay v2 reservation is live. Reservation loss removes the advertised circuit address, publishes a newer record, stops refresh, and attempts unregister; lease expiry bounds failed cleanup.
- All runtimes use the same ordered default Circuit Relay v2 list, attempt reservations on every configured relay, enable Identify Push, and attempt DCUtR after a Relayed Connection. Electron alone is required to expose relay editing.
- Discovery never modifies membership. Ambient discovery dials only Active Members; an imported Pairing Target creates the sole narrow pre-Admission exact-lookup exception.

### Clip model and capture

- A Clip is immutable recognized v1 data: 16 raw UUIDv4 bytes, canonical `originPeerId` bytes, precise `capturedAt`, precise finite `shareExpiresAt`, and exactly one exact UTF-8 text or absolute HTTP(S) URL alternative.
- The origin alone normalizes and classifies. Text preserves the exact non-empty clipboard value; URL classification requires the entire untrimmed value to parse as HTTP(S), while storing the original string exactly.
- The origin assigns sharing expiry from the device preference at capture. Default is 24 hours, maximum is 30 days, and expiry must be strictly later than capture. The skew allowance defaults to two minutes.
- Generate candidate UUIDs until an atomic insert succeeds. Conflicts with another Clip or active suppression tombstone receive up to three candidates; exhaustion abandons the event and advances an ordinary observer baseline.
- The shared capture coordinator owns classification, immutable fields, atomic insertion, observer state, pending capture, and live initiation for every runtime entry point.
- Polling compares the exact current value with an in-memory baseline. Startup and empty clipboard establish baseline without a Clip. Remote writes serialize with observation and use platform read-back where available to absorb transformation without creating an echo.
- Explicit history reuse and each Share Now invocation are new Local Clip events. Reuse requires a successful platform write; Share Now overrides outbound Auto Sync for only that event and does not enable reconciliation.
- Local persistence precedes broadcast. Non-conflict persistence failures retain the same Clip in a bounded in-memory queue of 100 Clips or 10 MiB by default, with capped retries, independent later-capture progress, and visible storage error.
- Pending recovery stores all recoverable events but may live-send only the newest recovered event whose exact content remains current and whose ordinary or Share Now eligibility still applies.

### Clipboard History and local policy

- Each durable history record stores immutable Clip data plus local-only `firstStoredAt`, `liveHandled`, pin state, and optional bounded diagnostic metadata. It does not store a mutable Local/Remote flag.
- Atomic acceptance reports newly stored, exact duplicate, immutable conflict, or locally suppressed. First valid durable immutable data wins; conflicts never overwrite or create another entry.
- Local retention defaults to 30 days with a one-year maximum. Unpinned capacity defaults to 10,000 Clips or 100 MiB encoded data. Settings and limits are injectable as specified.
- `firstStoredAt` drives retention and never refreshes. Capacity evicts unpinned Clips by oldest `capturedAt`, then raw UUID bytes. New local/live events have admission priority; historical import participates atomically in capacity selection.
- Pins are local and never extend sharing expiry. Electron and Android persist them; no Chrome persistence requirement is added.
- Local deletion and Clear History do not propagate. Removing a still-acceptable Clip atomically creates a Clip Suppression Tombstone through `shareExpiresAt` plus skew allowance.
- Suppression storage defaults to 100,000 records or 16 MiB, removes expired tombstones before capacity evaluation, and never evicts unexpired tombstones. User operations fail atomically when required tombstones do not fit; automatic cleanup leaves records intact and retries.
- Clear History atomically removes durable history and creates all required tombstones before dropping the in-memory pending queue. Rotation cleanup is distinct and deletes history, pins, local metadata, tombstones, and pending captures without transferring them.

### Live propagation and history reconciliation

- Both Clip protocols use protobuf, standard unsigned-varint length prefixes, a 256 KiB production frame maximum, and a progress-based 30-second idle timeout. These values are injectable and are not user settings.
- Live streams contain exactly one required Clip and close. History request streams contain exactly one request frame; snapshot streams contain zero or more non-empty batches packed by encoded bytes and close at EOF.
- Payloads contain no immediate `from`, `to`, `sentAt`, hop count, or application signature. Authentication comes only from the live connection.
- Receive paths recheck that the immediate sender is Active immediately before durable acceptance. A committed later revocation does not invalidate already stored Clips, but cancels an uncommitted receive.
- A newly stored live Clip atomically sets `liveHandled`; a history-imported Clip begins false and may transition once if it later arrives live. Commit precedes application, notification, and first-reception forwarding.
- First live reception forwards once to other connected Active Members except the immediate sender. Application and each recipient send are independent at-most-once best-effort side effects.
- History reconciliation triggers on connection, reconnection, transition to Active membership, Auto Sync enablement, and valid History Request. It sends the complete eligible retained snapshot without applying imported records.
- Snapshot order is descending `capturedAt`, then ascending raw UUID bytes. Capture a stable ID list at start, reload and revalidate each Clip before encoding, and skip isolated read or eligibility failures.
- Permit one inbound snapshot per sender and one outbound snapshot per target. Coalesce concurrent outbound triggers into one pending follow-up only after successful EOF; failure clears it and waits for another ordinary trigger.
- Validate each history Clip independently, but terminate the stream on framing failure or local storage failure. Committed earlier records remain.
- If an inbound stream imported at least one new eligible Clip, trigger ordinary snapshots to other connected Active Members, excluding the immediate sender. Full-history waves are accepted in v1.
- Auto Sync defaults enabled and is identity-independent. When disabled, capture persists locally, inbound Clip data is ignored, outbound snapshots are canceled, and non-Clip network protocols continue.
- Re-enabling Auto Sync sends full snapshots and History Requests to connected Active Members. Retained backlog is history-only and never replayed live.
- Expired Clips remain in local history subject to retention and pins but are never sent, forwarded, or newly accepted. Each hop checks time independently.

### Runtime integration and UI

- Shared UI and runtime bridge contracts expose initialization/recovery state, current identity and presentation, Active Members, pending Pairing approvals and waiting attempts, Pairing Target generation/import, Device Revocation, Auto Sync, Clip Sharing Lifetime, local retention, history operations, pin state, relay state, and retryable errors.
- Electron uses its SQLite-backed transaction boundary, polling clipboard, native notifications, editable relay list, and persisted pins.
- Android uses its Capacitor-backed storage and clipboard/notification facilities with existing fallbacks, default relay list, and persisted pins.
- The Chrome extension keeps libp2p in the offscreen runtime, coordinates durable state with its background service worker, receives explicit popup clipboard input, uses Chrome notifications, and uses the default relay list. No persistent pin requirement or post-rotation capture decision is added.
- Native notifications never directly mutate membership. Selecting one routes to the shared in-app approval state, and expiry/decision/rotation dismisses it.
- UI errors distinguish initialization, Pairing, persistence, revocation, rotation recovery, oversized capture, and local operation failures without showing Clip content or key material.

## Testing Decisions

- The primary and highest test seam is the shared Device Network/Clip runtime orchestrator assembled with fake clock, transactional storage, authenticated transport, clipboard, notification, and lifecycle adapters. Most acceptance behavior should be proven through this one seam by observing durable state, emitted protocol frames, clipboard calls, notifications, and user-visible state rather than private methods.
- Keep focused codec/framing contract tests beneath that seam because byte preservation, signature verification, canonical Peer IDs, UUID bits, uint64 precision, unknown fields, length prefixes, stream roles, size limits, and malformed input are externally observable wire guarantees that are impractical to diagnose only through orchestration tests.
- Keep focused persistence contract tests for every backend implementation. Run the same atomic history, Membership View, pending-request, rotation, and settings scenarios against memory, SQLite, IndexedDB/Chrome storage composition, and Capacitor preference-backed adapters where transactional guarantees are provided by a composed repository layer.
- Add one shared runtime-adapter conformance suite for Electron, Android, and Chrome-extension bridges. It should verify common capability behavior and explicitly parameterize the documented clipboard strategy, relay editing, pin persistence, notification API, and post-rotation Chrome capture exception.
- Use integration tests with paired in-memory authenticated transports to exercise Pairing, network merge, remove-wins revocation, live gossip, offline history repair, Auto Sync toggling, and reconnect behavior across three logical devices. Assertions should target converged Membership Views, history, clipboard effects, and emitted protocol counts rather than internal call order unless ordering is itself specified.
- Preserve manual network harness coverage for real libp2p relay-first Pairing, Signed Peer Record exchange, reconnect, and DCUtR fallback. Manual harnesses supplement deterministic automated tests and do not replace them.
- Prior art exists in the repository's current shared-core suites for clipboard service echo behavior, history store/concurrency/sync, messaging trust filtering, network engine streams and connection paths, Pairing encode/decode, protocol message shapes, and clipboard synchronization. Reuse their fake-backend and fake-transport style while replacing legacy expectations.
- Good tests assert externally visible invariants: no authority from payload fields, no state publication before persistence, no Clip side effect before atomic acceptance, idempotence under replay/restart, remove-wins convergence, bounded resource behavior, independent failure per peer, and documented runtime parity. Avoid assertions about private maps, helper decomposition, timer implementation, or exact storage keys.
- Required failure and race coverage includes identity persistence failure; request expiry and coalescing; acceptance versus concurrent revocation; authorized in-flight merge versus later revocation; storage failure before Admission or revocation; interrupted Identity Rotation; duplicate/conflicting/suppressed Clips; live-after-history transition; Auto Sync disabled during receive; deletion before queued side effect; concurrent live Clips; snapshot trigger coalescing; malformed/oversized/stalled streams; and pending-capture overflow/recovery.
- Security regression tests must confirm private keys, Clip content, raw envelopes, signatures, and attacker-controlled Device Names do not appear in logs, and that unknown or revoked peers cannot access trusted protocols.
- Each tracer-bullet ticket must add or update tests at the highest available seam and leave all three runtimes buildable. Runtime-specific unit tests alone are insufficient for shared semantics.

## Out of Scope

- Inventory, digest, cursor, delta, missing-range, acknowledgment, debouncing, topology selection, and other full-history or propagation optimizations.
- Network-wide Clip deletion, replicated deletion tombstones, or deletion convergence across devices.
- Image and file Clip capture, storage, rendering, clipboard application, or binary transfer.
- Migration of legacy identity, trust, Membership, Clip, history, pin, or application data before the 0.0.2 protocol-version phase.
- Legacy wire-protocol negotiation, translation, fallback, or interoperability.
- Replacement or broad redesign of the interim custom peer-discovery mechanism, including topic-wide device enumeration.
- Standards-compatible Rendezvous selection or a final long-term discovery architecture.
- Platform Keychain, Android Keystore, or other secure-key storage integration.
- A short authentication string, cross-device comparison code, or stronger Pairing ceremony.
- A global bound or anti-rotation policy for distinct pending Pairing initiators.
- Persistent Pairing diagnostics, diagnostic export, or user-facing diagnostic history.
- A dedicated revoked-device audit/management list, network-wide convergence acknowledgment, or attribution of an original revoker.
- Membership View chunking, pagination, compaction, truncation, or limit negotiation beyond the fixed v1 maximum.
- Forensic erasure guarantees for deleted keys or history remnants.
- Persistent Chrome-extension pinning and post-rotation Chrome-extension capture behavior until those platform-specific behaviors are separately settled.
- Relay-configuration editing parity beyond Electron.

## Further Notes

- The existing Pairing and Membership, Clip History, and runtime-capability specifications remain the authoritative detailed requirements records. This document consolidates them into an implementation boundary and sequencing guide; it does not supersede an accepted detail by omission.
- Accepted architecture decisions define Transitive Trust, hop-authenticated unsigned revocations and Clips, Peer ID membership identity, stateless signed Trust Requests, separation of Pairing from Membership Reconciliation, forwarded Signed Peer Records, ordinary runtime key storage, origin-assigned Clip UUIDs, and live gossip with full-history reconciliation. Implementation must not silently weaken or reinterpret those decisions.
- Shared behavior belongs in the core first. Runtime code should supply capabilities and durable adapters, not duplicate authorization, merge, capture, or reconciliation decisions.
- The current protocol model has not shipped as a compatibility promise. Cleanly removing legacy state during this transition is preferable to carrying accidental semantics into v1.
- The v1 design intentionally accepts temporary Membership View asymmetry, redundant full-history waves, best-effort live delivery, and operation-specific in-memory retries. Correctness comes from durable identity, atomic state transitions, authenticated immediate senders, stable Clip IDs, remove-wins membership, and later reconciliation rather than delivery acknowledgments.
