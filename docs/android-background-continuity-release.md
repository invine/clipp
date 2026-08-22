# Android Background Continuity Release Gate

Android background continuity is experimental and best-effort. This document is a release gate, not a support claim. Do not describe Galaxy S25 Ultra background connectivity as supported until the hardware record linked from ticket 03 is complete and passes every invariant below.

## Product boundary

- The experiment is opt-in and available only on Android 16 (API 36) or later.
- The foreground service keeps the existing Activity-owned WebView process more important; it cannot reconstruct that runtime and owns no Clipp network or domain state.
- Clipboard capture is allowed only while the Activity is resumed and its window is focused. The service never reads the clipboard.
- Android and OEM lifecycle control can interrupt the WebView and network during Doze, process pressure, task removal, Task Manager stop, force-stop, or reboot.
- Connected requires a usable authenticated Active Member connection. A running service or relay reservation is insufficient.
- Notification denial degrades reconnect alerts but does not block opt-in.
- Three observed heartbeat-loss failures label the configuration limited and reveal battery-management troubleshooting. Clipp never requests a battery exemption during universal onboarding.

## Privacy-safe evidence

The local diagnostic ring retains at most 512 events. Its schema accepts only timestamps, reviewed lifecycle enums, durations, counts, booleans, Android API/release, hardware manufacturer/model, and battery-management state. It has no generic message or payload field.

The export must not contain Clip content, raw share intents, private keys, signatures, Peer IDs, Device Names, Local Device Aliases, or protocol frames. There is no automatic telemetry or remote collection. The JSON leaves the app only when a user presses **Export privacy-safe diagnostics** and selects a destination in Android's share chooser.

## Automated release checks

Use JDK 21 and attach an Android 16-or-later emulator before running the complete gate. The instrumentation stage fails before Gradle starts unless ADB reports at least one API 36-or-later emulator target:

```sh
export JAVA_HOME=/path/to/jdk-21
npm run release:android
```

The gate runs the full shared Jest suite, lint, Android web production build, Capacitor asset copy, Android unit tests, connected instrumentation tests, and the native release build. `apps/android` also exposes each native stage separately:

```sh
npm --workspace apps/android run test:native:unit
npm --workspace apps/android run test:native:instrumentation
npm --workspace apps/android run build:native:release
```

Coverage is deliberately split at the settled seams:

| Requirement | Automated evidence |
| --- | --- |
| opt-in, service startup acknowledgement, all notification states/actions, usable Trusted Device count, heartbeat loss, focus-gated capture, Home/screen-off, task-removal and reboot policy, granted/denied notification permission | `tests/android/backgroundContinuity.test.ts` |
| durable selected-text/Sharesheet actions, distinct event identity, newest-only pending live application, at-most-once resume retry, Auto Sync/history/rotation cancellation | `tests/android/clipContinuity.test.ts` |
| historical reconciliation never writes the system clipboard | `tests/core/sync/historyReconciliation.test.ts` and runtime conformance tests |
| Android discovery and cold/warm ingress | `BackgroundContinuityManifestTest` on API 36+ |
| native foreground notification/actions, heartbeat expiry, task removal, reboot notification, notification degradation, payload-free diagnostics | `BackgroundContinuityLifecycleTest` on API 36+ |
| 512-event bound, schema allowlist, repeated-failure qualification | `BackgroundContinuityDiagnosticsTest` on API 36+ |

Do not substitute instrumentation compilation for an API 36 connected test run. Record the emulator image/build and command result in the ticket.

## Galaxy S25 Ultra gate

Use a Galaxy S25 Ultra running Android 16 or later. Record the exact Android build, Clipp build/commit, battery configuration, notification permission, start/end timestamps, and exported diagnostics. Never paste Clip values or identities into the record.

Run background continuity for at least eight continuous hours. During the run exercise:

1. Foreground launch and explicit opt-in.
2. Home, application switching, screen-off, and a sustained Doze interval.
3. Network loss/restoration and relay loss/restoration.
4. Process pressure without an explicit user stop.
5. Selected-text and Sharesheet ingress while warm, disconnected, and cold.
6. Notification permission granted and denied.
7. Back/explicit Activity close and Recents task removal.
8. Task Manager stop, force-stop, reopen, and reboot.

For each transition, record only timestamp, action, observed notification/status, reconnect duration, pending counts/presence, and pass/fail. Verify the exported diagnostic schema before attaching it.

The run passes only if:

- every successfully accepted explicit share remains represented by one durable Local Clip;
- Clipboard History Reconciliation never writes the clipboard;
- pending recovery never applies more than the newest eligible live Remote Clip and never replays a stale value;
- Connected is never visible without a usable Trusted Device connection;
- no clipboard read occurs while the Activity is unfocused;
- notification Stop, task removal, Task Manager stop, force-stop, and reboot respect their documented restart boundaries; and
- notifications, logs, and diagnostics contain none of the prohibited content or identity fields.

An immortal socket is not required. Accurate state, bounded recovery, durable explicit actions, and privacy are required. If the foreground service repeatedly fails to preserve the Activity-owned WebView on the required device, classify the observed configuration as **limited** or **unsupported** and do not weaken the gate.

## Google Play foreground-service declaration draft

Current Android documentation identifies `remoteMessaging` for transferring text messages between devices to support continuity, requires the `remoteMessaging` manifest type and `FOREGROUND_SERVICE_REMOTE_MESSAGING` permission, and lists no runtime prerequisite. Google Play requires Android 14+ apps to declare each foreground-service type in Play Console with a feature description, deferral/interruption impact, demonstration video, and use-case selection. Play policy also requires the feature to be core and beneficial, user-initiated or perceptible, user-stoppable, time-sensitive to the expected experience, and limited to the necessary duration.

Authoritative references:

- [Android foreground-service types: remote messaging](https://developer.android.com/develop/background-work/services/fgs/service-types#remote-messaging)
- [Play Console foreground-service declaration requirements](https://support.google.com/googleplay/android-developer/answer/13392821)
- [Google Play Device and Network Abuse policy: foreground services](https://support.google.com/googleplay/android-developer/answer/16559646)

Suggested declaration:

**Functionality:** Clipp's core purpose is peer-to-peer text and URL continuity among a user's Trusted Devices. After the user explicitly enables Experimental best-effort background continuity on Android 16+, a `remoteMessaging` foreground service keeps Clipp's already-running, Activity-owned peer connection available while Android permits it. This lets newly received live text reach Android and lets explicitly shared text remain available to the user's other devices. The service does not read the Android clipboard, create a second network client, or collect telemetry.

**User initiation and visibility:** The mode is disabled by default and starts only from a visible in-app opt-in after reliability, privacy, notification, battery, and clipboard-focus limits are explained. Android shows an ongoing, content-free status notification with Pause, Resume, Stop, and reopen actions. Stop disables the persisted opt-in before ending the service.

**Impact of deferral or interruption:** Deferral or interruption makes Trusted Devices temporarily unreachable, delays live cross-device text continuity, and can require the user to reopen Clipp. Accepted explicit shares remain durable locally for later normal delivery. The app never claims delivery or connectivity while the Activity-owned runtime is absent.

**Demonstration video:** Show first launch with the setting disabled; open the explanatory setting; opt in; show the ongoing notification and state changes with a connected Trusted Device; use Pause, Resume, and Stop; reopen and explicitly restart; show selected-text or Sharesheet ingress; then demonstrate runtime loss producing Disconnected/reconnect guidance without showing any Clip value or identity.

This draft is evidence for submission, not a guarantee of Play approval. Recheck the linked policy pages at release time.
