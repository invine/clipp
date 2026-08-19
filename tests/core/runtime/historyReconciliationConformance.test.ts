import {
  createExtensionStreamReceiver,
  relayExtensionStream,
} from "../../../apps/extension/src/streamBridge";
import { MemoryHistoryStore } from "../../../packages/core/history/store";
import type { StreamingMessagingTransport } from "../../../packages/core/messaging/transport";
import type { Clip } from "../../../packages/core/models/Clip";
import { decodeHistorySnapshot, encodeHistoryBatchFrame, HISTORY_PROTOCOL } from "../../../packages/core/protocols/history";
import {
  createAndroidRuntimeAdapter,
  createChromeExtensionRuntimeAdapter,
  createElectronRuntimeAdapter,
  createRuntimeConformanceHarness,
  createRuntimeNetworkProxy,
  createRuntimeOrchestrator,
  RUNTIME_CAPABILITIES,
  type RuntimeCapabilities,
  type RuntimePlatformAdapterDependencies,
} from "../../../packages/core/runtime";
import { createRuntimeClipboardService } from "../../../packages/core/runtime/clipboard";
import { createClipboardSyncManager } from "../../../packages/core/sync/clipboardSync";
import { createHistoryReconciliation } from "../../../packages/core/sync/historyReconciliation";

type Identity = { deviceId: string };
type State = Record<string, never>;
type PublicState = Record<string, never>;
type AdapterFactory = typeof createElectronRuntimeAdapter<Identity, State, PublicState>;

const localPeerId = "12D3KooWFNjtBxwwk1dbR9eAcDX11U9TsiU3Xho3fuY3e25tQzdy";
const senderPeerId = "12D3KooWSuG4bhX3bg3oS1P2eS6NWRmArz98sQ5ALbqK2ABu54mF";
const targetPeerId = "12D3KooWJ5oQ9G9kDMwrrzmVWwZnJryHJns8ovH8LYgDgJYJYyXy";
const historicalClip: Clip = {
  id: "00000000-0000-4000-8000-000000000011",
  type: "text",
  content: "history only",
  originPeerId: senderPeerId,
  capturedAt: 1_000,
  shareExpiresAt: 86_401_000,
};

describe.each([
  ["Desktop", createElectronRuntimeAdapter, RUNTIME_CAPABILITIES.electron, false],
  ["Mobile", createAndroidRuntimeAdapter, RUNTIME_CAPABILITIES.android, false],
  ["Extension", createChromeExtensionRuntimeAdapter, RUNTIME_CAPABILITIES.chromeExtension, true],
] as const)("%s Clipboard History Reconciliation", (_name, factory, capabilities, usesExtensionBridge) => {
  it("repairs through runtime startup without clipboard effects, re-exports, and remains idempotent", async () => {
    const history = new MemoryHistoryStore(undefined, { now: () => 2_000 });
    const outbound: Uint8Array[] = [];
    let directInbound: Parameters<StreamingMessagingTransport["onStream"]>[1] | undefined;
    const extensionReceiver = createExtensionStreamReceiver();
    const baseTransport: StreamingMessagingTransport = {
      start: async () => {},
      stop: async () => {},
      send: async () => {},
      async sendStream(protocol, target, frames) {
        expect({ protocol, target }).toEqual({ protocol: HISTORY_PROTOCOL, target: targetPeerId });
        for await (const frame of frames) outbound.push(Uint8Array.from(frame));
      },
      connect: async () => {},
      onMessage: () => {},
      onStream(protocol, handler) {
        if (usesExtensionBridge) extensionReceiver.onStream(protocol, handler);
        else directInbound = handler;
      },
      onPeerConnected: () => {},
      onPeerDisconnected: () => {},
      onSelfPeerUpdate: () => {},
      getConnectedPeers: () => [targetPeerId],
    };
    const network = usesExtensionBridge
      ? baseTransport
      : createRuntimeNetworkProxy(() => baseTransport);
    const harness = createRuntimeConformanceHarness<Identity, State, PublicState>({
      capabilities,
      initialIdentity: { deviceId: localPeerId },
      initialApplicationState: {},
      initialClipboardText: "current clipboard",
      now: 2_000,
      getPublicState: async () => ({}),
    });
    const adapter = createPlatformAdapter(factory as AdapterFactory, harness.adapter.capabilities, {
      clipboard: harness.adapter.clipboard,
      notifications: harness.adapter.notifications,
      lifecycle: harness.adapter.lifecycle,
      network,
      clock: harness.adapter.clock,
      publicState: harness.adapter.publicState,
    });
    const clipboard = createRuntimeClipboardService({
      capabilities: adapter.capabilities,
      history,
      getSenderId: () => localPeerId,
      readText: adapter.capabilities.clipboardCapture === "polling"
        ? () => adapter.clipboard.readText()
        : undefined,
      writeText: (text) => adapter.clipboard.writeText(text),
      pollIntervalMs: 60_000,
      now: adapter.clock.now,
    });
    const clipboardSync = createClipboardSyncManager({
      clipboard,
      history,
      getLocalDeviceId: async () => localPeerId,
      now: adapter.clock.now,
    });
    const reconciliation = createHistoryReconciliation({
      transport: network,
      history,
      getLocalDeviceId: async () => localPeerId,
      membershipStatus: async () => "active",
      now: adapter.clock.now,
    });
    const runtime = createRuntimeOrchestrator({
      adapter,
      start: async () => {
        clipboardSync.start();
        reconciliation.start();
      },
      stop: async () => {
        reconciliation.stop();
        clipboardSync.stop();
      },
    });
    await runtime.start();

    const deliver = async (): Promise<void> => {
      const chunks = (async function *(): AsyncIterable<Uint8Array> {
        yield encodeHistoryBatchFrame({ clips: [historicalClip] });
      })();
      if (!usesExtensionBridge) {
        await directInbound!(senderPeerId, chunks);
        return;
      }
      await relayExtensionStream({
        protocol: HISTORY_PROTOCOL,
        from: senderPeerId,
        chunks,
        streamId: globalThis.crypto.randomUUID(),
        send: (message) => extensionReceiver.handle(message),
      });
    };
    await deliver();
    await deliver();

    expect(await history.exportAll()).toEqual([historicalClip]);
    expect(harness.observed.clipboardWrites).toEqual([]);
    expect(decodeHistorySnapshot(concat(outbound))).toEqual([{ clips: [historicalClip] }]);

    await runtime.stop();
  });
});

function createPlatformAdapter(
  factory: AdapterFactory,
  capabilities: RuntimeCapabilities,
  ports: Pick<
    RuntimePlatformAdapterDependencies<Identity, State, PublicState>,
    "clipboard" | "notifications" | "lifecycle" | "network" | "clock" | "publicState"
  >,
) {
  const values = new Map<string, unknown>();
  return factory({
    ...ports,
    storage: {
      get: async <Value>(key: string) => values.get(key) as Value | undefined,
      set: async <Value>(key: string, value: Value) => void values.set(key, structuredClone(value)),
      remove: async (key: string) => void values.delete(key),
    },
    identityKey: "identity",
    applicationStateKey: "state",
    initialApplicationState: () => ({}),
    relays: {
      readAddresses: async () => [],
      ...(capabilities.relayConfiguration === "editable"
        ? { updateAddresses: async (addresses: string[]) => addresses }
        : {}),
    },
  });
}

function concat(parts: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}
