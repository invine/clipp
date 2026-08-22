# Android Background Clipboard Continuity

Status: ready-for-agent

## Problem Statement

Android users want Clipp to remain useful after they leave the application: Trusted Devices should stay reachable where Android permits it, newly received Remote Clips should reach the system clipboard, and text explicitly shared from another application should enter the Device Network without requiring a manual copy-and-paste workflow.

The current Android runtime owns clipboard polling, libp2p networking, Clipboard History Reconciliation, and clipboard writes inside the Capacitor Activity's WebView. Android may retain that runtime after the Activity is backgrounded, but the WebView is not a service-owned execution environment and cannot be reconstructed by a restarted foreground service. Android also forbids an ordinary unfocused application from reading the clipboard in the background. Clipp therefore cannot honestly promise an invisible, permanently connected process or silent background clipboard capture.

The feature needs an explicit, user-visible, best-effort background mode that improves the lifetime of the existing runtime without bypassing Android privacy controls or implying stronger delivery guarantees than Clipp provides.

## Solution

Clipp will offer an opt-in experimental background-connectivity mode on Android 16 and later. Enabling it starts a `remoteMessaging` foreground service with an ongoing, privacy-safe notification. The service raises the importance of the existing Capacitor process while the Activity-owned WebView remains healthy; it does not become a second owner of Clipp networking or domain state.

Clipp will read the Android clipboard only while its Activity is resumed and its window has focus. Users can send selected text through Android's text-selection actions or send text through the Android Sharesheet. Both actions accept the text immediately without a confirmation screen, persist it until the WebView runtime can process it, and create a Share Now Local Clip through the existing shared Clip pipeline.

While the WebView runtime remains alive, live Remote Clips continue to be persisted and then written automatically to the Android clipboard. Android-controlled clipboard previews are accepted. Clipboard History Reconciliation remains non-disruptive and never writes imported historical Clips to the current clipboard.

The service reports accurate connection state, detects loss of the WebView runtime through a heartbeat, and stops rather than pretending to remain connected. Reboot, runtime loss, explicit task removal, Task Manager stop, and force-stop all have honest recovery behavior. The existing foreground Android experience remains available on earlier Android versions; only this experimental background feature is gated to Android 16 and later.

## User Stories

1. As an Android user, I want to opt into background connectivity explicitly, so that Clipp does not consume background resources without my consent.
2. As an Android user, I want background connectivity disabled by default, so that installing or updating Clipp does not silently start a persistent service.
3. As an Android user enabling background connectivity, I want a clear explanation of its notification, battery, privacy, and reliability implications, so that my consent is informed.
4. As an Android user, I want an ongoing notification while Clipp's foreground service is active, so that Android and I can see that background work is occurring.
5. As a privacy-conscious user, I want the ongoing notification to show status and device counts without Clip content, so that clipboard values are not exposed on the lock screen.
6. As an Android user, I want the notification to distinguish Connected, Waiting for devices, Reconnecting, Paused, and Disconnected states, so that service existence is never confused with a working peer connection.
7. As an Android user, I want Connected status to report the number of currently connected Trusted Devices, so that the status is concrete rather than decorative.
8. As an Android user, I want to pause and resume Auto Sync from the notification, so that I can temporarily stop Clip exchange without disabling background mode.
9. As an Android user, I want the notification's Stop action to disable background connectivity until I explicitly enable it again, so that a user stop remains stopped.
10. As an Android user, I want foreground Clipp behavior to remain available after stopping background mode, so that stopping the service does not disable the application.
11. As an Android user, I want Clipp to attempt to maintain its existing peer connections after I press Home or turn off the screen, so that Remote Clips can continue arriving where Android permits it.
12. As an Android user, I want Clipp to reconnect with its existing backoff and history-repair behavior after temporary network or relay loss, so that transient failures do not require Pairing again.
13. As an Android user, I want the feature labeled experimental and best-effort, so that it does not promise an immortal socket across Doze, OEM restrictions, process death, or explicit user stops.
14. As an Android user, I want Clipp to detect when its Activity-owned WebView runtime has disappeared, so that the foreground-service notification never falsely claims connectivity.
15. As an Android user, I want runtime loss to produce a Tap to reconnect Clipp notification when notification permission allows it, so that recovery is simple and explicit.
16. As an Android user, I want the empty shell foreground service to stop after runtime loss, so that it does not consume resources without providing Clipp behavior.
17. As an Android user, I want removing Clipp from Recents or explicitly closing it to stop experimental background connectivity, so that normal task-closing gestures remain meaningful.
18. As an Android user, I want Task Manager stop or force-stop to suspend background synchronization until I reopen Clipp, so that Clipp respects Android's explicit stop boundary.
19. As an Android user, I want reboot recovery to show Tap to reconnect Clipp rather than launch an Activity unexpectedly, so that Clipp does not foreground itself without an immediate user action.
20. As an Android user, I want Clipp to avoid sticky service recreation when the WebView cannot be reconstructed, so that Android does not create a misleading empty service.
21. As an Android user who denied notification permission, I want background mode to remain available with a warning that reconnect alerts cannot appear normally, so that I understand the degraded recovery experience.
22. As an Android user, I want Clipp to offer battery-optimization troubleshooting only after repeated background failures, so that ordinary setup does not begin with an intrusive exemption request.
23. As an Android user, I want Clipp to read the system clipboard only while its Activity is resumed and its window is focused, so that it obeys Android's clipboard privacy model.
24. As an Android user, I want background mode never to claim that its foreground service enables background clipboard reads, so that product language matches platform behavior.
25. As an Android user opening Clipp, I want the current clipboard value to establish the polling baseline without creating a Local Clip, so that startup does not manufacture an event.
26. As an Android user selecting text in another application, I want a Send with Clipp action in compatible Android text-selection menus, so that I can share text without first copying it.
27. As an Android user sharing text from another application, I want Clipp available as a `text/plain` Sharesheet destination, so that standard Android sharing works.
28. As an Android user invoking either sharing action, I want Clipp to accept the text immediately without a confirmation screen, so that the explicit system action is sufficient intent.
29. As an Android user sharing text while Clipp is disconnected or cold, I want the action persisted before Clipp reports it as queued, so that process startup does not lose my explicit action.
30. As an Android user, I want a brief content-free confirmation that text was accepted or queued, so that I receive feedback without exposing the Clip value.
31. As an Android user, I want a persistence failure to report that sharing failed rather than falsely claim the text was queued, so that acceptance is trustworthy.
32. As an Android user, I want each explicit selection or Share action to create a distinct Local Clip even when the text is identical to an earlier Clip, so that Clip identity continues to represent user events.
33. As an Android user, I want selected or shared text to use Share Now semantics, so that my explicit action can send one Local Clip even while Auto Sync is disabled.
34. As an Android user, I want accepted disconnected shares retained according to the existing Clip Sharing Lifetime and Clipboard History policies, so that Android does not invent a separate retention model.
35. As an Android user, I want accepted disconnected shares offered through the existing live and Clipboard History Reconciliation paths after reconnection, so that recovery uses Clipp's established protocol behavior.
36. As an Android user, I want every captured or explicitly shared supported text value handled by the ordinary Clip rules without secret-content filtering, so that Clipp does not silently omit values I asked it to synchronize.
37. As an Android user, I want automatic sharing to use the same Trusted Device scope as the other runtimes, so that Android does not create a separate recipient model.
38. As an Android user receiving a new live Remote Clip while the WebView runtime is healthy, I want it persisted before Clipp writes it to the system clipboard, so that duplicate suppression precedes the side effect.
39. As an Android user receiving a live Remote Clip in the background, I want it written automatically without a Clipp confirmation prompt, so that background receipt remains useful.
40. As an Android user, I accept Android's system-controlled clipboard preview after Clipp writes a Remote Clip, so that Clipp does not rely on unsupported silent-write behavior.
41. As an Android user reconnecting after clipboard application was unavailable, I want all eligible Clips retained in Clipboard History but only the newest pending live Remote Clip applied, so that old values do not replay across my clipboard.
42. As an Android user receiving imported historical Clips through Clipboard History Reconciliation, I want them stored without changing my system clipboard, so that repair remains non-disruptive.
43. As an Android user whose live Remote Clip write fails, I want Clipp to remember at most the newest eligible pending live Clip and retry it once when the Activity resumes, so that one transient write failure can recover without repeated stale overwrites.
44. As an Android user, I want a newer eligible live Remote Clip to replace an older pending clipboard application, so that recovery never walks through a stale queue of clipboard values.
45. As an Android user, I want a failed retry cleared rather than attempted indefinitely, so that Clipp cannot repeatedly overwrite later clipboard work.
46. As an Android user, I want Clipboard History retention, capacity, pinning, and Clip Suppression Tombstone behavior to remain the same as the other runtimes, so that experimental background mode does not fork the Clip model.
47. As an Android user, I want Pairing, Device Membership, Device Revocation, and authenticated Active Member checks to remain unchanged, so that background mode does not weaken trust.
48. As a privacy-conscious user, I want diagnostics to exclude Clip content, private keys, Device Names, and other sensitive payloads, so that reliability investigation does not become clipboard collection.
49. As an Android user, I want lifecycle diagnostics stored locally and exported only through an explicit user action, so that I control whether they leave my device.
50. As a maintainer, I want lifecycle diagnostics to include service transitions, WebView heartbeat loss, connection transitions, reconnect latency, pending counts, Android version, device model, and battery configuration, so that experimental reliability can be evaluated without content.
51. As an Android 16-or-later user, I want the experimental feature enabled only on the platform range for which it is being developed and tested, so that its support statement is precise.
52. As a user on an earlier Android version, I want Clipp's existing foreground experience to remain installable and usable, so that the new feature does not unnecessarily raise the whole application's minimum version.
53. As a Galaxy S25 Ultra user, I want the primary acceptance testing performed on that device running Android 16 or later, so that the initial support claim is grounded in the target hardware.
54. As a user on an unvalidated OEM configuration, I want repeated WebView termination described as limited or unsupported rather than hidden behind a guarantee, so that troubleshooting guidance remains honest.
55. As a maintainer, I want background-continuity behavior observable through one high-level coordination seam, so that lifecycle correctness can be tested without asserting WebView, libp2p, or notification implementation details.

## Implementation Decisions

### Runtime and service boundary

- Add one Android background-continuity coordinator as the sole orchestration seam for Activity focus, WebView health, foreground-service state, notification state, boot recovery, task removal, explicit notification actions, share ingress, and pending clipboard application.
- Keep the existing Activity-owned TypeScript runtime as the sole owner of Device Identity, Device Membership, libp2p networking, Clip synchronization, and Clipboard History. The foreground service must not create a second client, network node, or state writer.
- Implement the service as an Android foreground service of type `remoteMessaging`, with the corresponding foreground-service declarations and permissions required by the compile/target SDK used for release.
- Gate the experimental feature at runtime to Android 16 and later. Preserve the application's existing installation and foreground behavior on earlier Android versions.
- Start the service only from a user-visible flow after the persisted Keep Clipp connected in the background preference is explicitly enabled.
- Use non-sticky service restart behavior. A service process restart must not imply that the Activity, WebView, Capacitor bridge, or Android client has been recreated.
- Do not add FCM, a backend wake-up path, a hidden service-owned WebView, an embedded JavaScript engine, or native libp2p networking in this phase.

### Lifecycle and health

- The Android client emits a periodic health heartbeat through the coordinator while its operational runtime is started. Heartbeat timing and expiry are injectable for deterministic tests.
- The foreground service treats an expired heartbeat as runtime loss, changes state to Disconnected, attempts a content-free reconnect notification when permission permits, and stops itself.
- Pressing Home, switching applications, or turning off the screen does not intentionally stop the Android client or foreground service. The connection nevertheless remains best-effort under Android and OEM lifecycle controls.
- Explicit Activity close, task removal from Recents, the notification Stop action, Task Manager stop, and force-stop are user-stop boundaries. Clipp must not silently restart background continuity after them.
- The Stop action disables the persisted background-continuity preference before stopping the service. Opening Clipp later does not restart it until the user enables the preference again.
- Pause maps to the existing Auto Sync preference and leaves the service available; Resume restores Auto Sync. Pausing does not erase Clipboard History or alter Device Membership.
- A reboot receiver may inspect the persisted background preference and post Tap to reconnect Clipp, but it must not launch the Activity or start an empty shell service automatically.
- If notification permission is denied, settings explain that the foreground-service record remains governed by Android but ordinary reconnect alerts may not appear. This degraded state does not prevent the user from enabling the experiment.
- Battery-optimization exemption guidance is contextual troubleshooting after repeated observed failures, not a universal onboarding request.

### Notification model

- The ongoing notification contains no Clip content, clipboard preview, Device Name, Peer ID, or other identifying payload.
- Notification states are Connected with current Trusted Device count, Waiting for devices, Reconnecting, Paused, and Disconnected with a tap-to-reopen action.
- Connected means at least one authenticated Active Member connection is currently usable. A live foreground service or relay reservation alone is insufficient.
- Waiting means the runtime is healthy but has no usable Trusted Device connection. Reconnecting means the runtime is healthy and retrying after a previously usable connection failed.
- Notification actions are idempotent and tolerate late delivery after the underlying lifecycle state has already changed.

### Clipboard capture and explicit Android sharing

- Gate polling on both resumed Activity lifecycle and window focus. Visibility without focus is insufficient. Leaving the eligible state stops or suspends polling without interpreting a failed background read as an empty clipboard transition.
- Returning to the eligible state establishes or refreshes the clipboard observer baseline according to the existing polling rules; it must not manufacture a Local Clip from the value already present when observation resumes.
- The foreground service does not read the clipboard and does not grant the WebView permission to read it while unfocused.
- Register dedicated exported Android Activity ingress for `ACTION_PROCESS_TEXT` and `ACTION_SEND` with `text/plain` payloads. These components validate the intent shape and never read the system clipboard as a substitute for the supplied text.
- Both ingress paths are immediate Share Now actions. They do not show a confirmation or recipient screen.
- Persist the supplied raw text as a pending explicit action before reporting acceptance. A pending action is not a provisional Clip and receives no Clip ID until the initialized Device Identity processes it through the shared capture pipeline.
- The ingress queue must work for cold start and warm `singleTask` delivery. When the WebView client is absent, the user-initiated flow may bring Clipp forward so the queue can drain; it must not claim that the shell service alone can process the action.
- Drain each accepted user action exactly once through the shared local-text processing entry point with Share Now enabled. Do not implement sharing by rereading the clipboard.
- Mark a pending action complete only after the shared capture pipeline durably accepts its Local Clip. Storage failure remains visible and retryable without duplicating a completed action.
- Repeated explicit actions containing identical text remain distinct capture events with distinct Clip IDs.
- Use existing text normalization, supported-content, frame-bound, Clip Sharing Lifetime, Clipboard History, Auto Sync override, and Active Member distribution rules. Do not add Android-only secret detection, recipient lists, or retention controls.
- A queued Share Now action is guaranteed to be durably accepted locally when Clipp reports success, not to have been acknowledged by every Trusted Device. Subsequent delivery remains the existing best-effort live-gossip and Clipboard History Reconciliation behavior.

### Remote Clip application

- Preserve the accepted ordering: authenticate the immediate sender, verify current Active membership, validate the Clip, durably accept it, and only then attempt the clipboard side effect.
- New live Remote Clips may write the Android clipboard while the Activity is backgrounded if the existing WebView runtime and Capacitor bridge remain healthy. Clipp does not suppress Android's system clipboard preview.
- Clipboard History Reconciliation never creates a pending clipboard application and never writes an imported historical Clip.
- When clipboard application is temporarily unavailable, retain at most one durable Android pending-application marker keyed by Clip ID. A newer eligible live Remote Clip replaces the previous marker.
- A pending Clip is eligible for one resume-time retry only if it is still retained, was learned through the live path, has not been locally suppressed, and Auto Sync remains enabled. The retry is not a new Clip and does not change its Clip ID.
- Clear the marker after a successful retry, an ineligible result, local deletion, history clearing, Identity Rotation, or one failed retry. Do not retry indefinitely.
- Runtime loss does not convert reconciled Clipboard History into live application work. If only historical repair occurs after reconnect, the current system clipboard remains unchanged.

### Diagnostics and support classification

- Store lifecycle diagnostics locally with bounded retention. Record timestamps, service and heartbeat transitions, connection-state transitions, reconnect duration, pending-action counts, pending-application presence, Android version, device model, and relevant battery-management state.
- Exclude Clip content, raw share intents, private keys, signatures, Peer IDs, Device Names, Local Device Aliases, and raw protocol frames from diagnostic records and notification text.
- Export diagnostics only through an explicit user action. No automatic telemetry or remote collection is introduced.
- Label the setting and support copy as experimental and best-effort. Document that Android may interrupt networking during Doze or process pressure and that explicit user stop requires reopening Clipp.
- Treat Galaxy S25 Ultra on Android 16 or later as the required hardware acceptance target. Results from Pixel, Xiaomi, OnePlus, and other Samsung devices are useful but optional for the first release.
- If the required device repeatedly destroys the Activity-owned WebView despite the service, mark the configuration limited or unsupported and retain the diagnostics rather than weakening the stated acceptance criteria.

## Testing Decisions

- Prefer one high-level Android background-continuity coordinator seam. Tests drive public lifecycle and user events into the coordinator and observe service commands, capture eligibility, notification state, queued explicit actions, clipboard-application decisions, and durable preference changes.
- Coordinator tests use fake platform ports, a fake clock, and an observable fake Android client. They assert externally visible state and side effects rather than service callbacks, WebView internals, timer implementation, or libp2p method calls.
- Reuse the existing runtime conformance harness for Auto Sync, Share Now, notification selection, runtime start/stop, and public-state behavior. Extend it only where the new Android behavior is a runtime contract rather than an Android OS detail.
- Reuse the existing explicit-action conformance tests to prove that selected text and Sharesheet text create distinct Local Clips, preserve event identity, persist before sending, and override disabled Auto Sync for one Clip.
- Reuse the existing Clipboard Sync and Clipboard History Reconciliation tests to prove that live Remote Clips persist before clipboard application and historical imports never write the clipboard.
- Add Android-specific coordinator tests for resumed-plus-focused polling eligibility, loss and restoration of focus, Home/screen-off behavior, heartbeat expiry, non-sticky runtime loss, Stop persistence, Pause/Resume mapping, task removal, reboot notification intent, and notification-permission degradation.
- Add Android-specific queue tests for cold and warm ingress, process restart before drain, identical repeated actions, persistence failure, exactly-once drain after partial failure, and no clipboard reread.
- Add Android-specific pending-application tests for successful background writes, Android write failure, replacement by a newer live Remote Clip, one resume-time retry, second failure clearing, Auto Sync cancellation, local deletion, history clearing, Identity Rotation, and rejection of historical reconciliation as a write source.
- Keep native Android instrumentation tests thin. Verify that Android can discover the text-selection and Sharesheet Activities, that cold and warm intents reach the ingress queue, that the foreground service publishes its required notification and actions, and that boot/task-removal boundaries produce the specified externally visible behavior.
- Verify the complete Android build plus repository lint and shared test suites after changes. Native tests must run on an Android 16-or-later emulator where hardware is not required.
- The hardware release gate is a Galaxy S25 Ultra running Android 16 or later. Exercise foreground launch, Home, screen-off, Doze, network loss, relay loss, process pressure, selected-text ingress, Sharesheet ingress, notification permission granted and denied, Back, Recents removal, Task Manager stop, force-stop, and reboot.
- Run at least one eight-hour background session on the required device with lifecycle diagnostics enabled. A passing run preserves every explicitly accepted share locally, never applies an imported historical Clip to the clipboard, never replays more than the newest eligible pending live Clip, and never reports Connected without a usable Trusted Device connection.
- Because this is experimental best-effort behavior, the test gate does not require an immortal socket. It does require accurate state transitions, bounded recovery, no false delivery claims, no unauthorized background reads, and no content leakage in logs or notifications.

## Out of Scope

- A native service-owned implementation of libp2p, Device Identity, Device Membership, Clipboard History, or Clip synchronization.
- Guaranteed continuous connectivity across Doze, OEM process management, reboot, Task Manager stop, force-stop, or Activity/WebView destruction.
- A durable per-Trusted-Device outbox, application-level delivery acknowledgements, or a guarantee that every accepted Clip reaches every device.
- FCM, push wakeups, a central delivery backend, or any non-P2P delivery channel.
- A hidden service-owned WebView, embedded Node.js or JavaScript runtime, Kotlin/JVM libp2p port, or Go/Rust JNI networking stack.
- Background clipboard reads, default-keyboard/IME behavior, Accessibility Service workarounds, device-owner privileges, root-only behavior, or private/system APIs.
- Hiding the Android foreground-service notification or suppressing Android's clipboard preview UI.
- Android-only content filters for passwords, OTPs, payment data, private keys, or other sensitive values.
- Android-only retention, pinning, recipient, Device Membership, Pairing, or Device Revocation semantics.
- Changing Clipp's relay list, discovery model, Direct Connection behavior, protocol IDs, Clip codecs, Clip Sharing Lifetime, or Clipboard History Reconciliation protocol.
- Shipping or validating the experimental background feature on Android 15 or earlier. Existing foreground application compatibility remains unchanged.
- Treating non-S25-Ultra OEM hardware as a required first-release gate.
- Automatic remote telemetry collection or inclusion of Clip content in diagnostics.
- Creating implementation tickets. This specification is intended to be translated into separately scoped tickets later.

## Further Notes

- This design deliberately accepts Android's platform boundary: a foreground service can raise process importance and support background networking and clipboard writes, but it does not grant background clipboard-read access and does not make an Activity-owned WebView a durable service runtime.
- `remoteMessaging` is the closest foreground-service type because Clipp transfers text and URLs among a person's devices for cross-device continuity. Release work must use the current Android and Google Play declaration requirements at implementation time.
- ADR-0009 remains authoritative: background delivery accepts authority only from the authenticated immediate sender while that sender is an Active Member. Notification or intent payloads do not create network authority.
- ADR-0010 remains authoritative: each explicit selection or Sharesheet action is a distinct capture event, while transport retry and pending-action recovery preserve the event rather than deduplicating by content.
- ADR-0011 remains authoritative: Clipboard History Reconciliation repairs retained history without applying imported records to the current clipboard. The newest-pending rule applies only to Clips learned through the live path.
- The bounded Android resume-time retry intentionally refines the existing cross-runtime decision that a failed clipboard write receives no automatic retry. It is limited to one still-eligible live Remote Clip and must be reflected in runtime capability documentation when implemented.
- The current runtime has no native foreground service, boot receiver, share-intent receiver, lifecycle coordinator, or service-owned client. Its polling and networking live in the Activity WebView, so the implementation should preserve the spec's experimental labeling until hardware evidence says otherwise.
- Google Play submission materials should explain the explicit opt-in toggle, the ongoing status notification, the Stop action, the user impact of interruption, and why cross-device text continuity is core and non-deferrable while enabled.
