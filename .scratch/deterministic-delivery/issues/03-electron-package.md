# 03: Produce a verified Electron package

**What to build:** `electron-package` produces a reusable DMG and packaged app from the verified candidate, checks what actually ships and demonstrates packaged native loading and normal Quit before reporting completion.

**Blocked by:** 02.

**Status:** resolved

**Specification coverage:** Delivery targets; Configuration and prerequisites; Verification contract; Platform requirements — Electron; Artifacts and records.

**Acceptance scenarios:** A04 (Electron prerequisites); A05; A07; A08; A13; A15 (package reuse); A16.

- [ ] The target validates its declared Mac architecture, pinned packaging/native tools and production dependency installation. Routine CI's native-binary skip settings cannot yield a falsely verified package.
- [ ] It consumes matching verified compilation outputs, packages outside application source directories and retains the existing application allowlist plus explicit resource selection.
- [ ] Inspection checks the actual archive/unpacked inventory and rejects nested installers/app releases, unexpected source artifacts and missing production/native dependencies. Disk-image integrity is checked separately from content correctness.
- [ ] Packaged WebRTC/native-addon smoke and the production-main Quit regression using packaged dependencies pass. A native-load or Quit failure prevents target completion even if packaging succeeded.
- [ ] The receipt records full build identity, architecture, app version, signing state, artifact digests and resource/tray identity. A reused marketing version cannot stand in for build identity; the default unsigned local package is labeled accurately.
- [ ] Interrupted packaging retains diagnostics, valid finished packages are reused only after integrity checks, and changed/missing package content invalidates affected verification. Neither installation nor publication occurs.
- [ ] Regression fixtures reproduce nested release inclusion and missing native dependencies; real Mac evidence verifies the supported package architecture and native checks. Help explains artifacts, signing status and coverage limits.

## Comments

Published on 2026-11-10 with the approved breakdown. Implementation was deferred at publication.

Claimed on 2026-11-10 by the deterministic-delivery coordinator for the ticket-03 implementer. Baseline: client `d3afb218b1e6d51cd19ad0dcf1dfe0866fd31b08`; branch `codex/deterministic-delivery-03`; integration `codex/deterministic-delivery-integration`.

Resolved on 2026-11-10 at client integration `1677537ae80994f03240962cd4bb89bfd53d6cce`. Standards and Spec review verified fixes for packaged-executable WebRTC smoke and unpacked app inventory; combined delivery tests passed 48/48 and the implementer's full `npm run check` passed. Exact-revision Mac public CLI run `434d06bf-61d1-4fbb-918f-deba9952f60a` completed `electron-package`, passed nine common checks, inspected 4,910 archive and 412 unpacked entries, verified DMG integrity, packaged native WebRTC and normal Quit. Replay reused the same package; no installation occurred.
