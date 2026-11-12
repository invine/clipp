# 05: Qualify an Android candidate using native acceptance

**What to build:** An Android delivery run can prepare its isolated acceptance APK pair, execute native unit tests and the required Mac-hosted emulator acceptance matrix, and retain evidence attributable to the exact source and acceptance flavor.

**Blocked by:** 02.

**Status:** resolved

**Specification coverage:** Configuration and prerequisites; Verification contract; Platform requirements — Android; Artifacts and records; Resumption and concurrency; Architecture and reuse.

**Acceptance scenarios:** A04 (Android readiness); A05 (native coverage); A10 (candidate binding); A13; A14 (native resources); A16; A17; A18.

- [ ] Preflight validates the pinned JDK, Gradle wrapper, Android SDK/build tools and candidate-owned web dependencies. Development-server overrides and artifacts from an unrelated source fail preparation.
- [ ] Existing acceptance builders produce a frozen app/instrumentation APK pair with recorded source, configuration, toolchain, package IDs, callback scheme, signatures and digests. The production/acceptance distinction remains explicit.
- [ ] The profile allocates required native unit and instrumentation gates to exact scenario/API IDs under the existing Android acceptance/release procedures. Ambiguous allocation blocks; skipped, missing or zero expected cases cannot satisfy coverage.
- [ ] Execution selects owned Mac-hosted emulator resources explicitly, installs only the declared acceptance packages as authorized, verifies installed identity and readiness, and records actual native results rather than treating compilation or inventory as execution.
- [ ] Existing runner ownership, attempt budgets, renewal decisions, cleanup limits and evidence-applicability policies are preserved. Setup/readiness/test/cleanup outcomes remain distinguishable; changing a run directory does not reset native attempt history.
- [ ] Native resource access is serialized. Interrupted execution and stale owners are reconciled before reuse; cleanup preserves unrelated devices, packages, settings and user data while retaining durable receipts.
- [ ] Missing emulator prerequisites block the Android qualification stage without qualifying a smaller matrix or requiring a Relay checkout. Existing physical support qualification retains its original scope.
- [ ] Public-interface tests reject mismatched source/flavor/APK evidence and incomplete results. A real Mac-hosted acceptance run supplies the required selected-matrix evidence; the run still reports package/delivery stages incomplete until their tickets are implemented.

## Comments

Published on 2026-11-10 with the approved breakdown. Implementation was deferred at publication.

Claimed on 2026-11-10 by the deterministic-delivery coordinator for the ticket-05 implementer. Baseline: client `d3afb218b1e6d51cd19ad0dcf1dfe0866fd31b08`; branch `codex/deterministic-delivery-05`; integration `codex/deterministic-delivery-integration`.

Resolved on 2026-11-10 at client integration `95db68a1e6d859c903aafefcfa2032eb65f3863d` after Standards and Spec review and 48 combined delivery tests. Exact-revision Mac run `57c10693-7a14-4a42-aa68-4f77c4439b1f` passed nine common checks, native sync, seven Gradle unit cases, frozen APK pair provenance and 28/28 named matrix cases on each owned API 31/33/34/35/36 emulator. Installed acceptance APK bytes matched the pair; cleanup passed. Private authorization cited the user's implementation request and bound source, scope, effort, serials and pair hashes. The receipt and evidence manifest were retained privately. Replay retained 18 native attempts and five matrix receipts. The five owned AVDs were removed and `adb devices -l` was empty; no physical device or Play account was touched. Android product packaging remains pending by design.
