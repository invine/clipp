import { createLiveClipGossip } from "../../../packages/core/sync/liveClipGossip";
import { LIVE_CLIP_PROTOCOL } from "../../../packages/core/protocols/liveClip";
import type { Clip } from "../../../packages/core/models/Clip";
import { createClipboardSyncManager } from "../../../packages/core/sync/clipboardSync";
import { MemoryHistoryStore } from "../../../packages/core/history/store";

const clip: Clip = {
  id: "00000000-0000-4000-8000-000000000001",
  type: "text",
  content: "hello",
  originPeerId: "12D3KooWJ5oQ9G9kDMwrrzmVWwZnJryHJns8ovH8LYgDgJYJYyXy",
  capturedAt: 1,
  shareExpiresAt: 86_400_001,
};

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

  it("completes a three-runtime gossip wave, suppresses loops, and remains idempotent after restart", async () => {
    type RuntimeName = "electron" | "android" | "extension";
    const names: RuntimeName[] = ["electron", "android", "extension"];
    const handlers = new Map<RuntimeName, (from: string, data: Uint8Array) => void>();
    const histories = new Map<RuntimeName, MemoryHistoryStore>();
    const localHandlers = new Map<RuntimeName, Array<(value: Clip) => void>>();
    const applied = new Map<RuntimeName, string[]>();
    const gossip = new Map<RuntimeName, ReturnType<typeof createLiveClipGossip>>();
    let failElectronToAndroid = true;

    const startRuntime = (name: RuntimeName) => {
      const history = histories.get(name) ?? new MemoryHistoryStore();
      histories.set(name, history);
      const handlersForRuntime: Array<(value: Clip) => void> = [];
      localHandlers.set(name, handlersForRuntime);
      const writes = applied.get(name) ?? [];
      applied.set(name, writes);
      const liveGossip = createLiveClipGossip({
        transport: {
          send: async (protocol: string, target: string, data: Uint8Array) => {
            if (protocol !== LIVE_CLIP_PROTOCOL) throw new Error("unexpected_protocol");
            if (name === "electron" && target === "android" && failElectronToAndroid) throw new Error("recipient_failed");
            handlers.get(target as RuntimeName)?.(name, data);
          },
          onMessage: (_protocol: string, listener: (from: string, data: Uint8Array) => void) => handlers.set(name, listener),
          getConnectedPeers: () => names.filter((peerId) => peerId !== name),
        } as any,
        membershipStatus: async () => "active",
        now: () => 1_000,
      });
      gossip.set(name, liveGossip);
      const manager = createClipboardSyncManager({
        clipboard: {
          start: jest.fn(), stop: jest.fn(), onLocalClip: (listener: (value: Clip) => void) => handlersForRuntime.push(listener),
          onRemoteClipWritten: jest.fn(), processLocalText: jest.fn(),
          writeRemoteClip: async (value: Clip, beforeWrite?: () => Promise<boolean>) => {
            if (!beforeWrite || await beforeWrite()) writes.push(value.id);
          },
        } as any,
        history,
        liveGossip,
        isActiveMember: async () => true,
        getLocalDeviceId: async () => name,
        now: () => 1_000,
      });
      manager.start();
      return manager;
    };

    const electron = startRuntime("electron");
    startRuntime("android");
    startRuntime("extension");
    localHandlers.get("electron")?.[0](clip);
    await flush();

    await Promise.all(names.map(async (name) => expect(await histories.get(name)?.exportAll()).toHaveLength(1)));
    expect(applied.get("android")).toEqual([clip.id]);
    expect(applied.get("extension")).toEqual([clip.id]);

    // Recreate Android's runtime against its durable history, then replay the
    // same immutable event. Its one prior live effect remains the only one.
    startRuntime("android");
    failElectronToAndroid = false;
    await gossip.get("electron")?.forward(clip);
    await flush();
    expect(await histories.get("android")?.exportAll()).toHaveLength(1);
    expect(applied.get("android")).toEqual([clip.id]);
    electron.stop();
  });
});
