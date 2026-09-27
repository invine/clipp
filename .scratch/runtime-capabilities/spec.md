# Runtime Capabilities

This specification records settled, user-visible behavior across Clipp's supported runtimes. Runtime implementation mechanisms and unresolved parity gaps are intentionally excluded.

Legacy data migration is deferred until the 0.0.2 protocol-version phase. During the current protocol-model transition, every runtime may remove its old identity and application data and start from a clean first-launch state; no migration compatibility is required yet.

## Supported runtimes

Clipp supports:

- an Electron desktop application
- a Chrome extension
- an Android application

## Clipboard capture

- On first launch, every runtime creates and durably persists its Ed25519 Device Identity before starting clipboard capture; Clipp defines no provisional pre-identity Clip representation.
- After identity initialization, clipboard capture remains independent of relay availability and networking startup or failure.
- The Electron and Android applications monitor the local clipboard for content to synchronize.
- In the Chrome extension, a user provides local clipboard content through the extension popup.
- The initial shared Clip protocols support UTF-8 text and HTTP(S) URLs across every runtime.
- Image and file Clips are deferred until a later protocol version with end-to-end capture, application, and transfer support.

### Android background continuity

- Android reads the system clipboard only while Clipp's Activity is resumed and its window is focused. Returning to that state establishes the current clipboard value as a baseline before polling resumes; it does not create a Local Clip by itself.
- On Android 12/API 31 and later, users may explicitly enable experimental, best-effort Android Background Continuity. It is disabled by default, does not raise the application's minimum SDK, and does not change foreground compatibility on earlier Android versions.
- The foreground-service companion raises the importance of the existing Capacitor process while its Activity-owned WebView remains healthy. API 31–33 use the platform-compatible legacy start call; API 34 and later use the declared `remoteMessaging` type. The service does not own Device Identity, Device Membership, libp2p networking, Clip synchronization, Clipboard History, or clipboard access and cannot reconstruct the WebView after runtime loss.
- While active, the companion holds a partial CPU wake lock as a screen-off mitigation. It releases the lock whenever the service stops or is destroyed. The lock can increase battery consumption, does not keep the screen on, and does not guarantee that Android or OEM WebView policy will preserve the Activity-owned runtime.
- Home, application switching, and screen-off do not intentionally stop the runtime, but Android may interrupt the WebView or network during Doze, OEM process management, process pressure, explicit task removal, Task Manager stop, force-stop, or reboot.
- Heartbeat loss stops the empty service and reports Disconnected. Recents removal and explicit close stop background continuity; notification Stop also disables the persisted opt-in. Task Manager stop and force-stop remain stopped until Clipp is reopened, and reboot offers an explicit reconnect notification without launching the Activity or service.
- Connected means at least one authenticated Active Member connection is currently usable. A service process or relay reservation alone is not a Trusted Device connection.
- Application-level notification blocking, notification-channel blocking, or runtime permission denial does not block opt-in, but ordinary reconnect alerts may not appear. This user-controlled state does not count as a background-runtime failure. Battery-management troubleshooting appears only after at least three observed background runtime failures, at which point the configuration is labelled limited rather than reliable.
- A foreground-service start failure retains the persisted opt-in but leaves the service truthfully stopped. Clipp retries only from a later visible application start or explicit toggle and never schedules a delayed background retry.
- Selected-text and `text/plain` Sharesheet actions are explicit Share Now events. Clipp durably queues the raw action before reporting it queued and creates one distinct Local Clip per accepted action through the normal shared Clip pipeline.
- A newly received live Remote Clip is retained before Android applies it to the system clipboard. If that write fails, Android retains only the newest eligible pending live Clip and attempts it once when the Activity next resumes; a failed retry is cleared. This Android-only retry does not apply imported Clipboard History Reconciliation Clips, and historical reconciliation never changes the system clipboard.
- Android keeps at most 512 local lifecycle diagnostic events. The allowlisted schema contains timestamps, lifecycle/service/heartbeat and connection transitions, reconnect duration, counts and booleans for pending work, Android build/model, and battery-management state. It contains no Clip content, raw share intents, keys, signatures, Peer IDs, Device Names, Local Device Aliases, or protocol frames and leaves the device only after the user selects Export privacy-safe diagnostics.

## Relay configuration

- Electron users can edit the relay addresses used by the application.
- Electron, Android, and the Chrome extension establish remote connectivity through libp2p Circuit Relay v2.
- WebRTC-star is not supported by the target runtime architecture and is removed from production defaults.
- All three runtimes ship the same ordered default Circuit Relay v2 server list.
- Each runtime attempts to maintain reservations on every configured relay rather than selecting only the first available relay.
- Each runtime refreshes Rendezvous registration only while the corresponding relay reservation is live.
- When a reservation is lost, the runtime publishes an updated Signed Peer Record without that circuit address and removes or stops refreshing the corresponding Rendezvous registration.
- Interim Rendezvous registrations are finite server-enforced leases; runtimes refresh them before expiration with jitter.
- Registration timing is injectable for deployment and tests and is not exposed as an end-user preference.
- The custom Rendezvous implementation is retained only as a temporary scope-limiting mechanism; a later research phase will select the target cross-runtime peer-discovery architecture.
- Discovery failure affects reachability only; runtimes preserve membership and revocation state and retry discovery in the background.
- Every runtime must support an authenticated Relayed Connection for initial Pairing and must be able to rediscover and reconnect an Active Member through a relay after that member returns from an offline period, without repeating Pairing.
- Further peer-discovery lifecycle and policy decisions are deferred.
- Electron, Android, and the Chrome extension enable libp2p Identify Push to propagate updated Signed Peer Records promptly to connected peers.
- All three runtimes attempt a best-effort DCUtR upgrade from a Relayed Connection to a Direct Connection where supported.
- A runtime remains fully functional over its Relayed Connection when direct upgrade is unavailable or fails.

No cross-runtime relay-configuration parity requirement has been established.

## Pairing notifications

- Electron, the Chrome extension, and Android surface a valid Trust Request from an unknown device through the runtime platform's native notification system.
- Repeated valid requests from the same Peer ID are coalesced into one pending notification.
- Requests from different Peer IDs can remain pending concurrently, with independent notifications, expirations, and decisions.
- The initial implementation imposes no global limit across distinct pending initiators; queue hardening is deferred.
- Receiving a Trust Request does not cause an unsolicited in-application pop-up.
- Selecting the notification opens Clipp's approval view.
- Acceptance and rejection occur inside Clipp rather than through native notification action buttons.
- Approval shows the initiator's Device Name and full Peer ID but requires no cross-device comparison code or short-authentication-string step.
- The runtime dismisses the notification when its newest coalesced Trust Request expires.
- Pending incoming Trust Requests survive application or runtime restarts until decision or expiry.
- On restart, each runtime restores notifications for pending requests that remain valid and deletes expired pending records.
- User acceptance cannot admit an initiator already present in the Revoked Peer ID set; the runtime sends no accepted Trust Response and uses the revoked-peer Membership View notification flow instead.
- Before delivering an accepted Trust Response, the runtime rechecks that the initiator remains Active; an intervening revocation suppresses acceptance and triggers a full Membership View notification.
- An initiator processing an accepted Trust Response atomically checks the current Revoked Peer ID set and persists Admission; a committed concurrent revocation prevents Admission.
- If Admission persistence instead fails, the runtime retries Pairing in memory with backoff and fresh signed Trust Requests; it stores no durable outgoing retry state, so restart requires user initiation.
- A missing Trust Response does not trigger automatic retry; the user must initiate Pairing again.
- These retries use capped exponential backoff without a fixed attempt limit, remain visibly failed until success, and stop on success, target revocation, or runtime shutdown.
- Retries are independent per target Peer ID; different targets may proceed concurrently, while duplicate attempts for one target coalesce into one retry loop.
- Identity Rotation deletes pending Trust Requests and notifications addressed to the former Peer ID; no runtime transfers them to the new Device Identity.

## Pairing Target

- All runtimes generate and accept Pairing Target format version 2.
- Scanning or importing a valid Pairing Target immediately starts Pairing and sends the Trust Request without another initiator-side confirmation.
- After sending, every runtime shows a non-persistent `Waiting for approval` indicator until acceptance, rejection, or request expiry; restart clears the indicator but does not prevent stateless response validation.
- The latest sent Trust Request envelope is retained only in memory per target while waiting and is never persisted.
- Any valid rejection from the authenticated target clears that target's in-memory request and waiting state, without correlating older and newer attempts.
- Rescanning the same target explicitly sends a fresh request and replaces that target's waiting deadline; different target indicators remain independent.
- All runtimes encode version 2 as protobuf bytes carried by unpadded Base64URL with the `clipp:pair:` prefix.
- All runtimes reject a Pairing Target whose decoded protobuf payload would exceed the 16 KiB production limit before parsing it; deployments and tests may override the limit.
- All runtimes reject legacy version 1 Pairing payloads and do not fall back to their raw addresses or public-key field.
- Importing a Pairing Target permits an exact interim Rendezvous lookup for its target Peer ID before Admission, allowing a verified newer Signed Peer Record to refresh stale embedded reachability without granting membership.
- All runtimes encode Trust Request and Trust Response protocol messages with the same shared protobuf schemas.
- Explicit rejection sends a `REJECTED` Trust Response without a rejection reason or user-entered explanation.
- Trust Response decision value zero is reserved as `DECISION_UNSPECIFIED`; runtimes reject missing, zero, and unknown decisions without changing membership.
- All runtimes generate and use Ed25519 Device Identities for Pairing v1.
- The initial version stores private keys in each runtime's ordinary application storage, never logs or exports them, and defers platform secure-key integration.
- Ed25519 key-generation or initial-persistence failure prevents both clipboard capture and networking, surfaces a persistent retryable initialization error, and never persists or publishes a placeholder Peer ID.
- All runtimes use `/clipp/pairing/1.0.0` and do not negotiate the legacy JSON `/clipboard/trust/1.0.0` protocol.
- All runtimes carry one length-prefixed protobuf message per Pairing stream and enforce the 16 KiB production frame limit before decoding.
- Pairing and Membership protobuf decoders ignore unknown fields for forward compatibility while strictly validating recognized fields.
- Unknown fields may add compatible metadata only; changes to signatures, identity binding, authority, merge behavior, or sequencing require new negotiated protocol IDs.
- All runtimes write privacy-limited structured `pairing_message_rejected` logs for invalid messages, using stable reason codes and duplicate rate-limiting even when no response is sent to the peer.
- Persistent diagnostic storage, export, and user-facing diagnostic history are deferred.
- All runtimes exchange full Membership Views as one length-prefixed protobuf frame per short-lived `/clipp/membership/1.0.0` stream and do not use the legacy JSON `trusted-peers` message.
- All runtimes enforce a 256 KiB production Membership View frame limit before decoding; deployments and tests may override it.
- Legitimate Membership Views exceeding that limit and any future chunking or compaction strategy are deferred.
- A runtime notifying a revoked remote device sends the same complete Membership View over `/clipp/membership/1.0.0`; a reduced revocation delta, separate protocol, and disclosure hardening are deferred.
- Initiating Device Revocation requires a standard confirmation prompt, but the prompt need not enumerate the target's automatic Identity Rotation or history-deletion consequences.
- Confirmed Device Revocation persists immediately and provides no undo or cancellation window.
- A locally initiated revocation takes effect only after durable persistence; on storage failure the target remains Active, no connection closes or revocation propagates, and the runtime presents a retryable error.
- A failed revocation propagation attempt creates no durable per-peer delivery job; the runtime retries the persisted full Membership View with backoff while connected and resends it on reconnection.
- After local persistence, the runtime immediately removes the target from its Active Member list or presents it as locally revoked, but never claims that revocation has completed on every device.
- The initial UI exposes no dedicated revoked-device list; revocation tombstones remain internal protocol state.
- A Clip received while its source was trusted remains a normal valid historical Clip after that source is revoked; runtimes add no revoked-source badge or special visual treatment.
- Before persisting an incoming Clip, a runtime rechecks that the authenticated sender is Active; a revocation committed before persistence causes the unstored Clip to be cancelled or discarded.
- Before starting libp2p, every runtime blocks networking for a stored local Peer ID that is revoked and completes a crash-recoverable Identity Rotation into a persisted singleton Membership View.
- An interrupted rotation reuses its durably stored candidate replacement keypair across retries rather than generating another Peer ID.
- If a runtime durably applies its own revocation while running, it immediately closes its connections and cancels all other in-flight network operations before rotating; only the Membership View merge that established the revocation completes.
- Learning its own valid Device Revocation starts Identity Rotation automatically without local confirmation, export, or grace period.
- If rotation persistence fails, each runtime remains usable for local Clipboard History, surfaces a persistent recovery error, and retries while keeping all networking disabled.
- Local Clip capture continues during rotation recovery under the old revoked Peer ID.
- When Identity Rotation commits, the runtime deletes the entire local Clipboard History associated with the former Device Network, including both Local Clips and Remote Clips and including Local Clips captured during recovery; it does not rewrite or transfer any of them to the new identity.
- Rotation logically deletes the revoked identity's private key from Clipp-visible active storage before activating the replacement identity.
- History and old-key deletion remove data from Clipp-visible active storage but do not guarantee forensic erasure from database remnants, write-ahead logs, platform backups, or underlying media.
- Rotation also deletes the rotating installation's stored Device Names and Local Device Aliases for the former Device Network.
- Rotation deletes the former Membership View instead of retaining a local historical copy; the replacement identity starts with only its new singleton Membership View.
- These deletions are part of the durable rotation transition; the new identity and networking remain inactive until they succeed.
- Identity-independent installation preferences, including theme, relay configuration, clipboard polling settings, and history limits, survive rotation unchanged.
- A missing or invalid private key for a previously persisted identity triggers the same automatic rotation and cleanup as self-revocation, followed by fresh Pairing; a completely empty installation is treated as first launch.
- Every runtime derives and repairs redundant Peer ID and public-key metadata from a valid Ed25519 private key; metadata mismatch alone is not Identity Loss.
- Pairing after Identity Loss does not automatically replace the former Peer ID; another current member continues to show it as Active until the user separately revokes it.
- Successful Identity Loss recovery makes a best-effort, non-blocking persistent notice explaining the reset, history deletion, and need for fresh Pairing; notice failure does not block activation.
- A valid revocation issued by any Active Member can therefore cause irreversible deletion of the revoked installation's local Clipp history.
- After rotation succeeds, a runtime should make a best-effort attempt to present a persistent, non-blocking notice until the user acknowledges it, explaining that the device was revoked, its local Clipp history was deleted, and fresh Pairing is required.
- Failure to persist or display that optional notice does not fail rotation or block activation of the new identity.
- The notice does not identify an originating revoker because forwarded Membership Views retain no issuer provenance.
- After rotation, a polling clipboard watcher treats the platform clipboard's current value as its initial baseline without creating a Clip; only a later clipboard change can produce a Clip under the new Peer ID.
- Post-rotation clipboard-capture behavior for the Chrome extension is deferred until the extension's overall capture model is reevaluated.

## Device presentation

- All runtimes distinguish a device's self-reported Device Name from a locally assigned Local Device Alias.
- Initial Device Names are exactly `Desktop` for Electron, `Mobile` for Android, and `Extension` for Chrome; runtimes do not derive them from hostnames, account names, or hardware models.
- Changing the local Device Name propagates it to connected Active Members; offline members receive it after reconnecting directly.
- A runtime accepts a remote Device Name update only from the authenticated Device Identity that the name describes and never forwards another device's name.
- Every runtime persists the local identity's monotonic `nameRevision` and orders remote Device Name updates by revision rather than wall-clock timestamp.
- After Identity Rotation, every runtime reapplies its fixed runtime default Device Name with `nameRevision` zero instead of copying the former identity's stored name.
- Renaming a Trusted Device edits only the Local Device Alias on the current runtime and never propagates that alias.
- Remote-device labels resolve in this order: Local Device Alias, latest self-reported Device Name, shortened Peer ID.
- Every runtime applies the same NFC, trimming, single-line, control-character, and 64-code-point validation to Device Names and Local Device Aliases.
- Invalid remote presentation metadata falls back to the shortened Peer ID and does not invalidate Pairing.
- Identity Rotation discards the rotating installation's presentation metadata for its former Device Network; other devices may independently retain historical labels associated with the revoked Peer ID.

## Pinned Clips

- A Pinned Clip remains pinned across application restarts in the Electron and Android applications.

No persistence requirement has been established for Pinned Clips in the Chrome extension.
