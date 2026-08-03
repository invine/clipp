# 01 — Establish the shared runtime seam

**What to build:** Introduce a common runtime-adapter boundary and conformance harness that lets shared Device Network and Clip behavior be implemented once while Electron, Android, and the Chrome extension continue to operate with their existing behavior during the transition.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] Define one shared runtime contract for identity storage, transactional application state, clipboard access, native notifications, lifecycle control, networking, clocks, and user-visible state updates.
- [ ] Preserve the platform distinctions that the target design requires: polling capture on Electron and Android, explicit popup input in Chrome, editable relays only in Electron, and platform-specific persistence and notification APIs.
- [ ] Add a shared conformance harness that can assemble the runtime orchestration with fake adapters and observe durable state, protocol traffic, clipboard calls, notifications, and public state.
- [ ] Adapt all three runtimes to the new seam without changing their current user-visible behavior or wire protocols.
- [ ] Keep shared orchestration free of Electron, Capacitor, and Chrome API dependencies.
- [ ] Keep all existing tests and all three runtime builds green after the prefactor.
