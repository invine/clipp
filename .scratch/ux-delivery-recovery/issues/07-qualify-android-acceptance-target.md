# 07: Run trustworthy Android acceptance on the intended device

**What to build:** Exercise a focused Android behavior only after the selected device, installed candidate and input/instrumentation path have demonstrated readiness, with bounded diagnosis and owned cleanup.

**Blocked by:** [02 — Prepare a reproducible acceptance candidate](02-prepare-reproducible-candidate.md), [04 — Enforce durable diagnostic limits through an existing runner](04-enforce-diagnostic-limits.md).

**Status:** claimed

**Assignee:** `/root/chrome`

**Claim:** ux-delivery-recovery-20261028-07; coordinator `/root`.

**Parent:** [Approved specification](../spec.md).

- [ ] Reuse the repaired operational-reliability Android command and its recorded native lessons once available on main; do not reimplement the previously fixed unsupported WebView query or wrong instrumentation-target behavior.
- [ ] Consume the frozen candidate and select one serial consistently across readiness, installation checks and instrumentation. Verify installed artifact identity with supported tooling and report unsupported artifact forms explicitly.
- [ ] Establish boot readiness, supported WebView provider/version diagnostics, target-package instrumentation, correct focused application and an observable control change before the matrix. Package presence or an unobserved key event is insufficient.
- [ ] Apply the shared five-attempt/twenty-minute diagnostic policy across maintained matrix and device-specific entry points. Preserve semantic scenario history across new invocations and output locations; no alternate entry point bypasses readiness or resets the budget.
- [ ] Classify prerequisite, runner, product and unknown failures, including ADB timeout, wrong device, stale APK, missing instrumentation and unavailable input. A failed preflight withholds its matrix while unrelated work remains eligible.
- [ ] Demonstrate one focused native behavioral scenario with the same selected candidate and runner. Keep real Android observations distinct from web builds, injected WebView fixtures or physical-device claims.
- [ ] Scope emulator/device/clipboard ownership and authorization explicitly. Preserve pre-existing phones, packages, guests and settings; clean up only owned resources and record any requested restoration outcome truthfully.
- [ ] Public-command regressions exercise supported diagnostic output, wrong target/package, failed interaction, deadline propagation, exhausted retries and cleanup failure. Actual available-host readiness and the selected native scenario are recorded separately from mock results.
- [ ] Complete applicable checks and review. Missing required native prerequisites leave the affected qualification open with a named recovery action rather than a fabricated pass.

**Scope boundary:** This ticket does not require the full UX native matrix, physical-device breadth, account sign-in or the complete Pairing journey. Ticket 10 uses the qualified runner during adoption.

## Native qualification continuation

Source `99e3e77` includes both reviewed corrections and the current shared formatter. An independent committed checkout produced the real acceptance app/test APK pair with the installed SDK; public fixtures are separate evidence. The assigned operator is preparing only a fresh owned headless API31 guest on serial `emulator-5584`, with no existing phone/AVD or host clipboard access. Actual readiness and the focused native behavior remain pending their receipts. The original implementation owner and source handoff remain preserved.
