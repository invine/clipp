# 04: Gate Android acceptance on device and WebView readiness

**What to build:** Stop the existing Android acceptance path before a matrix when its selected candidate, device, WebView, instrumentation or basic interaction is unready.

**Blocked by:** None (can start immediately).

**Status:** claimed

- [ ] One exact serial is selected consistently through readiness and instrumentation, with candidate/package provenance.
- [ ] Boot completion, active WebView/provider version, instrumentation and simple app interaction are established before the matrix.
- [ ] Unsafe barcode-provider availability probing and personal/system-setting changes are excluded.
- [ ] Public command fixtures cover wrong targets and failed prerequisites; stage classification, persistent bounded retries and honest cleanup are recorded.
- [ ] Available native demonstration or explicit unavailable environmental evidence is retained without claiming a passed native gate.

## Context

The [approved specification](../spec.md) and [decision coverage](../decisions.md) define the complete contract and confirmed public testing seams. Preserve existing product invariants; this ticket changes operational verification only. The coordinator owns claims, integration and resolution.
