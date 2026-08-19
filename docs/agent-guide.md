# Agent Guide

This document is the repo-specific companion to `AGENTS.md`. It explains how Clipp is assembled so an agent can find the right layer quickly, make changes in the correct place, and avoid the runtime-specific traps.

## 1. What This Repo Builds

Clipp is a clipboard sharing system built around shared core logic plus runtime adapters:

- Electron desktop app in `apps/electron`
- Chrome extension in `apps/extension`
- Android/Capacitor app in `apps/android`
- Shared domain, transport, and sync logic in `packages/core`
- Shared React UI in `packages/ui`

The core design is:

1. Capture or receive clipboard content.
2. Normalize it into a `Clip`.
3. Store it in history.
4. Broadcast it to trusted peers over libp2p when auto-sync is enabled.
5. Apply remote clips back to the local clipboard.

The clean-architecture diagram in `docs/diagrams/electron-architecture.puml` matches the Electron runtime best, but the same domain pieces are reused across the other runtimes.

## 2. Monorepo Layout

### Applications

| Path | Purpose | Key files |
| --- | --- | --- |
| `apps/electron` | Desktop runtime, tray app, SQLite-backed state, preload bridge | `src/main.ts`, `src/preload.ts`, `src/renderer.tsx`, `src/storage.ts` |
| `apps/extension` | Chrome MV3 runtime with background service worker and offscreen networking | `src/background.ts`, `src/offscreen.ts`, `src/popup.tsx`, `src/options.tsx`, `manifest.json` |
| `apps/android` | Capacitor/Vite runtime with a client wrapper around shared core services | `src/client.ts`, `src/main.tsx`, `src/storage.ts` |

### Shared packages

| Path | Responsibility |
| --- | --- |
| `packages/core/clipboard` | Clipboard polling/manual services plus normalization helpers |
| `packages/core/history` | History storage abstractions, IndexedDB backend, prune/sync helpers |
| `packages/core/messaging` | Protocol-specific channels and trust binder |
| `packages/core/models` | Shared models such as `Clip` and `HistoryItem` |
| `packages/core/network` | Libp2p node setup, transport, peer ID helpers, relay constants |
| `packages/core/pairing` | Encode/decode pairing payloads shared across runtimes |
| `packages/core/protocols` | Wire formats for clip, trust, and history messages |
| `packages/core/qr` | QR encode/decode utilities |
| `packages/core/sync` | Clipboard sync coordinator |
| `packages/core/trust` | Identity management, trusted-device storage, evented trust manager |
| `packages/ui` | Shared React UI and shared frontend types |

### Tests and tooling

| Path | Purpose |
| --- | --- |
| `tests/core` | Jest coverage for shared core modules |
| `tests/harness` | Manual pairing/network harness |
| `scripts` | Relay probes, WebRTC helpers, CLI-based pairing tools |

## 3. Runtime Matrix

| Runtime | Boot path | Clipboard strategy | Persistence | UI bridge | Transport notes |
| --- | --- | --- | --- | --- | --- |
| Electron | `apps/electron/src/main.ts` | `createPollingClipboardService` | SQLite via `SQLiteKVStore` and `SQLiteHistoryBackend` | `window.clipp` exposed by `src/preload.ts` | Relay addresses are persisted and can be edited at runtime |
| Extension | `apps/extension/src/background.ts` plus `src/offscreen.ts` | `createManualClipboardService`; popup pushes clipboard text to background | `chrome.storage.local` plus IndexedDB history fallback | `chrome.runtime.sendMessage` between popup/options/background/offscreen | Offscreen document hosts libp2p because MV3 service worker is too constrained |
| Android | `apps/android/src/client.ts` | `createPollingClipboardService` using Capacitor Clipboard with browser fallback | Capacitor Preferences, then localStorage, then memory | `AndroidClient` methods consumed by `src/main.tsx` | Uses default relay list from `packages/core/network/constants.ts` |

## 4. Source Of Truth Files

When an agent needs to understand behavior quickly, these files are the highest-value entry points:

- `apps/electron/src/main.ts`: most complete end-to-end runtime wiring
- `packages/core/sync/clipboardSync.ts`: central local/remote clip flow
- `packages/core/network/engine.ts`: transport abstraction over libp2p
- `packages/core/trust/trustManager.ts`: trust lifecycle and trust events
- `packages/core/trust/identity.ts`: local identity creation and lookup
- `packages/ui/src/ClipboardApp.tsx`: shared feature surface across runtimes

## 5. Core Flows

### Local clipboard to remote peers

1. A runtime-specific clipboard service emits a local clip.
2. `createClipboardSyncManager()` in `packages/core/sync/clipboardSync.ts` stores the clip in history.
3. If auto-sync is enabled, it broadcasts a `clip` message.
4. Trusted messaging transports send that message to connected trusted peers.
5. Receiving peers validate and de-duplicate the clip, store it, then write it to the local clipboard.

The clipboard service differs by runtime:

- Electron and Android poll the local clipboard.
- Extension cannot poll from the MV3 service worker, so the popup reads clipboard text and forwards it to the background page.

### Pairing and trust

1. A runtime exposes local identity details, including multiaddrs.
2. Pairing payloads are encoded by `packages/core/pairing/encode.ts`.
3. UI surfaces usually convert that payload into a QR code with `packages/core/qr`.
4. The receiving runtime decodes the payload and sends a signed trust request.
5. `createTrustProtocolBinder()` attaches trust request handling to the trust messaging channel.
6. Approval adds the remote device to trusted storage.

Shared trust logic lives in `packages/core/trust`, but each runtime decides how identities and trusted devices are persisted.

### Protocol envelopes

Live Clip delivery uses the settled v1 protobuf boundary; do not reintroduce the removed JSON Clip envelope or payload-supplied sender metadata.

- Live Clip sync uses `/clipp/clip/1.0.0`, with one bounded length-prefixed protobuf `LiveClip` frame per stream. `LiveClip` contains one nested `Clip`; immediate-sender authority comes only from the authenticated libp2p connection.
- Clipboard History Reconciliation uses `/clipp/history/1.0.0`, with one one-way stream of bounded, non-empty length-prefixed protobuf `HistoryBatch` frames followed by EOF. Each batch contains nested `Clip` records; sender authority comes only from the authenticated libp2p connection.
- Trust uses `/clipboard/trust/1.0.0`.
- Trust request shape: `{ type: "trust-request", from, to, sentAt, payload: { device, sig } }`.
- Trust ack shape: `{ type: "trust-ack", from, to, sentAt, payload: { accepted, request, responder? } }`.

If you are touching protocol code, do not reintroduce the older JSON History Sync envelope, top-level `clip`, array `payload` for history sync, or top-level `sig` on trust requests.

### Transport startup

`packages/core/network/engine.ts` wraps `createClipboardNode()` and exposes:

- protocol registration
- message dispatch
- peer connect/disconnect notifications
- self multiaddr updates
- best-effort relay dialing

Peer reporting intentionally filters out relay-only connections. If a peer seems "missing," check whether the connection is only to a configured relay.

## 6. Persistence Map

### Electron

- Storage implementation: `apps/electron/src/storage.ts`
- Database file: `app.getPath("userData")/clipp.sqlite`
- Tables:
  - `kv` for identity, trust, relay addresses, and other key/value state
  - `history` for serialized clip history items, including pin state

Notable persisted keys used by Electron:

- `IDENTITY_KEY`
- `TRUST_KEY`
- `relayAddresses`

### Extension

- Trust and preferences: `chrome.storage.local` via `ChromeStorageBackend`
- History: IndexedDB when available, otherwise in-memory fallback
- Clipboard pin state: shared history-policy state for the active service-worker session; it is not persisted

### Android

- Storage implementation: `apps/android/src/storage.ts`
- Order of persistence:
  1. Capacitor Preferences
  2. `localStorage`
  3. in-memory map
- Clipboard history, including pin state, uses IndexedDB when available and otherwise falls back to in-memory storage

## 7. Shared UI And Bridge Boundaries

`packages/ui/src/ClipboardApp.tsx` is the shared product surface. The three runtimes differ mainly in how the UI talks to the platform:

- Electron: `window.clipp` methods exposed from `apps/electron/src/preload.ts`
- Android: methods on `AndroidClient`
- Extension: `chrome.runtime.sendMessage` calls in `popup.tsx` and `options.tsx`

If you add or change a user action in `ClipboardApp`, verify which runtimes need a bridge update. Typical examples:

- add a new button: update shared UI, then wire the runtime handler
- change state shape: update the runtime state getter and any type aliases
- change pairing UX: update shared UI plus the runtime-specific QR or decode path

## 8. Build And Test Workflow

Use npm workspace commands from the repo root.

### Common commands

- `npm test`
- `npm run lint`
- `npm --workspace apps/electron run build`
- `npm --workspace apps/android run build`
- `npm --workspace apps/extension run build`

### Runtime-specific notes

- Electron renderer dev server runs on port `4173`.
- Android Vite dev server runs on port `4174`.
- Electron dev is a two-step flow:
  1. `npm --workspace apps/electron run dev:renderer`
  2. `npm --workspace apps/electron run dev:electron`
- Extension currently has a build script, not a dedicated dev script.

### Manual tools

- `npm run relay:websocket`
- `npm run relay:probe`
- `npm run probe:direct`
- `npx tsx scripts/clipp-cli.ts --help`
- `node --loader ts-node/esm tests/harness/pairing-harness.ts`

## 9. Important Codebase Quirks

- Root `package.json` is ESM, but `apps/electron/package.json` is CommonJS. Do not assume the same module rules everywhere.
- The Vite apps use `@core` and `@ui` aliases. Electron main/preload do not.
- `apps/extension/offscreen.html` loads `src/offscreen.ts`, so treat `apps/extension/src/offscreen.ts` as the source of truth.
- `apps/electron/src/main.ts` is large and owns bootstrap, tray setup, transport lifecycle, persistence, and IPC. Expect many cross-cutting changes there.
- Relay code still contains legacy comments about WebRTC-star removal. Read the current call sites before simplifying anything.
- History sync protocol support exists in `packages/core/history` and extension offscreen messaging, but clip sync plus trust flows are the more widely integrated paths.
- The Live Clip codec uses the fixed nested protobuf schema. If you change protocol fields, update codec tests and every runtime transport bridge together.

## 10. Safe Change Strategy For Agents

For most work, use this sequence:

1. Identify whether the change is shared domain logic, shared UI, or runtime integration.
2. Start from the shared layer if possible.
3. Trace the bridge layer for each affected runtime.
4. Run the narrowest relevant test set first, then broader tests if the change crosses modules.
5. If networking behavior changed, check the manual probes or harness before assuming a libp2p issue is fixed.

Good "anchor" files by task:

- Clipboard bugs: `packages/core/clipboard/service.ts`, `packages/core/clipboard/normalize.ts`
- Missing or duplicate clip sync: `packages/core/sync/clipboardSync.ts`
- Trust or pairing regressions: `packages/core/trust/`, `packages/core/protocols/clipTrust.ts`, `packages/core/pairing/`
- Peer connectivity issues: `packages/core/network/node.ts`, `packages/core/network/engine.ts`
- Renderer action wiring: `apps/electron/src/preload.ts`, `apps/android/src/client.ts`, `apps/extension/src/background.ts`

## 11. Existing Docs Worth Reading

- `AGENTS.md`
- `docs/diagrams/electron-architecture.puml`
- `packages/core/clipboard/README.md`
- `packages/core/trust/README.md`
- `packages/core/qr/README.md`
