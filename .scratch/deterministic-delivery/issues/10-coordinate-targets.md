# 10: Coordinate multiple targets without redundant work

**What to build:** One delivery run progresses multiple selected targets, shares only equivalent verification/build work and continues independent work when another target is blocked, while retaining honest per-target results and safe resumption.

**Blocked by:** 03, 04, 06.

**Status:** resolved

**Specification coverage:** Delivery targets; Run lifecycle; Verification contract; Artifacts and records; Resumption and concurrency; Architecture and reuse.

**Acceptance scenarios:** A04 (independent progress); A05; A06; A13; A14 (shared resources); A15; A16; A17; A18.

- [x] The execution graph derives from the frozen target profiles and preserves the selected source and target set. Equivalent common checks/build outputs run once across targets, including compilation already performed by routine verification.
- [x] Reuse compares complete relevant source, tool, profile, build, signing and environment identities. Different debug/release/signing modes or changed artifacts cannot borrow incompatible verification.
- [x] A target-private prerequisite failure or delivery handoff blocks only dependent work. A disconnected Android device or unavailable Play key does not prevent an independent Electron package or Chrome result; shared source-check failure still blocks every dependent target.
- [x] Per-target records distinguish passed stages from complete delivery. The aggregate run completes only when every selected target meets its own criterion; incomplete/failed/uncertain work and exact next actions remain visible in human/JSON results.
- [x] Resume schedules only unfinished or invalidated dependent work, preserves successful observations and prior failures, and does not repeat completed installation/publication. A changed target set or source requires a successor plan.
- [x] Shared native/destination resources remain serialized through existing ownership rules while independent work progresses. Coordination does not weaken each adapter's checks, cleanup or uncertain-operation reconciliation.
- [x] Integration tests use the real Electron package, Chrome and Android package adapters where practical and controlled destinations for blocked installation/publication behavior. The same coordinator supports delivery adapters without hard-coded dependencies on completion of their implementation tickets.
- [x] A real mixed-target Mac run demonstrates common-work reuse and independent blocked-target progress. Guidance explains aggregate status and resumption; no hosted job or companion Relay repository is required.

## Comments

Published on 2026-11-10 with the approved breakdown. Implementation was deferred at publication.

Claimed on 2026-11-10 by the deterministic-delivery coordinator for the ticket-10 implementer. Baseline: client `b63237d59db2d42a53e1b60f719297bbb55b5722`; branch `codex/deterministic-delivery-10`; integration `codex/deterministic-delivery-integration`.

Implemented and integrated on 2026-11-10 at `b7d6b0dfd41f16d9a4382762fee9f96250e45148`. Full `npm run check` and normal commit hooks passed (Jest 210/210 suites, 1,698/1,698 tests; delivery tooling 124/124). Controlled public CLI regressions cover independent target progress, all three Android package modes, mode-specific local/Play handoff, common failure and completed replay recovery.

Exact-source Mac mixed run `6adbbf35-c9cd-4b93-a9bd-48ed84bc81ab` used source and tool `b7d6b0dfd41f16d9a4382762fee9f96250e45148` with only `electron-package` and `android-package`, no destination. Nine common checks and nine real Electron package checks passed once; Electron target completed with DMG SHA-256 `23183290273f72ca4eecf8c5072c015b23dcb83179e0821f711a672f78637b87` and app inventory `6c133d1be0ce9d8c6d5e824fba4e3865c64a24498e771967675f5af0c8dbb1df`. Android qualification remained blocked by absent private SDK/JDK/emulator references, while Electron completed. Aggregate result was `delivery_incomplete`; replay reused the same nine common and nine package attempts with hashes intact and no installation or publication.
