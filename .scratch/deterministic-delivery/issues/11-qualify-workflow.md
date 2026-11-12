# 11: Qualify the complete Mac delivery workflow

**What to build:** A user can set up the documented local flow and operate all six targets through the integrated public interface, with complete regression coverage and attributable Mac evidence showing exactly what has and has not been qualified.

**Blocked by:** 07, 08, 09, 10.

**Status:** resolved

**Specification coverage:** All sections; final integration and operational handoff.

**Acceptance scenarios:** A01–A18, integrating the primary coverage owned by the earlier tickets.

- [x] Review the integrated implementation against every specification requirement and the approved decisions. Each A01–A18 scenario has an attributable automated result; fix integration findings rather than deferring essential correctness to operator instructions.
- [x] Exercise all six target contracts and combined-target behavior through the public interface, including failures, changed artifacts, interrupted builds/deliveries, simultaneous runs, stale ownership and completed-plan replay.
- [x] Real Mac evidence covers common checks, Electron packaging/native loading/Quit, Chrome built/loaded identity, Android package/signature/native qualification, and authorized local installations/readiness. Record tested revisions, inputs, environments and durable receipt references.
- [x] Actual Play internal-release qualification requires a separately authorized release and confirmed destination state. When unavailable, retain explicit not-run evidence, owner and next action; do not resolve qualification by substituting simulated publication or calling the whole flow fully qualified.
- [x] Setup/migration guidance identifies private credential references, stable destinations, supported toolchain/architecture profiles and measured performance thresholds without copying secrets or treating historical local settings as current truth.
- [x] Operational entry points route users/agents to command help and versioned profiles. Avoid a second manually maintained list of shell steps or a competing issue/status tracker.
- [x] A fresh-context walkthrough demonstrates planning, prerequisite diagnosis, candidate execution, inspection and resumption without reconstructing prior chat history. Existing native limits and matching authorization survive handoffs without repeated unnecessary confirmation.
- [x] Check that retained artifacts/receipts survive owned-checkout cleanup, that pre-existing user work is preserved, and that summaries/logs protect secret values. No Relay implementation or required hosted CI execution has entered scope.
- [x] Final review and evidence identify every residual blocker precisely. Only actually satisfied qualification is recorded as complete; production store distribution, notarization and unrelated product/network support claims remain outside v1.

## Comments

Published on 2026-11-10 with the approved breakdown. Implementation was deferred at publication.

Conditionally claimed on 2026-11-10 for ticket-11 implementation from integration `b7d6b0dfd41f16d9a4382762fee9f96250e45148` in branch `codex/deterministic-delivery-11`. Integrated code dependencies are present; ticket-08 final frozen-source real Android evidence and ticket-10 mixed Mac receipt remain pending and must not be reported as qualified by controlled tests.

Final-source Android evidence on 2026-11-10 is complete at integration `28a40ffd4af4845f40fff500d130ec3ac29cda25`, public plan/run `92acf7c5-fc94-4372-98bb-99bf3cd90ba1`: nine common checks, native unit and exact-source acceptance pair, five owned API 31/33/34/35/36 matrices at 28/28 cases each, unsigned release APK/AAB, separate authorized debug APK installation on owned API35 with matching installed bytes/certificate/version and foreground/process readiness. Read-only status and completed-plan replay added no attempts and left `run.json` byte-identical. The checksum-verified evidence manifest was retained privately. The earlier `92e7938` receipts remain source-bound historical evidence. The owned emulators were stopped and removed after archiving, with ADB empty. Final `28a40ff` Electron/Chrome acceptance is being collected separately by ticket 07. Actual Play internal publication remains **not run**: owner is the selected Play application operator; next action is separate matching publication authorization followed by a real internal-track release and readback. Controlled Play tests do not substitute for that release. Ticket status remains claimed for coordinator reconciliation.

Coordinator resolution on 2026-11-10: A01–A18 automated coverage, final integrated review and exact-source owned Mac receipts at `28a40ffd4af4845f40fff500d130ec3ac29cda25` satisfy local v1 implementation qualification. The final Android and Electron/Chrome evidence manifests were retained privately. Actual Play internal publication is explicitly not run pending separate operator authorization and release readback; no claim of full live publication is made.
