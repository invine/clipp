# 03 — Diagnose and qualify Android background continuity

**What to build:** Give maintainers and users privacy-safe evidence about the experimental Android 16 background mode, complete its automated release checks and policy documentation, and qualify the experience on a Galaxy S25 Ultra before making the initial device support claim.

**Blocked by:** 02 — Complete Android Clip ingress and application recovery.

**Status:** ready-for-human

- [ ] Store bounded local diagnostics for service and heartbeat transitions, connection-state changes, reconnect duration, pending-action counts, pending-application presence, Android version, device model, and relevant battery-management state.
- [ ] Exclude Clip content, raw share intents, private keys, signatures, Peer IDs, Device Names, Local Device Aliases, and raw protocol frames from diagnostics, exports, logs, and notification text.
- [ ] Export diagnostics only through an explicit user action and introduce no automatic telemetry or remote collection.
- [ ] Label background continuity as experimental and best-effort everywhere it is enabled or explained.
- [ ] Explain that Android may interrupt the Activity-owned WebView and network during Doze, OEM process management, process pressure, explicit task removal, Task Manager stop, force-stop, or reboot.
- [ ] Show notification-permission degradation guidance without blocking the feature when permission is denied.
- [ ] Offer battery-optimization troubleshooting only after repeated observed background failures rather than as a universal onboarding request.
- [ ] Mark repeatedly failing configurations limited or unsupported instead of presenting background connectivity as reliable.
- [ ] Add Android 16-or-later emulator coverage for service startup, notification actions, focus-gated capture, heartbeat loss, task removal, reboot recovery, selected-text and Sharesheet ingress, pending Remote Clip application, and notification permission granted and denied.
- [ ] Verify that Connected is never displayed without a usable Trusted Device connection and that no background clipboard read is attempted while the Activity is unfocused.
- [ ] Verify that every successfully accepted explicit share remains represented by one durable Local Clip even when immediate peer delivery is unavailable.
- [ ] Verify that Clipboard History Reconciliation never changes the system clipboard and recovery never applies more than the newest eligible pending live Remote Clip.
- [ ] Update runtime capability documentation to describe Android's focus-only capture, experimental Android 16 background mode, lifecycle boundaries, and bounded Android-only retry of a failed live clipboard application.
- [ ] Prepare the Google Play foreground-service rationale around explicit opt-in, `remoteMessaging` cross-device text continuity, the ongoing notification, the Stop action, and the user impact of interruption.
- [ ] Run the complete shared test suite, lint, Android unit and instrumentation tests, and Android release build successfully.
- [ ] Execute at least one eight-hour background run on a Galaxy S25 Ultra running Android 16 or later with lifecycle diagnostics enabled.
- [ ] On the required device, exercise foreground launch, Home, screen-off, Doze, network loss, relay loss, process pressure, selected-text ingress, Sharesheet ingress, notification permission granted and denied, Back, Recents removal, Task Manager stop, force-stop, and reboot.
- [ ] Record the device model, Android build, battery-management configuration, timestamps, observed lifecycle transitions, reconnect behavior, and any limitation without recording Clip content or identities.
- [ ] Pass the hardware gate only if accepted shares remain durable, historical reconciliation never writes the clipboard, pending live recovery never replays stale values, status remains truthful, user stops remain stopped, and diagnostics contain no prohibited content.
- [ ] If the Galaxy S25 Ultra repeatedly destroys the Activity-owned WebView despite the foreground service, document the configuration as limited or unsupported and do not weaken the acceptance criteria to claim success.
