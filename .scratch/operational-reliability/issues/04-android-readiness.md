# 04: Gate Android acceptance on device and WebView readiness

**What to build:** Stop the existing Android acceptance path before a matrix when its selected candidate, device, WebView, instrumentation or basic interaction is unready.

**Blocked by:** None (can start immediately).

**Status:** resolved

- [x] One exact serial is selected consistently through readiness and instrumentation, with candidate/package provenance.
- [x] Boot completion, active WebView/provider version, instrumentation and simple app interaction are established before the matrix.
- [x] Unsafe barcode-provider availability probing and personal/system-setting changes are excluded.
- [x] Public command fixtures cover wrong targets and failed prerequisites; stage classification, persistent bounded retries and honest cleanup are recorded.
- [x] Available native demonstration or explicit unavailable environmental evidence is retained without claiming a passed native gate.

## Context

The [approved specification](../spec.md) and [decision coverage](../decisions.md) define the complete contract and confirmed public testing seams. Preserve existing product invariants; this ticket changes operational verification only. The coordinator owns claims, integration and resolution.

## Answer

Implemented on the client integration branch, including an installed base-APK hash comparison against the supplied candidate; mismatches and split APK installs fail closed. Public readiness fixtures and the client check passed. Native acceptance remains unavailable because no API 31+ emulator was present; no app install, launch, instrumentation or device setting change was attempted. The environment observation is in the local run ledger's artifact directory.
