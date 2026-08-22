import { MemoryHistoryStore } from "../../../packages/core/history/store";
import { createClipCaptureCoordinator } from "../../../packages/core/clipboard/captureCoordinator";
import { createManualClipboardService } from "../../../packages/core/clipboard/service";
import type { Clip } from "../../../packages/core/models/Clip";
import {
  decodeLiveClipFrame,
  encodeLiveClipFrame,
  LIVE_CLIP_PROTOCOL,
} from "../../../packages/core/protocols/liveClip";
import { createClipboardSyncManager } from "../../../packages/core/sync/clipboardSync";
import { createLiveClipGossip } from "../../../packages/core/sync/liveClipGossip";

const originPeerId = "12D3KooWJ5oQ9G9kDMwrrzmVWwZnJryHJns8ovH8LYgDgJYJYyXy";

function makeClip(id: string, content: string, shareExpiresAt = 86_400_001): Clip {
  return { id, type: "text", content, originPeerId, capturedAt: 1, shareExpiresAt };
}

function createClipboardHarness(beforeWrite?: (clip: Clip) => Promise<void>) {
  const localHandlers: Array<(clip: Clip, options?: { shareNow?: boolean }) => void> = [];
  const applied: Clip[] = [];
  return {
    localHandlers,
    applied,
    clipboard: {
      start: jest.fn(),
      stop: jest.fn(),
      onLocalClip: (listener: (clip: Clip, options?: { shareNow?: boolean }) => void) => localHandlers.push(listener),
      onRemoteClipWritten: jest.fn(),
      processLocalText: jest.fn(),
      writeRemoteClip: jest.fn(async (clip: Clip, eligible?: () => Promise<boolean>) => {
        await beforeWrite?.(clip);
        if (!eligible || await eligible()) {
          applied.push(clip);
          return true;
        }
        return false;
      }),
    } as any,
  };
}

function createGossipHarness(initialPeers: string[] = ["recipient"]) {
  const peers = [...initialPeers];
  const handlers: Array<(from: string, frame: Uint8Array) => void> = [];
  const connectedHandlers: Array<(peerId: string) => void> = [];
  const send = jest.fn(async (_protocol: string, _target: string, _frame: Uint8Array) => {});
  const gossip = createLiveClipGossip({
    transport: {
      send,
      onMessage: (_protocol, handler) => handlers.push(handler),
      getConnectedPeers: () => peers,
      onPeerConnected: (handler) => connectedHandlers.push(handler),
    },
    membershipStatus: async () => "active",
    now: () => 1_000,
  });
  return {
    gossip,
    send,
    connect(peerId: string) {
      peers.push(peerId);
      connectedHandlers.forEach((handler) => handler(peerId));
    },
    deliver(from: string, clip: Clip) {
      const frame = encodeLiveClipFrame({ clip });
      handlers.forEach((handler) => handler(from, frame));
    },
  };
}

describe("ClipboardSyncManager", () => {
  async function flush(times = 12): Promise<void> {
    for (let index = 0; index < times; index += 1) {
      await Promise.resolve();
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
  }

  function createHistory(): MemoryHistoryStore {
    return new MemoryHistoryStore(undefined, { now: () => 1_000 });
  }

  test("stores and sends Local Clips when Auto Sync is enabled", async () => {
    const history = createHistory();
    const { clipboard, localHandlers } = createClipboardHarness();
    const { gossip, send } = createGossipHarness();
    const sync = createClipboardSyncManager({
      clipboard, history, liveGossip: gossip,
      getLocalDeviceId: async () => originPeerId,
      now: () => 1_000,
    });
    sync.start();
    const clip = makeClip("00000000-0000-4000-8000-000000000001", "hello");

    localHandlers[0](clip);
    await flush();

    expect((await history.getById(clip.id))?.clip).toEqual(clip);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toBe(LIVE_CLIP_PROTOCOL);
    expect(decodeLiveClipFrame(send.mock.calls[0][2])).toEqual({ clip });
  });

  test("keeps Local Clips local when Auto Sync is disabled", async () => {
    const history = createHistory();
    const { clipboard, localHandlers } = createClipboardHarness();
    const { gossip, send } = createGossipHarness();
    const sync = createClipboardSyncManager({
      clipboard, history, liveGossip: gossip,
      getLocalDeviceId: async () => originPeerId,
      now: () => 1_000,
    });
    sync.setAutoSync(false);
    sync.start();
    const clip = makeClip("00000000-0000-4000-8000-000000000002", "local only");

    localHandlers[0](clip);
    await flush();

    expect((await history.getById(clip.id))?.clip).toEqual(clip);
    expect(await history.getById(clip.id)).toEqual(expect.objectContaining({ shareNowPending: false }));
    expect(send).not.toHaveBeenCalled();
  });

  test("keeps local capture available without network side effects during identity recovery", async () => {
    const history = createHistory();
    const { clipboard, localHandlers } = createClipboardHarness();
    const { gossip, send } = createGossipHarness();
    const sync = createClipboardSyncManager({
      clipboard, history, liveGossip: gossip,
      getLocalDeviceId: async () => originPeerId,
      now: () => 1_000,
    });
    sync.startLocalOnly();
    const clip = makeClip("00000000-0000-4000-8000-000000000021", "recovery capture");

    localHandlers[0](clip);
    await flush();

    expect((await history.getById(clip.id))?.clip).toEqual(clip);
    expect(await history.getById(clip.id)).toEqual(expect.objectContaining({ shareNowPending: false }));
    expect(send).not.toHaveBeenCalled();
  });

  test("sends a Share Now Clip when Auto Sync is disabled", async () => {
    const history = createHistory();
    const { clipboard, localHandlers } = createClipboardHarness();
    const { gossip, send } = createGossipHarness();
    const sync = createClipboardSyncManager({
      clipboard, history, liveGossip: gossip,
      getLocalDeviceId: async () => originPeerId,
      now: () => 1_000,
    });
    sync.setAutoSync(false);
    sync.start();
    const clip = makeClip("00000000-0000-4000-8000-000000000003", "share once");

    localHandlers[0](clip, { shareNow: true });
    await flush();

    expect((await history.getById(clip.id))?.clip).toEqual(clip);
    expect(send).toHaveBeenCalledTimes(1);
  });

  test("offers a retained Share Now Clip after restart and reconnect while Auto Sync remains disabled", async () => {
    const history = createHistory();
    const firstClipboard = createClipboardHarness();
    const firstGossip = createGossipHarness([]);
    const firstSync = createClipboardSyncManager({
      clipboard: firstClipboard.clipboard,
      history,
      liveGossip: firstGossip.gossip,
      getLocalDeviceId: async () => originPeerId,
      now: () => 1_000,
    });
    firstSync.setAutoSync(false);
    firstSync.start();
    const clip = makeClip("00000000-0000-4000-8000-000000000024", "share after reconnect");

    firstClipboard.localHandlers[0](clip, { shareNow: true });
    await flush();

    expect(firstGossip.send).not.toHaveBeenCalled();
    expect(await history.getById(clip.id)).toEqual(expect.objectContaining({ shareNowPending: true }));
    await firstSync.stop();

    const restartedClipboard = createClipboardHarness();
    const restartedGossip = createGossipHarness([]);
    const restartedSync = createClipboardSyncManager({
      clipboard: restartedClipboard.clipboard,
      history,
      liveGossip: restartedGossip.gossip,
      getLocalDeviceId: async () => originPeerId,
      now: () => 1_000,
    });
    restartedSync.setAutoSync(false);
    restartedSync.start();

    restartedGossip.connect("recipient");
    await flush();

    expect(restartedGossip.send).toHaveBeenCalledTimes(1);
    expect(decodeLiveClipFrame(restartedGossip.send.mock.calls[0][2])).toEqual({ clip });
    expect(await history.getById(clip.id)).toEqual(expect.objectContaining({ shareNowPending: false }));
  });

  test("keeps an expired recovered Share Now Clip local", async () => {
    const history = createHistory();
    const { clipboard, localHandlers } = createClipboardHarness();
    const { gossip, send } = createGossipHarness();
    const sync = createClipboardSyncManager({
      clipboard, history, liveGossip: gossip,
      getLocalDeviceId: async () => originPeerId,
      now: () => 200_000,
    });
    sync.setAutoSync(false);
    sync.start();
    const clip = makeClip("00000000-0000-4000-8000-000000000004", "expired share once", 2);

    localHandlers[0](clip, { shareNow: true });
    await flush();

    expect((await history.getById(clip.id))?.clip).toEqual(clip);
    expect(await history.getById(clip.id)).toEqual(expect.objectContaining({ shareNowPending: false }));
    expect(send).not.toHaveBeenCalled();
  });

  test("sends a coordinator-stored Local Clip after idempotent acceptance", async () => {
    const history = createHistory();
    const clip = makeClip("00000000-0000-4000-8000-000000000013", "durable");
    await history.accept(clip, { liveHandled: true });
    const { clipboard, localHandlers } = createClipboardHarness();
    const { gossip, send } = createGossipHarness();
    const sync = createClipboardSyncManager({
      clipboard, history, liveGossip: gossip,
      getLocalDeviceId: async () => originPeerId,
      now: () => 1_000,
    });
    sync.start();

    localHandlers[0](clip);
    await flush();

    expect(send).toHaveBeenCalledTimes(1);
  });

  test("applies a live Clip at most once", async () => {
    const history = createHistory();
    const { clipboard, applied } = createClipboardHarness();
    const { gossip, deliver } = createGossipHarness([]);
    const sync = createClipboardSyncManager({
      clipboard, history, liveGossip: gossip,
      isActiveMember: async () => true,
      getLocalDeviceId: async () => originPeerId,
      now: () => 1_000,
    });
    sync.start();
    const clip = makeClip("00000000-0000-4000-8000-000000000011", "remote");

    deliver("sender", clip);
    deliver("sender", clip);
    await flush();

    expect(await history.exportAll()).toEqual([clip]);
    expect(applied).toEqual([clip]);
  });

  test("reports successful and failed live clipboard application only after durable acceptance", async () => {
    const history = createHistory();
    const failedId = "00000000-0000-4000-8000-000000000015";
    const { clipboard } = createClipboardHarness(async (clip) => {
      if (clip.id === failedId) throw new Error("clipboard unavailable");
    });
    const { gossip, deliver } = createGossipHarness([]);
    const applications: Array<{ id: string; result: string; retained: boolean }> = [];
    const sync = createClipboardSyncManager({
      clipboard,
      history,
      liveGossip: gossip,
      isActiveMember: async () => true,
      getLocalDeviceId: async () => originPeerId,
      now: () => 1_000,
      onLiveClipboardApplication: async (clip, result) => {
        applications.push({
          id: clip.id,
          result,
          retained: (await history.getById(clip.id)) !== null,
        });
      },
    });
    sync.start();
    const applied = makeClip("00000000-0000-4000-8000-000000000014", "applied");
    const failed = makeClip(failedId, "failed");

    deliver("sender", applied);
    deliver("sender", failed);
    await flush();

    expect(applications).toEqual([
      { id: applied.id, result: "applied", retained: true },
      { id: failed.id, result: "failed", retained: true },
    ]);
  });

  test("shutdown waits for and cancels an authorized queued live receive", async () => {
    const history = createHistory();
    const { clipboard } = createClipboardHarness();
    const { gossip, deliver } = createGossipHarness([]);
    let releaseMembership!: () => void;
    let markMembershipCheckStarted!: () => void;
    const membershipCheckStarted = new Promise<void>((resolve) => { markMembershipCheckStarted = resolve; });
    const membershipGate = new Promise<void>((resolve) => { releaseMembership = resolve; });
    const sync = createClipboardSyncManager({
      clipboard,
      history,
      liveGossip: gossip,
      isActiveMember: async () => {
        markMembershipCheckStarted();
        await membershipGate;
        return true;
      },
      getLocalDeviceId: async () => originPeerId,
      now: () => 1_000,
    });
    sync.start();
    const clip = makeClip("00000000-0000-4000-8000-000000000020", "cancel at shutdown");

    deliver("sender", clip);
    await membershipCheckStarted;
    const stopped = Promise.resolve(sync.stop());
    releaseMembership();
    await stopped;
    await flush();

    expect(await history.getById(clip.id)).toBeNull();
  });

  test("shutdown waits for an in-flight local capture before rotation can snapshot history", async () => {
    const history = createHistory();
    const originalAccept = history.accept.bind(history);
    let releaseAccept!: () => void;
    let markAcceptStarted!: () => void;
    const acceptStarted = new Promise<void>((resolve) => { markAcceptStarted = resolve; });
    const acceptGate = new Promise<void>((resolve) => { releaseAccept = resolve; });
    history.accept = async (...args) => {
      markAcceptStarted();
      await acceptGate;
      return originalAccept(...args);
    };
    const { clipboard, localHandlers } = createClipboardHarness();
    const sync = createClipboardSyncManager({
      clipboard,
      history,
      getLocalDeviceId: async () => originPeerId,
      now: () => 1_000,
    });
    sync.startLocalOnly();
    const clip = makeClip("00000000-0000-4000-8000-000000000022", "drain local capture");
    localHandlers[0](clip);
    await acceptStarted;

    let stopped = false;
    const stopping = sync.stop().then(() => { stopped = true; });
    await Promise.resolve();
    expect(stopped).toBe(false);
    releaseAccept();
    await stopping;

    expect((await history.getById(clip.id))?.clip).toEqual(clip);
  });

  test("rotation cleanup stages pending captures and restores them when activation fails", async () => {
    const history = createHistory();
    const captureCoordinator = createClipCaptureCoordinator({
      history: { accept: async () => { throw new Error("storage unavailable"); } },
      originPeerId: () => originPeerId,
      makeId: () => "00000000-0000-4000-8000-000000000023",
    });
    const clipboard = createManualClipboardService({
      getSenderId: () => originPeerId,
      captureCoordinator,
    });
    const sync = createClipboardSyncManager({
      clipboard,
      history,
      getLocalDeviceId: async () => originPeerId,
      now: () => 1_000,
    });
    sync.startLocalOnly();

    await clipboard.processLocalText("pending recovery capture");
    expect(captureCoordinator.pending()).toEqual([
      expect.objectContaining({ originPeerId, content: "pending recovery capture" }),
    ]);

    const failedCleanup = await sync.prepareIdentityRotationCleanup();

    expect(captureCoordinator.pending()).toEqual([]);
    await failedCleanup.rollback();
    expect(captureCoordinator.pending()).toEqual([
      expect.objectContaining({ originPeerId, content: "pending recovery capture" }),
    ]);

    await sync.prepareIdentityRotationCleanup();
    expect(captureCoordinator.pending()).toEqual([]);
    expect(await history.exportAll()).toEqual([]);
  });

  test("cancels a queued clipboard write after local removal", async () => {
    const history = createHistory();
    const clip = makeClip("00000000-0000-4000-8000-000000000015", "removed");
    const { clipboard, applied } = createClipboardHarness(async () => history.remove(clip.id));
    const { gossip, deliver } = createGossipHarness([]);
    const sync = createClipboardSyncManager({
      clipboard, history, liveGossip: gossip,
      isActiveMember: async () => true,
      getLocalDeviceId: async () => originPeerId,
      now: () => 1_000,
    });
    sync.start();

    deliver("sender", clip);
    await flush();

    expect(applied).toEqual([]);
    expect(await history.getById(clip.id)).toBeNull();
  });

  test("keeps a committed clipboard write canceled after Auto Sync is disabled then re-enabled", async () => {
    const history = createHistory();
    const clip = makeClip("00000000-0000-4000-8000-000000000018", "stale live effect");
    let sync!: ReturnType<typeof createClipboardSyncManager>;
    const { clipboard, applied } = createClipboardHarness(async () => {
      sync.setAutoSync(false);
      sync.setAutoSync(true);
    });
    const { gossip, deliver } = createGossipHarness([]);
    sync = createClipboardSyncManager({
      clipboard,
      history,
      liveGossip: gossip,
      isActiveMember: async () => true,
      getLocalDeviceId: async () => originPeerId,
      now: () => 1_000,
    });
    sync.start();

    deliver("sender", clip);
    await flush();

    expect(await history.exportAll()).toEqual([clip]);
    expect(applied).toEqual([]);
  });

  test("forwards a newly stored Remote Clip and applies it locally", async () => {
    const history = createHistory();
    const { clipboard, applied } = createClipboardHarness();
    const { gossip, deliver, send } = createGossipHarness(["sender", "other"]);
    const sync = createClipboardSyncManager({
      clipboard, history, liveGossip: gossip,
      isActiveMember: async () => true,
      getLocalDeviceId: async () => originPeerId,
      now: () => 1_000,
    });
    sync.start();
    const clip = makeClip("00000000-0000-4000-8000-000000000016", "gossip");

    deliver("sender", clip);
    await flush();

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][1]).toBe("other");
    expect(applied).toEqual([clip]);
  });

  test("ignores inbound live Clips while Auto Sync is disabled", async () => {
    const history = createHistory();
    const { clipboard, applied } = createClipboardHarness();
    const { gossip, deliver, send } = createGossipHarness(["other"]);
    const sync = createClipboardSyncManager({
      clipboard, history, liveGossip: gossip,
      isActiveMember: async () => true,
      getLocalDeviceId: async () => originPeerId,
      now: () => 1_000,
    });
    sync.setAutoSync(false);
    sync.start();
    const clip = makeClip("00000000-0000-4000-8000-000000000017", "disabled");

    deliver("sender", clip);
    await flush();

    expect(await history.getById(clip.id)).toBeNull();
    expect(applied).toEqual([]);
    expect(send).not.toHaveBeenCalled();
  });
});
