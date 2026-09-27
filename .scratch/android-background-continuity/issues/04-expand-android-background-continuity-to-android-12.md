# 04 — Expand Android Background Continuity to Android 12+

**What to build:** Make the same experimental, best-effort Android Background Continuity capability available on Android 12/API 31 and later, with version-adaptive foreground-service mechanics, honest notification availability, visible-boundary recovery, and automated evidence across the platform seams.

**Blocked by:** 02 — Complete Android Clip ingress and application recovery.

**Status:** resolved

- [x] Preserve the application-wide minimum SDK and existing foreground behavior below Android 12.
- [x] Lower the Android Background Continuity runtime and native startup gates from API 36 to API 31.
- [x] Use the legacy two-argument foreground-service start on API 31–33 and typed `remoteMessaging` startup on API 34 and later while retaining the release-SDK manifest type and permission.
- [x] Keep the Activity-owned TypeScript runtime as the sole owner of Device Identity, Device Membership, networking, Clip synchronization, and Clipboard History.
- [x] Replace permission-only state with effective notification availability: Available, Blocked, or Unknown.
- [x] Detect application-level, notification-channel, and runtime-permission blocking without counting those user settings as background-runtime failures.
- [x] Retain a persisted opt-in when service startup fails, report the service as stopped, and retry only from a later visible application start or explicit toggle.
- [x] Update settings copy to advertise experimental Android 12+ availability without implying background clipboard reads or guaranteed connectivity.
- [x] Run native lifecycle instrumentation from API 31 and condition runtime notification-permission scenarios on API 33 and later.
- [x] Add Gradle Managed Virtual Devices and per-API commands for APIs 31, 33, 34, 35, and 36 plus an aggregate release-matrix command and an optional connected-emulator command.
- [x] Update the parent spec, runtime-capability spec, automated release gate, Google Play draft, and ticket 03 qualification boundary.
- [x] Pass targeted Jest coverage, repository lint, Android web build, native unit tests, managed-device API matrix, and native release build.
- [x] Add an explicitly disclosed, service-lifetime partial CPU wake-lock mitigation for physical screen-off heartbeat loss, with native acquisition and release coverage.

## Notes

- API 32/Android 12L follows the API 31-compatible foreground-service and notification path; it is supported without becoming an additional mandatory managed-device release target.
- Ticket 03 owns physical qualification. OnePlus 7T Pro and Galaxy S25 Ultra remain candidate targets until the maintainer selects the final matrix.
- Experimental API 31+ availability is not a qualified-support claim.

## Answer

- Expanded Android Background Continuity availability to API 31+ without raising Clipp's minimum SDK or changing foreground behavior on earlier releases.
- Added version-adaptive foreground-service startup, effective notification availability, visible-boundary retry of persisted opt-in, Android 12+ UI copy, and diagnostic schema version 2.
- Added a non-reference-counted partial CPU wake lock for the active foreground-service lifetime, released on every stop/destruction path and disclosed as a battery-impacting best-effort mitigation.
- Added serial Gradle Managed Virtual Devices for APIs 31, 33, 34, 35, and 36, per-API commands, the aggregate release gate, and the optional connected-emulator path.
- Verified all 53 Jest suites and 427 tests, repository lint, Android web build and Capacitor copy, native unit tests, all five managed API targets, and the native release build with JDK 21.
