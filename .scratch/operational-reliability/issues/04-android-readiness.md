# 04: Gate Android acceptance on device and WebView readiness

**What to build:** Stop the existing Android acceptance path before a matrix when its selected candidate, device, WebView, instrumentation or basic interaction is unready.

**Blocked by:** None (can start immediately).

**Status:** claimed

- [x] One exact serial is selected consistently through readiness and instrumentation, with candidate/package provenance.
- [ ] Boot completion, active WebView/provider version via supported Android diagnostics, target-package instrumentation and successful app interaction are established before the matrix.
- [x] Unsafe barcode-provider availability probing and personal/system-setting changes are excluded.
- [ ] Public command fixtures cover incorrect WebView/instrumentation commands, wrong targets and failed prerequisites; stage classification and diagnostic deadline enforcement are tested.
- [ ] Every default instrumentation entry point runs readiness first; native demonstration or unavailable environmental evidence is retained honestly.

## Context

The [approved specification](../spec.md) and [decision coverage](../decisions.md) define the complete contract and confirmed public testing seams. Preserve existing product invariants; this ticket changes operational verification only. The coordinator owns claims, integration and resolution.

## Answer

Implemented on the client integration branch, including an installed base-APK hash comparison against the supplied candidate; mismatches and split APK installs fail closed. Public readiness fixtures and the client check passed. Native acceptance remains unavailable because no API 31+ emulator was present; no app install, launch, instrumentation or device setting change was attempted. The environment observation is in the local run ledger's artifact directory.

## Comments

Reopened after review found that the WebView shell query is unsupported, instrumentation discovery uses the test package instead of its target package, the interaction check observes no result, the 20-minute diagnostic deadline is enforced only before the attempt, and the default instrumentation matrix bypasses readiness. Resolve these against the approved spec before restoring the completion status.
