# 04: Gate Android acceptance on device and WebView readiness

**What to build:** Stop the existing Android acceptance path before a matrix when its selected candidate, device, WebView, instrumentation or basic interaction is unready.

**Blocked by:** None (can start immediately).

**Status:** claimed

- [x] One exact serial is selected consistently through readiness and instrumentation, with candidate/package provenance.
- [x] Boot completion, active WebView/provider version via supported Android diagnostics, target-package instrumentation and an observed focused-control change are established before the matrix.
- [x] Unsafe barcode-provider availability probing and personal/system-setting changes are excluded.
- [x] Public command fixtures cover unsupported/missing WebView output, wrong instrumentation targets, wrong devices and failed prerequisites; stage classification and diagnostic deadline enforcement are tested.
- [ ] Every default instrumentation entry point runs readiness first; native readiness and connected instrumentation are demonstrated, or native unavailability is recorded honestly.

## Context

The [approved specification](../spec.md) and [decision coverage](../decisions.md) define the complete contract and confirmed public testing seams. Preserve existing product invariants; this ticket changes operational verification only. The coordinator owns claims, integration and resolution.

## Answer

Implemented on the client integration branch, including an installed base-APK hash comparison against the supplied candidate; mismatches and split APK installs fail closed. Readiness uses supported WebView diagnostics, filters instrumentation by the target app package, observes explicit current focus and a changed focused-control fingerprint, enforces the remaining deadline (including truthful UI-hierarchy cleanup state), and gates matrix/API-specific/connected instrumentation commands. Android readiness tests passed (14/14); the exact integration tree passed `npm run check` (81 suites, 726 tests).

An API 31 emulator was available. The isolated acceptance and instrumentation APKs were installed only on `emulator-5554`; the connected OnePlus device was not targeted. Three bounded readiness attempts were recorded. Attempt 1 exposed a focus-query mismatch and attempt 2 exposed Android's `hierchary` output spelling; both code issues are fixed and covered by fixtures. Attempt 3 timed out at the initial ADB boot check. The readiness gate withheld Gradle instrumentation, so no connected native suite passed. The scenario budget is exhausted and ticket 04 remains open. Receipts and the ADB log are retained in the private run artifacts.

## Comments

Reopened after review found that the WebView shell query is unsupported, instrumentation discovery uses the test package instead of its target package, the interaction check observes no result, the 20-minute diagnostic deadline is enforced only before the attempt, and the default instrumentation matrix bypasses readiness. Those code findings are fixed and regression-tested. A native acceptance demonstration remains incomplete because the bounded emulator scenario ended on an ADB timeout before readiness completed.

The reviewed code findings are fixed and independently verified. Native acceptance remains unqualified because the final bounded emulator attempt timed out before readiness completed; no further attempt was made.
