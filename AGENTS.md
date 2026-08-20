# AGENTS.md

This repository is an npm workspaces monorepo for Clipp, a peer-to-peer clipboard sharing app with three runtimes:

- Electron desktop app
- Chrome extension
- Android/Capacitor app

Use this file for fast orientation. Use [`docs/agent-guide.md`](docs/agent-guide.md) for the deeper architecture map.
Use [`CONTEXT.md`](CONTEXT.md) for canonical domain language and
the specs under [`.scratch/`](.scratch/) for settled feature requirements.

## Start Here

Read these files first when you need end-to-end context:

1. `package.json`
2. `apps/electron/src/main.ts`
3. `packages/core/sync/clipboardSync.ts`
4. `packages/core/trust/`
5. `packages/core/network/engine.ts`
6. `packages/ui/src/ClipboardApp.tsx`

Electron is the most complete runtime and is usually the best reference implementation.

## Repo Map

- `apps/electron`: desktop runtime, tray app, SQLite persistence, preload bridge, shared UI renderer
- `apps/extension`: MV3 extension, background service worker plus offscreen document for libp2p/WebRTC
- `apps/android`: Capacitor/Vite app, shared UI plus `AndroidClient` runtime adapter
- `packages/core`: shared clipboard, trust, pairing, messaging, history, network, protocol logic
- `packages/ui`: shared React UI used by Electron, Android, and the extension popup
- `tests/core`: Jest tests for shared modules
- `tests/harness`: manual pairing/network harness
- `docs/diagrams`: architecture diagrams, currently Electron-focused
- `scripts`: relay probes, CLI helpers, manual network tooling

## Working Rules For This Repo

- Use `npm`, not pnpm or turbo. The root scripts and workspace layout are set up for npm workspaces.
- Put cross-runtime behavior in `packages/core` first. Only add runtime-specific code where the platform forces it.
- Put shared UI changes in `packages/ui` first. Then update the runtime bridge for Electron, Android, or the extension if the UI action surface changed.
- Electron renderer and Android app both mount `@clipp/ui`; extension popup also uses the shared `ClipboardApp`.
- Extension networking is split between `apps/extension/src/background.ts` and `apps/extension/src/offscreen.ts`. The offscreen TypeScript file is the source of truth; the checked-in `offscreen.js` is not referenced by `offscreen.html`.
- Electron main/preload are bundled separately and run as CommonJS. Keep an eye on import specifiers there; they do not use the Vite aliases from the browser runtimes.
- `@core` and `@ui` aliases exist in the Vite apps, but Electron main code imports shared modules via relative paths.

## Runtime Differences That Matter

- Electron uses `createPollingClipboardService`, stores state in SQLite, and wires relay-address changes into persisted runtime state.
- Android uses `createPollingClipboardService`, stores preferences in Capacitor Preferences or local storage fallback, and currently relies on the default relay list.
- Extension uses `createManualClipboardService` because the MV3 service worker cannot poll the clipboard directly; the popup feeds local text into that service.
- Electron and Android persist pin state in history storage. Extension pins live in shared history policy for the active service-worker session and are not persisted.
- Extension is the only runtime currently wiring the history messenger in the offscreen document. Clip sync and trust flows are shared more broadly.

## Commands

- `npm test`
- `npm run lint`
- `npm --workspace apps/electron run build`
- `npm --workspace apps/electron run dev:renderer`
- `npm --workspace apps/electron run dev:electron`
- `npm --workspace apps/android run dev`
- `npm --workspace apps/android run build`
- `npm --workspace apps/extension run build`
- `npm run relay:websocket`

Electron dev uses two processes. Start the renderer first on `http://localhost:4173`, then launch `dev:electron`.

## Storage Quick Reference

- Electron: SQLite database at `app.getPath("userData")/clipp.sqlite`
- Extension: `chrome.storage.local` plus IndexedDB history when available
- Android: Capacitor Preferences, then localStorage, then in-memory fallback

## Where To Make Common Changes

- Clipboard normalization or watcher behavior: `packages/core/clipboard/`
- Sync flow for local vs remote clips: `packages/core/sync/clipboardSync.ts`
- Device identity, Membership Views, and local presentation metadata: `packages/core/trust/`
- Pairing protobufs and Pairing Target v2 encoding: `packages/core/pairing/`
- Libp2p transport or relay behavior: `packages/core/network/`
- Shared app UI: `packages/ui/src/ClipboardApp.tsx`
- Electron IPC surface: `apps/electron/src/preload.ts` and `apps/electron/src/main.ts`
- Extension message surface: `apps/extension/src/background.ts`, `apps/extension/src/popup.tsx`, `apps/extension/src/options.tsx`
- Android runtime bridge: `apps/android/src/client.ts`

## Useful References

- [`CONTEXT.md`](CONTEXT.md)
- [`docs/adr/0001-use-transitive-trust-within-an-owned-device-network.md`](docs/adr/0001-use-transitive-trust-within-an-owned-device-network.md)
- [`docs/adr/0002-use-hop-authenticated-unsigned-revocations.md`](docs/adr/0002-use-hop-authenticated-unsigned-revocations.md)
- [`docs/adr/0003-resolve-membership-by-instance-id.md`](docs/adr/0003-resolve-membership-by-instance-id.md)
- [`docs/adr/0004-use-peer-id-as-membership-identity.md`](docs/adr/0004-use-peer-id-as-membership-identity.md)
- [`docs/adr/0005-use-stateless-signed-trust-requests.md`](docs/adr/0005-use-stateless-signed-trust-requests.md)
- [`docs/adr/0006-separate-pairing-from-membership-reconciliation.md`](docs/adr/0006-separate-pairing-from-membership-reconciliation.md)
- [`docs/adr/0007-forward-libp2p-signed-peer-records.md`](docs/adr/0007-forward-libp2p-signed-peer-records.md)
- [`docs/adr/0008-store-device-keys-in-runtime-application-storage.md`](docs/adr/0008-store-device-keys-in-runtime-application-storage.md)
- [`docs/adr/0009-use-hop-authenticated-unsigned-clips.md`](docs/adr/0009-use-hop-authenticated-unsigned-clips.md)
- [`docs/adr/0010-identify-clip-events-with-origin-assigned-uuids.md`](docs/adr/0010-identify-clip-events-with-origin-assigned-uuids.md)
- [`docs/adr/0011-use-live-gossip-with-full-history-reconciliation.md`](docs/adr/0011-use-live-gossip-with-full-history-reconciliation.md)
- [`.scratch/pairing-and-trust/spec.md`](.scratch/pairing-and-trust/spec.md)
- [`.scratch/clip-history/spec.md`](.scratch/clip-history/spec.md)
- [`.scratch/runtime-capabilities/spec.md`](.scratch/runtime-capabilities/spec.md)
- [`docs/agent-guide.md`](docs/agent-guide.md)
- [`docs/diagrams/electron-architecture.puml`](docs/diagrams/electron-architecture.puml)
- [`packages/core/clipboard/README.md`](packages/core/clipboard/README.md)
- [`packages/core/trust/README.md`](packages/core/trust/README.md)

## Agent skills

### Issue tracker

Issues and specs are tracked as local Markdown files under `.scratch/`. See `docs/agents/issue-tracker.md`.

### Triage labels

The default five-role triage vocabulary is used. See `docs/agents/triage-labels.md`.

### Domain docs

This repo uses a single-context domain-doc layout. See `docs/agents/domain.md`.
