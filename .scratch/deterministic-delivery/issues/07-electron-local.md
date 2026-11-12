# 07: Install and confirm the Electron candidate

**What to build:** `electron-local` installs the verified Electron candidate, preserves a recoverable previous application and confirms installed identity, launch and normal Quit without changing user data.

**Blocked by:** 03.

**Status:** resolved

**Specification coverage:** Delivery targets; Platform requirements — Electron; Artifacts and records; Resumption and concurrency.

**Acceptance scenarios:** A04 (desktop readiness); A05; A08 (installed runtime); A13; A14 (application ownership); A15; A16.

- [ ] The target prepares or reuses an equivalent ticket-03 package and rechecks its identity and all required verification before delivery; it never rebuilds during installation.
- [ ] Preflight identifies the installation path, current app, desktop readiness and applicable authorization. Destination access is exclusive across runs regardless of their output directories.
- [ ] Replacement preserves a recoverable prior application bundle and all profiles, Clipboard History, Device Identity and settings. Only the selected Clipp application is stopped as authorized; unrelated processes are preserved.
- [ ] Installed payload/build identity is verified against the candidate, followed by launch and normal Quit. A copied bundle, common version number or previously passing package check alone is not installed acceptance.
- [ ] Interrupted or uncertain replacement is reconciled with the actual destination before retrying. Recovery information is retained, and restoration is not reported complete until checked.
- [ ] A repeated completed plan performs no new installation. Changed artifacts invalidate delivery admission; competing/stale ownership cannot cause overlapping replacements.
- [ ] Public-interface tests exercise interruption, wrong installed identity, failed launch/Quit and contention. Real Mac installation evidence is collected only under matching authorization; setup/help covers installation identity and recovery without claiming broader networking acceptance.

## Comments

Published on 2026-11-10 with the approved breakdown. Implementation was deferred at publication.

Claimed on 2026-11-10 by the deterministic-delivery coordinator for the ticket-07 implementer. Baseline: client `95b25b3f06d8c60fcf8bf9eb4d0a9b6a1c4bffe8`; branch `codex/deterministic-delivery-07`; integration `codex/deterministic-delivery-integration`.

Resolved on 2026-11-10 at client integrated Electron-local revision `18a5390d7dd6eb0cb11acfda54b75af54513eccc`. Standards and Spec review verified installed executable normal Quit, saved runtime-log checks and primary-checkout destination containment. Focused integrated adapter tests passed 19/19 and probe guards 3/3; the implementer's full hook passed 210 Jest suites, 133 candidate cases and 89 delivery tests, and post-merge delivery passed 102/102. Exact-revision Mac public run `175d0a33-97fe-4e8a-8990-bdbf0adb2957` passed common/package/local stages, installed an app with inventory matching the package, passed native WebRTC and normal Quit from the installed executable on an owned PID/private profile, and retained the prior temporary bundle as backup. Replay added no package/install attempts and preserved app/backup identities. Only coordinator-owned temporary paths were touched; `/Applications`, user profiles/history and existing Clipp processes were untouched.
