# Android managed relay native acceptance

Native fixtures run only in the opt-in `acceptance` build type, with application
ID `com.clipp.app.acceptance` and test package `com.clipp.app.acceptance.test`.
Every fixture suite that changes application storage checks that exact target
before touching it. Normal `debug` and `release` builds keep `com.clipp.app`.
Never install a fixture test APK against the operator installation, clear its
data, delete its key, or extract its credentials.

The acceptance manifest registers `clipp-relay-acceptance://oauth/callback` so
it cannot intercept the operator app's registered `clipp-relay://oauth/callback`.
The production OAuth client still uses the registered production callback; this
isolated build is for native storage/lifecycle tests, not browser login acceptance.

## Build and run

Use the [frozen Android candidate and selected-device procedure](android-background-continuity-release.md#automated-release-checks). It builds the isolated app/test APK pair with JDK 21 and the installed SDK, freezes their hashes and committed source identity, then verifies both installed packages on the selected owned emulator before any product fixture. The maintained focused and matrix aliases use that same serial for boot/WebView/focus/input checks and actual instrumentation; they do not rebuild or select another Gradle guest after readiness.

The focused command observes the durable explicit-text queue/repeated-event case. The finite matrix adds the credential, lifecycle, manifest and diagnostic cases listed below. Both use the shared durable effort/history policy across aliases and output locations; a focused pass remains a limited observation. Fixture compilation and injected driver tests remain separate from actual native results.

Normal `com.clipp.app` storage, credentials, settings and pre-existing phones remain outside this procedure's ownership. The runner cleans only its temporary files and force-stops `com.clipp.app.acceptance`; the operator owns later removal of the two acceptance packages and shutdown of the fresh guest. Preserve every failed receipt when changing hypotheses, candidates or coverage.

For an actual process boundary, run these phases separately. Each method checks
the isolated package before its fixture; each phase contains only a synthetic
credential. Do not substitute the operator package in the force-stop command.

```sh
adb -s "$CLIPP_TEST_SERIAL" shell am instrument -w \
  -e class com.clipp.app.ManagedRelayCredentialReopenTest#prepareCredentialBeforeProcessDeath \
  -e credentialReopenPhase prepare \
  com.clipp.app.acceptance.test/androidx.test.runner.AndroidJUnitRunner
adb -s "$CLIPP_TEST_SERIAL" shell am force-stop com.clipp.app.acceptance
adb -s "$CLIPP_TEST_SERIAL" shell am instrument -w \
  -e class com.clipp.app.ManagedRelayCredentialReopenTest#reopenAfterProcessDeathRetainsAndErasesCredential \
  -e credentialReopenPhase reopen \
  com.clipp.app.acceptance.test/androidx.test.runner.AndroidJUnitRunner
```

## Evidence and limits

The credential tests observe the native store boundary: authenticated AES-GCM
ciphertext, endpoint binding, missing key/corruption erasure, non-exportability
of the real Android Keystore key, and persistence across separate instrumentation
processes. Backup tests check the packaged rules' separate cloud-backup and
device-transfer exclusions. They do not execute Google backup or an OEM device
transfer. Callback resolution tests check the isolated manifest; JavaScript
bridge tests cover state, exact redirect, duplicate/late callbacks, refresh
single-flight, rotated-save failure and stale-response ordering.

Service lifecycle instrumentation tests exercise the native service boundaries.
They do not establish libp2p host recovery, retained Device Identity, fresh live
relay discovery or forced WSS/WebRTC Direct transfers after process death.
Those require the normal app, an approved relay and user browser authorization.

### 2026-10-05 run

Host macOS 26.4.1 arm64; Node 26.10.0, npm 11.19.1, Vite 6.4.1, Capacitor 7.0.2,
Gradle 8.11.1, Android Gradle Plugin 8.9.2, Homebrew OpenJDK 21.0.12.1.
Android compile/target API 36, build tools 35.0.0. Authorized OnePlus GM1917
(Android 12/API 31); Chrome installed version 154.0.8037.126 (browser flow not
run in this native slice).

- Passed: Android web build, Capacitor sync, focused Android Jest 12/12,
  Android typecheck, native acceptance app/test compilation, and native unit
  template 1/1 (the template is not managed-relay behavior evidence).
- Passed on phone: 27/27 selected native tests: credential store 7,
  background lifecycle 8, manifest/explicit ingress 8, diagnostics 4. After the
  final teardown guard change, full native discovery reported `OK (30 tests)`:
  28 executed (the 27 plus the context template), and two phase-only methods
  skipped by their argument assumptions. Those two methods passed separately
  with their explicit prepare/reopen arguments, as recorded below.
- TDD safety evidence: guard-only test failed on phone before guard enforcement;
  the enforced guard then passed, refusing normal and unrelated package names.
- Passed: separate native prepare/reopen phases, 1/1 each, with acceptance-only
  force-stop between. This proves Keystore ciphertext recovery in a fresh process;
  it does not prove networking or Device Identity recovery.
- Passed: normal debug APK retains `com.clipp.app` and the exact production
  callback; manifest has both backup-policy resource references. Lint passed.
- Initial repository check: all runtime typechecks passed; Jest had one stale
  Android release-task expectation and four Electron loopback-listener tests
  blocked by sandbox `EPERM`. The Android task expectation was updated to the
  isolated variant; the permitted final check passed all runtime typechecks and
  72 suites/593 Jest tests.
- Initial offline release build: missing cached existing Gradle artifacts;
  the retry with dependency download allowed passed. Normal release APK retained
  `com.clipp.app` and `clipp-relay://oauth/callback`. Managed-device acceptance task
  registration was checked with Gradle `help`; the API matrix was not executed.
- Not run: actual Google login in Custom Tab, normal app callback/exchange,
  relayed clip transfer, forced WSS and WebRTC Direct independently, live relay
  process-death/reopen, actual Google/OEM backup transfer, API 33–36 matrix.

No operator app credential or Device Identity was read or exported; no operator
app uninstall, data clear, key deletion, server mutation or deployment was used.
