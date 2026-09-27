# Android Background Continuity Release Gate

Android Background Continuity is experimental and best-effort. This document is an automated release gate and a template for later physical qualification, not a support claim. Ticket 03 must select and pass its final physical matrix before Clipp describes any observed configuration as qualified.

## Product boundary

- The experiment is opt-in and available on Android 12 (API 31) or later. Clipp remains installable with its existing foreground behavior below API 31.
- The foreground service keeps the existing Activity-owned WebView process more important; it cannot reconstruct that runtime and owns no Clipp network or domain state.
- The active service holds one partial CPU wake lock to mitigate screen-off suspension. It releases the lock on every stop and destruction path. This can materially increase battery use and remains an experiment rather than a continuity guarantee.
- Clipboard capture is allowed only while the Activity is resumed and its window is focused. The service never reads the clipboard.
- Android and OEM lifecycle control can interrupt the WebView and network during Doze, process pressure, task removal, Task Manager stop, force-stop, or reboot.
- Connected requires a usable authenticated Active Member connection. A running service or relay reservation is insufficient.
- Application-level notification blocking, channel blocking, or runtime permission denial degrades reconnect alerts but does not block opt-in or count as a background-runtime failure.
- Three observed heartbeat-loss failures label the configuration limited and reveal battery-management troubleshooting. Clipp never requests a battery exemption during universal onboarding.

## Privacy-safe evidence

The local diagnostic ring retains at most 512 events. Schema version 2 accepts only timestamps, reviewed lifecycle enums, durations, counts, booleans, effective notification availability, Android API/release, hardware manufacturer/model, and battery-management state. It has no generic message or payload field.

The export must not contain Clip content, raw share intents, private keys, signatures, Peer IDs, Device Names, Local Device Aliases, or protocol frames. There is no automatic telemetry or remote collection. The JSON leaves the app only when a user presses **Export privacy-safe diagnostics** and selects a destination in Android's share chooser.

## Automated release checks

Use JDK 21 before running the complete gate. Gradle Managed Virtual Devices provision and exercise the required API 31, 33, 34, 35, and 36 targets; API 32 follows the API 31-compatible path and is available through the optional connected-emulator command:

```sh
export JAVA_HOME=/path/to/jdk-21
npm run release:android
```

The gate runs the full shared Jest suite, lint, Android web production build, Capacitor asset copy, Android unit tests, the managed-device instrumentation matrix, and the native release build. `apps/android` also exposes the matrix, every required API target, and an optional already-connected API 31+ emulator path:

```sh
npm --workspace apps/android run test:native:unit
npm --workspace apps/android run test:native:instrumentation
npm --workspace apps/android run test:native:instrumentation:api31
npm --workspace apps/android run test:native:instrumentation:api33
npm --workspace apps/android run test:native:instrumentation:api34
npm --workspace apps/android run test:native:instrumentation:api35
npm --workspace apps/android run test:native:instrumentation:api36
npm --workspace apps/android run test:native:instrumentation:connected
npm --workspace apps/android run build:native:release
```

Coverage is deliberately split at the settled seams:

| Requirement | Automated evidence |
| --- | --- |
| API 31+ opt-in, service startup acknowledgement and visible-boundary retry, all notification states/actions, effective notification availability, usable Trusted Device count, heartbeat loss, focus-gated capture, Home/screen-off, task-removal and reboot policy | `tests/android/backgroundContinuity.test.ts` |
| durable selected-text/Sharesheet actions, distinct event identity, newest-only pending live application, at-most-once resume retry, Auto Sync/history/rotation cancellation | `tests/android/clipContinuity.test.ts` |
| historical reconciliation never writes the system clipboard | `tests/core/sync/historyReconciliation.test.ts` and runtime conformance tests |
| Android discovery and cold/warm ingress | `BackgroundContinuityManifestTest` on managed APIs 31, 33, 34, 35, and 36 |
| native foreground notification/actions, service-lifetime partial wake-lock acquisition/release, heartbeat expiry, task removal, reboot notification, version-appropriate notification degradation, payload-free diagnostics | `BackgroundContinuityLifecycleTest` on managed APIs 31, 33, 34, 35, and 36 |
| 512-event bound, schema allowlist, notification availability independent of the failure counter, repeated-failure qualification | `BackgroundContinuityDiagnosticsTest` on managed APIs 31, 33, 34, 35, and 36 |

Do not substitute instrumentation compilation for the managed-device matrix. Record every API result in ticket 04. Notification blocking is exercised on API 31–32-compatible paths; runtime notification-permission denial is exercised on API 33 and later. Task Manager Stop is required only where the platform exposes it, but every API must preserve the user-stop invariant.

## Physical qualification boundary

Ticket 03 deliberately leaves the final physical matrix undecided. OnePlus 7T Pro and Galaxy S25 Ultra are candidate targets only. For every device later selected, record the exact model, Android/ROM build, root state when known, Clipp build/commit, battery configuration, effective notification availability, start/end timestamps, and exported diagnostics. Record the configuration as observed rather than rejecting it before the run. Never paste Clip values or identities into the record.

Run background continuity for at least eight continuous hours. During the run exercise:

1. Foreground launch and explicit opt-in.
2. Home, application switching, screen-off, and a sustained Doze interval.
3. Network loss/restoration and relay loss/restoration.
4. Process pressure without an explicit user stop.
5. Selected-text and Sharesheet ingress while warm, disconnected, and cold.
6. Notification availability enabled and blocked through the controls exposed by that Android release.
7. Back/explicit Activity close and Recents task removal.
8. Task Manager stop where available, force-stop, reopen, and reboot.

For each transition, record only timestamp, action, observed notification/status, reconnect duration, pending counts/presence, and pass/fail. Verify the exported diagnostic schema before attaching it.

For configurations previously observed losing the WebView after screen-off, perform an A/B run with the pre-wake-lock and wake-lock builds under the same battery and network conditions. Record time to the first heartbeat expiry and battery-level change over the same duration. Treat an improvement as configuration-specific evidence, not proof that the wake lock defeats every OEM or Android lifecycle restriction.

The run passes only if:

- every successfully accepted explicit share remains represented by one durable Local Clip;
- Clipboard History Reconciliation never writes the clipboard;
- pending recovery never applies more than the newest eligible live Remote Clip and never replays a stale value;
- Connected is never visible without a usable Trusted Device connection;
- no clipboard read occurs while the Activity is unfocused;
- notification Stop, task removal, Task Manager stop, force-stop, and reboot respect their documented restart boundaries; and
- notifications, logs, and diagnostics contain none of the prohibited content or identity fields.

An immortal socket is not required. Accurate state, bounded recovery, durable explicit actions, and privacy are required. If the foreground service repeatedly fails to preserve the Activity-owned WebView on a selected device, classify that observed configuration as **limited** or **unsupported** and do not weaken the gate. Experimental API 31+ availability alone is never a qualified-support claim.

## Google Play foreground-service declaration draft

Current Android documentation identifies `remoteMessaging` for transferring text messages between devices to support continuity, requires the `remoteMessaging` manifest type and `FOREGROUND_SERVICE_REMOTE_MESSAGING` permission, and lists no runtime prerequisite. Google Play requires Android 14+ apps to declare each foreground-service type in Play Console with a feature description, deferral/interruption impact, demonstration video, and use-case selection. Play policy also requires the feature to be core and beneficial, user-initiated or perceptible, user-stoppable, time-sensitive to the expected experience, and limited to the necessary duration.

Authoritative references:

- [Android foreground-service types: remote messaging](https://developer.android.com/develop/background-work/services/fgs/service-types#remote-messaging)
- [Play Console foreground-service declaration requirements](https://support.google.com/googleplay/android-developer/answer/13392821)
- [Google Play Device and Network Abuse policy: foreground services](https://support.google.com/googleplay/android-developer/answer/16559646)

Suggested declaration:

**Functionality:** Clipp's core purpose is peer-to-peer text and URL continuity among a user's Trusted Devices. After the user explicitly enables experimental, best-effort Android Background Continuity on Android 12+, a foreground-service companion keeps Clipp's already-running, Activity-owned peer connection available while Android permits it. Android 14 and later use the declared `remoteMessaging` service type; Android 12 and 13 use the compatible legacy foreground-service start. This lets newly received live text reach Android and lets explicitly shared text remain available to the user's other devices. The service does not read the Android clipboard, create a second network client, or collect telemetry.

**User initiation and visibility:** The mode is disabled by default and starts only from a visible in-app opt-in after reliability, privacy, notification, battery, and clipboard-focus limits are explained. Android shows an ongoing, content-free status notification with Pause, Resume, Stop, and reopen actions. Stop disables the persisted opt-in before ending the service.

**Impact of deferral or interruption:** Deferral or interruption makes Trusted Devices temporarily unreachable, delays live cross-device text continuity, and can require the user to reopen Clipp. Accepted explicit shares remain durable locally for later normal delivery. The app never claims delivery or connectivity while the Activity-owned runtime is absent.

**Demonstration video:** Show first launch with the setting disabled; open the explanatory setting; opt in; show the ongoing notification and state changes with a connected Trusted Device; use Pause, Resume, and Stop; reopen and explicitly restart; show selected-text or Sharesheet ingress; then demonstrate runtime loss producing Disconnected/reconnect guidance without showing any Clip value or identity.

This draft is evidence for submission, not a guarantee of Play approval. Recheck the linked policy pages at release time.
