import { MemoryHistoryStore } from "../../../packages/core/history/store";
import {
  decideAtomicHistoryMutation,
  type HistoryMutation,
  type HistoryMutationResult,
  type HistoryStorageBackend,
} from "../../../packages/core/history/types";
import type { MessagingTransport } from "../../../packages/core/messaging/transport";
import type { Clip } from "../../../packages/core/models/Clip";
import { encodeLiveClipFrame, LIVE_CLIP_PROTOCOL } from "../../../packages/core/protocols/liveClip";
import {
  createAndroidRuntimeAdapter,
  createChromeExtensionRuntimeAdapter,
  createElectronRuntimeAdapter,
  createRuntimeClipboardService,
  RUNTIME_CAPABILITIES,
} from "../../../packages/core/runtime";
import { createClipboardSyncManager } from "../../../packages/core/sync/clipboardSync";
import { createLiveClipGossip } from "../../../packages/core/sync/liveClipGossip";

const clip: Clip = {
  id: "00000000-0000-4000-8000-000000000001",
  type: "text",
  content: "hello",
  originPeerId: "12D3KooWJ5oQ9G9kDMwrrzmVWwZnJryHJns8ovH8LYgDgJYJYyXy",
  capturedAt: 1,
  shareExpiresAt: 86_400_001,
};

class RestartableHistoryBackend implements HistoryStorageBackend {
  constructor(private readonly durable: Map<string, unknown>) {}

  async set(key: string, value: unknown): Promise<void> { this.durable.set(key, structuredClone(value)); }
  async get(key: string): Promise<unknown> { return structuredClone(this.durable.get(key) ?? null); }
  async getAll(): Promise<unknown[]> { return structuredClone([...this.durable.values()]); }
  async remove(key: string): Promise<void> { this.durable.delete(key); }
  async clearAll(): Promise<void> { this.durable.clear(); }
  async applyHistoryMutation(input: HistoryMutation): Promise<HistoryMutationResult> {
    const plan = decideAtomicHistoryMutation(this.durable, input);
    for (const key of plan.deletes) this.durable.delete(key);
    for (const [key, value] of plan.writes) this.durable.set(key, structuredClone(value));
    return plan.result;
  }
}

describe("LiveClipGossip", () => {
  async function flush(times = 24): Promise<void> {
    for (let index = 0; index < times; index += 1) {
      await Promise.resolve();
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
  }

  it("independently sends an eligible Clip to connected Active Members except the immediate sender", async () => {
    const send = jest.fn(async () => {});
    const gossip = createLiveClipGossip({
      transport: {
        send,
        onMessage: jest.fn(),
        getConnectedPeers: () => ["sender", "unknown", "active"],
      } as any,
      membershipStatus: async (peerId) => peerId === "active" || peerId === "sender" ? "active" : "unknown",
      now: () => 1_000,
    });

    await gossip.forward(clip, "sender");

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(LIVE_CLIP_PROTOCOL, "active", expect.any(Uint8Array));
  });

  it("keeps a queued live send canceled after Auto Sync is disabled then re-enabled", async () => {
    let resolveMembership!: (status: "active") => void;
    const membership = new Promise<"active">((resolve) => { resolveMembership = resolve; });
    const send = jest.fn(async () => {});
    const gossip = createLiveClipGossip({
      transport: {
        send,
        onMessage: jest.fn(),
        getConnectedPeers: () => ["active"],
      } as any,
      membershipStatus: async () => await membership,
      now: () => 1_000,
    });

    const forwarding = gossip.forward(clip);
    await Promise.resolve();
    gossip.setAutoSync(false);
    gossip.setAutoSync(true);
    resolveMembership("active");
    await forwarding;

    expect(send).not.toHaveBeenCalled();
  });

  it.each(["electron", "android"] as const)("%s does not forward a delayed polling echo as a new Local Clip", async (platform) => {
    jest.useFakeTimers();
    let clipboardText = "initial clipboard";
    const handlers: Array<(from: string, frame: Uint8Array) => void> = [];
    const send = jest.fn(async () => {});
    const history = new MemoryHistoryStore(undefined, { now: () => 1_000 });
    const clipboard = createRuntimeClipboardService({
      capabilities: RUNTIME_CAPABILITIES[platform],
      history,
      getSenderId: () => "12D3KooWFNjtBxwwk1dbR9eAcDX11U9TsiU3Xho3fuY3e25tQzdy",
      readText: async () => clipboardText,
      writeText: async () => {},
      pollIntervalMs: 1_000,
      now: () => 1_000,
      makeId: () => "00000000-0000-4000-8000-000000000099",
    });
    const gossip = createLiveClipGossip({
      transport: {
        send,
        onMessage: (_protocol, handler) => handlers.push(handler),
        getConnectedPeers: () => ["source"],
      },
      membershipStatus: async () => "active",
      now: () => 1_000,
    });
    const manager = createClipboardSyncManager({
      clipboard,
      history,
      liveGossip: gossip,
      isActiveMember: async () => true,
      getLocalDeviceId: async () => "12D3KooWFNjtBxwwk1dbR9eAcDX11U9TsiU3Xho3fuY3e25tQzdy",
      now: () => 1_000,
    });

    try {
      manager.start();
      await jest.runOnlyPendingTimersAsync();
      handlers[0]("source", encodeLiveClipFrame({ clip }));
      for (let index = 0; index < 20; index += 1) await Promise.resolve();

      clipboardText = clip.content;
      await jest.advanceTimersByTimeAsync(1_000);
      for (let index = 0; index < 20; index += 1) await Promise.resolve();

      expect(await history.exportAll()).toEqual([clip]);
      expect(send).not.toHaveBeenCalled();
    } finally {
      await manager.stop();
      jest.useRealTimers();
    }
  });

  it("gossips across all runtime adapters and remains idempotent after durable restart", async () => {
    type Identity = { deviceId: string };
    type EmptyState = Record<string, never>;
    type AdapterFactory = typeof createElectronRuntimeAdapter<Identity, EmptyState, EmptyState>;
    type RuntimeName = "electron" | "android" | "chrome-extension";
    type RuntimeInstance = {
      manager: ReturnType<typeof createClipboardSyncManager>;
      gossip: ReturnType<typeof createLiveClipGossip>;
      clipboard: ReturnType<typeof createRuntimeClipboardService>;
      history: MemoryHistoryStore;
      platform: RuntimeName;
    };

    const identities: Record<RuntimeName, string> = {
      electron: "12D3KooWJ5oQ9G9kDMwrrzmVWwZnJryHJns8ovH8LYgDgJYJYyXy",
      android: "12D3KooWFNjtBxwwk1dbR9eAcDX11U9TsiU3Xho3fuY3e25tQzdy",
      "chrome-extension": "12D3KooWSuG4bhX3bg3oS1P2eS6NWRmArz98sQ5ALbqK2ABu54mF",
    };
    const names = Object.keys(identities) as RuntimeName[];
    const nameByPeerId = new Map(names.map((name) => [identities[name], name]));
    const handlers = new Map<string, Map<string, Array<(from: string, data: Uint8Array) => void>>>();
    const failedAttempts: Array<{ from: RuntimeName; to: RuntimeName }> = [];
    let failElectronToAndroid = true;

    const createNetwork = (name: RuntimeName): MessagingTransport => {
      const peerId = identities[name];
      handlers.set(peerId, new Map());
      return {
        async start() {},
        async stop() {},
        async send(protocol, target, data) {
          const targetName = nameByPeerId.get(target)!;
          if (name === "electron" && targetName === "android" && failElectronToAndroid) {
            failedAttempts.push({ from: name, to: targetName });
            throw new Error("recipient_failed");
          }
          handlers.get(target)?.get(protocol)?.forEach((handler) => handler(peerId, Uint8Array.from(data)));
        },
        async connect() {},
        onMessage(protocol, handler) {
          const byProtocol = handlers.get(peerId)!;
          byProtocol.set(protocol, [...(byProtocol.get(protocol) ?? []), handler]);
        },
        onPeerConnected() {},
        onPeerDisconnected() {},
        onSelfPeerUpdate() {},
        getConnectedPeers: () => names.filter((candidate) => candidate !== name).map((candidate) => identities[candidate]),
      };
    };

    const durableHistory = new Map<RuntimeName, Map<string, unknown>>(
      names.map((name) => [name, new Map<string, unknown>()]),
    );
    const durableAdapterStorage = new Map<RuntimeName, Map<string, unknown>>(
      names.map((name) => [name, new Map<string, unknown>()]),
    );
    const clipboardWrites = new Map<RuntimeName, string[]>(names.map((name) => [name, []]));
    const runtimes = new Map<RuntimeName, RuntimeInstance>();

    const factories: Record<RuntimeName, AdapterFactory> = {
      electron: createElectronRuntimeAdapter,
      android: createAndroidRuntimeAdapter,
      "chrome-extension": createChromeExtensionRuntimeAdapter,
    };

    const startRuntime = async (name: RuntimeName): Promise<RuntimeInstance> => {
      const storageState = durableAdapterStorage.get(name)!;
      let clipboardText = "";
      const network = createNetwork(name);
      const adapter = factories[name]({
        storage: {
          get: async <Value>(key: string) => structuredClone(storageState.get(key)) as Value | undefined,
          set: async <Value>(key: string, value: Value) => { storageState.set(key, structuredClone(value)); },
          remove: async (key: string) => { storageState.delete(key); },
        },
        identityKey: "identity",
        applicationStateKey: "application-state",
        initialApplicationState: () => ({}),
        clipboard: {
          readText: async () => clipboardText,
          writeText: async (text) => {
            clipboardText = text;
            clipboardWrites.get(name)!.push(text);
          },
        },
        notifications: { show: async () => {}, dismiss: async () => {}, onSelect: () => () => {} },
        lifecycle: { onShutdown: () => () => {}, openApprovalView: () => {} },
        network,
        clock: { now: () => 1_000, setTimeout, clearTimeout },
        publicState: { read: async () => ({}), publish: async () => {} },
        relays: { readAddresses: async () => [], updateAddresses: async (addresses) => addresses },
      });
      await adapter.identity.save({ deviceId: identities[name] });
      const history = new MemoryHistoryStore(
        new RestartableHistoryBackend(durableHistory.get(name)!),
        { now: () => 1_000, pinPersistence: adapter.capabilities.pinPersistence },
      );
      const clipboard = createRuntimeClipboardService({
        capabilities: adapter.capabilities,
        history,
        getSenderId: async () => (await adapter.identity.load())!.deviceId,
        readText: adapter.clipboard.readText,
        writeText: adapter.clipboard.writeText,
        pollIntervalMs: 60_000,
        now: () => 1_000,
        makeId: () => clip.id,
      });
      const gossip = createLiveClipGossip({
        transport: adapter.network,
        membershipStatus: async () => "active",
        now: () => 1_000,
      });
      const manager = createClipboardSyncManager({
        clipboard,
        history,
        liveGossip: gossip,
        isActiveMember: async () => true,
        getLocalDeviceId: async () => (await adapter.identity.load())!.deviceId,
        now: () => 1_000,
      });
      manager.start();
      const runtime = { manager, gossip, clipboard, history, platform: adapter.capabilities.platform };
      runtimes.set(name, runtime);
      return runtime;
    };

    try {
      await Promise.all(names.map(startRuntime));
      await flush(2);
      await runtimes.get("electron")!.clipboard.processLocalText(clip.content);
      await flush();
      const captured = (await runtimes.get("electron")!.history.exportAll())[0];

      expect(names.map((name) => runtimes.get(name)!.platform)).toEqual(names);
      for (const name of names) expect(await runtimes.get(name)!.history.exportAll()).toEqual([captured]);
      expect(clipboardWrites.get("android")).toEqual([clip.content]);
      expect(clipboardWrites.get("chrome-extension")).toEqual([clip.content]);
      expect(failedAttempts).toEqual([{ from: "electron", to: "android" }]);

      runtimes.get("android")!.manager.stop();
      const restartedAndroid = await startRuntime("android");
      failElectronToAndroid = false;
      await runtimes.get("electron")!.gossip.forward(captured);
      await flush();

      expect(await restartedAndroid.history.exportAll()).toEqual([captured]);
      expect(clipboardWrites.get("android")).toEqual([clip.content]);
    } finally {
      runtimes.forEach((runtime) => runtime.manager.stop());
    }
  });
});
