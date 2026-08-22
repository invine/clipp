# 01 — Deliver opt-in Android 16 background continuity

**What to build:** Give Android 16-or-later users an explicit experimental background mode that improves the lifetime of Clipp's existing Activity-owned runtime, keeps clipboard capture within Android's focus rules, and reports honest service and connection state across normal Android lifecycle transitions.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] Establish one Android background-continuity coordinator through which Activity focus, clipboard-capture eligibility, foreground-service state, WebView health, notification state, boot recovery, task removal, and notification actions can be observed and controlled.
- [ ] Add a fake-platform coordinator harness that verifies public state and side effects without asserting WebView, libp2p, timer, or Android callback implementation details.
- [ ] Preserve the Activity-owned TypeScript runtime as the sole owner of Device Identity, Device Membership, networking, Clip synchronization, and Clipboard History; the foreground service must not start a second operational runtime.
- [ ] Gate experimental background continuity to Android 16 and later while preserving the existing installation and foreground experience on earlier Android versions.
- [ ] Add a persisted Keep Clipp connected in the background setting that is disabled by default and explains the visible notification, resource use, privacy boundary, and best-effort reliability before enablement.
- [ ] Start a non-sticky `remoteMessaging` foreground service only from a user-visible opt-in flow, using the Android declarations and permissions required by the release SDK.
- [ ] Publish an ongoing notification that never includes Clip content, clipboard previews, Device Names, Peer IDs, or other identifying payloads.
- [ ] Restrict clipboard polling to the conjunction of resumed Activity lifecycle and window focus; visibility without focus must not permit clipboard reads.
- [ ] Suspend polling without converting denied or unavailable background reads into empty clipboard transitions.
- [ ] Re-establish the clipboard observer baseline when focused observation resumes without creating a Local Clip from the value already present.
- [ ] Continue the existing runtime after Home, application switching, and screen-off where Android permits it; clearly retain best-effort rather than guaranteed connection semantics.
- [ ] Emit an injectable periodic health heartbeat while the Android operational runtime is healthy and treat expiry as loss of the Activity-owned runtime.
- [ ] Report Connected only while at least one authenticated Active Member connection is usable; otherwise distinguish Waiting for devices, Reconnecting, Paused, and Disconnected states.
- [ ] Show the number of currently connected Trusted Devices in Connected state without revealing their identities.
- [ ] Map Pause and Resume notification actions to the existing Auto Sync preference without erasing Clipboard History, altering Device Membership, or stopping the service.
- [ ] Make the Stop action idempotently disable the persisted background setting and stop the service; reopening Clipp must not silently re-enable it.
- [ ] On heartbeat expiry, transition to Disconnected, post a content-free Tap to reconnect Clipp notification when permission permits, and stop the empty foreground service.
- [ ] Treat explicit Activity close and task removal from Recents as stop boundaries for this WebView-only experiment.
- [ ] Respect Android Task Manager stop and force-stop as boundaries that require the user to reopen Clipp before background synchronization can resume.
- [ ] After reboot, inspect the persisted preference and post Tap to reconnect Clipp when permitted, but do not launch the Activity or recreate an empty foreground service automatically.
- [ ] Keep background mode available when notification permission is denied while warning that ordinary reconnect alerts may not appear.
- [ ] Add deterministic coordinator coverage for focus transitions, baseline restoration, service opt-in, heartbeat expiry, every notification state and action, Home, screen-off, task removal, reboot, notification denial, and repeated late events.
- [ ] Keep shared tests, lint, and the Android build green without changing Pairing, Device Membership, relay, Direct Connection, Clip Sharing Lifetime, or Clipboard History Reconciliation behavior.
