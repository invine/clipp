# 04: Gate Android acceptance on device and WebView readiness

**What to build:** Stop the existing Android acceptance path before a matrix when its selected candidate, device, WebView, instrumentation or basic interaction is unready.

**Blocked by:** None (can start immediately).

**Status:** resolved

- [x] One exact serial is selected consistently through readiness and instrumentation, with candidate/package provenance.
- [x] Boot completion, active WebView/provider version via supported Android diagnostics, target-package instrumentation and an observed focused-control change are established before the matrix.
- [x] Unsafe barcode-provider availability probing and personal/system-setting changes are excluded.
- [x] Public command fixtures cover unsupported/missing WebView output, wrong instrumentation targets, wrong devices and failed prerequisites; stage classification and diagnostic deadline enforcement are tested.
- [x] Every default instrumentation entry point runs readiness first; native readiness and connected instrumentation are demonstrated, or native unavailability is recorded honestly.

## Context

The [approved specification](../spec.md) and [decision coverage](../decisions.md) define the complete contract and confirmed public testing seams. Preserve existing product invariants; this ticket changes operational verification only. The coordinator owns claims, integration and resolution.

## Answer

Implemented on the client integration branch, including an installed base-APK hash comparison against the supplied candidate; mismatches and split APK installs fail closed. Readiness uses supported WebView diagnostics, filters instrumentation by the target app package, observes explicit current focus and a changed focused-control fingerprint, enforces the remaining deadline (including truthful UI-hierarchy cleanup state), and gates matrix/API-specific/connected instrumentation commands. Android readiness tests passed (14/14); the exact integration tree passed `npm run verify` (81 suites, 726 tests, all three production builds).

After the user reset the Android acceptance budget on 2026-10-26, a fresh API 31 scenario passed on `emulator-5554`. The exact isolated candidate hash was verified against the installed base APK; WebView provider/version, target-package instrumentation probe, launch, focused activity and observed Tab focus change all passed. Readiness completed on attempt 1 with hierarchy cleanup passed. Connected acceptance then completed with 30 cases, 0 failures, 0 errors and 2 phase-only skips (`BUILD SUCCESSFUL`). No connected OnePlus use, operator package modification or user-data access occurred. The fresh receipt, APKs and instrumentation result files are in the private run artifact directory. The original three-attempt failure history remains preserved separately.

## Comments

Reopened after review found that the WebView shell query is unsupported, instrumentation discovery uses the test package instead of its target package, the interaction check observes no result, the 20-minute diagnostic deadline is enforced only before the attempt, and the default instrumentation matrix bypasses readiness. Those code findings are fixed and regression-tested. A native acceptance demonstration remains incomplete because the bounded emulator scenario ended on an ADB timeout before readiness completed.

The reviewed code findings are fixed and independently verified. The original bounded emulator scenario ended before readiness, but the user later reset its budget; the fresh readiness and connected acceptance scenario passed as recorded above.
