# 03 — Diagnose and qualify Android background continuity

**What to build:** Give maintainers and users privacy-safe evidence about experimental Android Background Continuity on Android 12 and later, review the automated API-range evidence from ticket 04, select the physical qualification matrix, and complete its runs before making any configuration-specific support claim.

**Blocked by:** 02 — Complete Android Clip ingress and application recovery.

**Status:** ready-for-human

- [x] Store bounded local diagnostics for service and heartbeat transitions, connection-state changes, reconnect duration, pending-action counts, pending-application presence, Android version, device model, and relevant battery-management state.
- [x] Exclude Clip content, raw share intents, private keys, signatures, Peer IDs, Device Names, Local Device Aliases, and raw protocol frames from diagnostics, exports, logs, and notification text.
- [x] Export diagnostics only through an explicit user action and introduce no automatic telemetry or remote collection.
- [x] Label background continuity as experimental and best-effort everywhere it is enabled or explained.
- [x] Explain that Android may interrupt the Activity-owned WebView and network during Doze, OEM process management, process pressure, explicit task removal, Task Manager stop, force-stop, or reboot.
- [x] Show effective notification-availability degradation guidance without blocking the feature when application, channel, or runtime permission settings prevent reconnect alerts.
- [x] Offer battery-optimization troubleshooting only after repeated observed background failures rather than as a universal onboarding request.
- [x] Mark repeatedly failing configurations limited or unsupported instead of presenting background connectivity as reliable.
- [x] Add initial Android 16 emulator coverage for service startup, notification actions, focus-gated capture, heartbeat loss, task removal, reboot recovery, selected-text and Sharesheet ingress, pending Remote Clip application, and notification permission granted and denied.
- [x] Verify that Connected is never displayed without a usable Trusted Device connection and that no background clipboard read is attempted while the Activity is unfocused.
- [x] Verify that every successfully accepted explicit share remains represented by one durable Local Clip even when immediate peer delivery is unavailable.
- [x] Verify that Clipboard History Reconciliation never changes the system clipboard and recovery never applies more than the newest eligible pending live Remote Clip.
- [x] Update runtime capability documentation to describe Android's focus-only capture, experimental background mode, lifecycle boundaries, and bounded Android-only retry of a failed live clipboard application.
- [x] Prepare the Google Play foreground-service rationale around explicit opt-in, `remoteMessaging` cross-device text continuity, the ongoing notification, the Stop action, and the user impact of interruption.
- [x] Review ticket 04's complete shared test, lint, managed-device API 31/33/34/35/36 instrumentation, and Android release-build evidence.
- [ ] Select the final physical qualification matrix. OnePlus 7T Pro and Galaxy S25 Ultra are candidates only; neither is mandatory until this decision is recorded.
- [ ] For every selected device, execute at least one eight-hour background run with lifecycle diagnostics enabled.
- [ ] On each selected device, exercise foreground launch, Home, screen-off, Doze, network loss, relay loss, process pressure, selected-text ingress, Sharesheet ingress, notification availability transitions, Back, Recents removal, Task Manager stop where available, force-stop, and reboot.
- [ ] Record the actual device model, Android/ROM build, root state when known, battery-management configuration, timestamps, observed lifecycle transitions, reconnect behavior, and any limitation without using configuration as a preliminary eligibility check or recording Clip content or identities.
- [ ] Pass a selected configuration only if accepted shares remain durable, historical reconciliation never writes the clipboard, pending live recovery never replays stale values, status remains truthful, user stops remain stopped, and diagnostics contain no prohibited content.
- [ ] If a selected configuration repeatedly destroys the Activity-owned WebView despite the foreground service, document it as limited or unsupported and do not weaken the acceptance criteria to claim success.

## Implementation notes

- Local diagnostics use a 512-event privacy-reviewed allowlist and can leave the app only through the Android share chooser opened by **Export privacy-safe diagnostics**. There is no telemetry client or automatic export path.
- Host coordinator/Clip-continuity tests and the managed-device API matrix cover the automated lifecycle, ingress, pending-application, notification, and privacy assertions. The release command and coverage map are in [`docs/android-background-continuity-release.md`](../../../docs/android-background-continuity-release.md).
- [`galaxy-s25-ultra-qualification.md`](../galaxy-s25-ultra-qualification.md) remains a candidate record, not a selected gate. The final matrix decision and real-device evidence must be reviewed before any qualified-support claim.
