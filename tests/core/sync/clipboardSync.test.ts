import { createClipboardSyncManager } from "../../../packages/core/sync/clipboardSync";
import {
  createClipMessage,
  type ClipMessage,
} from "../../../packages/core/protocols/clip";
import type { Clip } from "../../../packages/core/models/Clip";

const originPeerId = "12D3KooWJ5oQ9G9kDMwrrzmVWwZnJryHJns8ovH8LYgDgJYJYyXy";

describe("ClipboardSyncManager", () => {
  async function flushPromises(times = 6) {
    for (let i = 0; i < times; i++) {
      await Promise.resolve();
    }
  }

  test("stores local clips and broadcasts when autoSync enabled", async () => {
    const localHandlers: Array<(clip: Clip) => void> = [];
    const clipboard = {
      start: jest.fn(),
      stop: jest.fn(),
      onLocalClip: (cb: (clip: Clip) => void) => localHandlers.push(cb),
      onRemoteClipWritten: jest.fn(),
      processLocalText: jest.fn(),
      writeRemoteClip: jest.fn(async () => {}),
    } as any;

    const store = new Map<string, Clip>();
    const history = {
      add: jest.fn(async (clip: Clip) => {
        store.set(clip.id, clip);
      }),
      getById: jest.fn(async (id: string) => (store.has(id) ? ({ clip: store.get(id) } as any) : null)),
    } as any;

    const msgHandlers: Array<(msg: ClipMessage) => void> = [];
    const broadcast = jest.fn(async (_msg: ClipMessage) => {});
    const messaging = {
      broadcast,
      onMessage: (cb: (msg: ClipMessage) => void) => msgHandlers.push(cb),
    };

    const sync = createClipboardSyncManager({
      clipboard,
      history,
      messaging,
      getLocalDeviceId: async () => "me",
      now: () => 1_000,
    });
    sync.start();

    const clip: Clip = {
      id: "00000000-0000-4000-8000-000000000001",
      type: "text",
      content: "hello",
      originPeerId,
      capturedAt: 1,
      shareExpiresAt: 86_400_001,
      timestamp: 1,
      senderId: "me",
    };
    localHandlers.forEach((h) => h(clip));
    await flushPromises(24);

    expect(history.add).toHaveBeenCalledWith(clip, "me", true);
    expect(broadcast).toHaveBeenCalledTimes(1);
    expect((broadcast.mock.calls[0] as any)[0]).toMatchObject({
      type: "clip",
      from: "me",
      payload: {
        clip,
      },
    });
  });

  test("does not broadcast local clips when autoSync disabled", async () => {
    const localHandlers: Array<(clip: Clip) => void> = [];
    const clipboard = {
      start: jest.fn(),
      stop: jest.fn(),
      onLocalClip: (cb: (clip: Clip) => void) => localHandlers.push(cb),
      onRemoteClipWritten: jest.fn(),
      processLocalText: jest.fn(),
      writeRemoteClip: jest.fn(async () => {}),
    } as any;

    const history = {
      add: jest.fn(async () => {}),
      getById: jest.fn(async () => null),
    } as any;

    const broadcast = jest.fn(async (_msg: ClipMessage) => {});
    const messaging = {
      broadcast,
      onMessage: (_cb: (msg: ClipMessage) => void) => {},
    };

    const sync = createClipboardSyncManager({
      clipboard,
      history,
      messaging,
      getLocalDeviceId: async () => "me",
    });
    sync.setAutoSync(false);
    sync.start();

    const clip: Clip = {
      id: "c2",
      type: "text",
      content: "hello",
      originPeerId: "me",
      capturedAt: 1,
      shareExpiresAt: 86_400_001,
      timestamp: 1,
      senderId: "me",
    };
    localHandlers.forEach((h) => h(clip));
    await flushPromises();

    expect(history.add).toHaveBeenCalled();
    expect(broadcast).not.toHaveBeenCalled();
  });

  test("broadcasts a Share Now Clip when Auto Sync is disabled", async () => {
    const localHandlers: Array<(clip: Clip, options?: { shareNow?: boolean }) => void> = [];
    const clipboard = {
      start: jest.fn(),
      stop: jest.fn(),
      onLocalClip: (cb: (clip: Clip, options?: { shareNow?: boolean }) => void) => localHandlers.push(cb),
      onRemoteClipWritten: jest.fn(),
      processLocalText: jest.fn(),
      writeRemoteClip: jest.fn(async () => {}),
    } as any;
    const history = {
      add: jest.fn(async () => {}),
      getById: jest.fn(async () => null),
    } as any;
    const broadcast = jest.fn(async () => {});
    const sync = createClipboardSyncManager({
      clipboard,
      history,
      messaging: { broadcast, onMessage: jest.fn() },
      getLocalDeviceId: async () => "me",
      now: () => 1_000,
    });
    sync.setAutoSync(false);
    sync.start();

    const clip: Clip = {
      id: "00000000-0000-4000-8000-000000000003",
      type: "text",
      content: "share once",
      originPeerId,
      capturedAt: 1,
      shareExpiresAt: 86_400_001,
    };
    localHandlers.forEach((handler) => handler(clip, { shareNow: true }));
    await flushPromises();

    expect(history.add).toHaveBeenCalledWith(clip, "me", true);
    expect(broadcast).toHaveBeenCalledWith(expect.objectContaining({ payload: { clip } }));
  });

  test("keeps an expired recovered Share Now Clip local-only", async () => {
    const localHandlers: Array<(clip: Clip, options?: { shareNow?: boolean }) => void> = [];
    const clipboard = {
      start: jest.fn(),
      stop: jest.fn(),
      onLocalClip: (cb: (clip: Clip, options?: { shareNow?: boolean }) => void) => localHandlers.push(cb),
      onRemoteClipWritten: jest.fn(),
      processLocalText: jest.fn(),
      writeRemoteClip: jest.fn(async () => {}),
    } as any;
    const history = { add: jest.fn(async () => {}), getById: jest.fn(async () => null) } as any;
    const broadcast = jest.fn(async () => {});
    const sync = createClipboardSyncManager({
      clipboard,
      history,
      messaging: { broadcast, onMessage: jest.fn() },
      getLocalDeviceId: async () => "me",
      now: () => 200_000,
    });
    sync.setAutoSync(false);
    sync.start();

    const clip: Clip = {
      id: "00000000-0000-4000-8000-000000000004",
      type: "text",
      content: "expired share once",
      originPeerId,
      capturedAt: 1,
      shareExpiresAt: 2,
    };
    localHandlers.forEach((handler) => handler(clip, { shareNow: true }));
    await flushPromises();

    expect(history.add).toHaveBeenCalledWith(clip, "me", true);
    expect(broadcast).not.toHaveBeenCalled();
  });

  test("broadcasts a coordinator-stored local Clip after its idempotent acceptance", async () => {
    const localHandlers: Array<(clip: Clip) => void> = [];
    const clipboard = {
      start: jest.fn(), stop: jest.fn(), onLocalClip: (cb: (clip: Clip) => void) => localHandlers.push(cb),
      onRemoteClipWritten: jest.fn(), processLocalText: jest.fn(), writeRemoteClip: jest.fn(),
    } as any;
    const clip = {
      id: "00000000-0000-4000-8000-000000000013", type: "text" as const, content: "durable",
      originPeerId: "12D3KooWJ5oQ9G9kDMwrrzmVWwZnJryHJns8ovH8LYgDgJYJYyXy", capturedAt: 1_000, shareExpiresAt: 86_401_000,
    };
    const history = {
      accept: jest.fn(async () => ({ kind: "exact-duplicate", clip, liveHandled: false })),
    } as any;
    const broadcast = jest.fn(async () => {});
    const sync = createClipboardSyncManager({
      clipboard, history, messaging: { broadcast, onMessage: jest.fn() }, getLocalDeviceId: async () => "me", now: () => 1_000,
    });
    sync.start();
    localHandlers.forEach((handler) => handler(clip));
    await flushPromises();
    expect(broadcast).toHaveBeenCalledWith(expect.objectContaining({ payload: { clip } }));
  });

  test("deduplicates remote clips using history", async () => {
    const clipboard = {
      start: jest.fn(),
      stop: jest.fn(),
      onLocalClip: (_cb: (clip: Clip) => void) => {},
      onRemoteClipWritten: jest.fn(),
      processLocalText: jest.fn(),
      writeRemoteClip: jest.fn(async () => {}),
    } as any;

    const store = new Map<string, Clip>();
    const history = {
      add: jest.fn(async (clip: Clip) => {
        store.set(clip.id, clip);
      }),
      getById: jest.fn(async (id: string) => (store.has(id) ? ({ clip: store.get(id) } as any) : null)),
    } as any;

    const msgHandlers: Array<(msg: ClipMessage) => void> = [];
    const messaging = {
      broadcast: jest.fn(async () => {}),
      onMessage: (cb: (msg: ClipMessage) => void) => msgHandlers.push(cb),
    };

    const sync = createClipboardSyncManager({
      clipboard,
      history,
      messaging,
      getLocalDeviceId: async () => "me",
    });
    sync.start();

    const clip: Clip = {
      id: "00000000-0000-4000-8000-000000000011",
      type: "text",
      content: "remote",
      originPeerId: "12D3KooWJ5oQ9G9kDMwrrzmVWwZnJryHJns8ovH8LYgDgJYJYyXy",
      capturedAt: 1,
      shareExpiresAt: 86_400_001,
    };
    const msg: ClipMessage = createClipMessage({
      from: "peer",
      clip,
      sentAt: 1,
    });

    msgHandlers.forEach((h) => h(msg));
    await flushPromises();

    msgHandlers.forEach((h) => h(msg));
    await flushPromises();

    expect(history.add).toHaveBeenCalledTimes(1);
    expect(clipboard.writeRemoteClip).toHaveBeenCalledTimes(1);
  });

  test("cancels a queued remote clipboard write after local removal", async () => {
    const apply = jest.fn(async () => {});
    const clipboard = {
      start: jest.fn(), stop: jest.fn(), onLocalClip: jest.fn(), onRemoteClipWritten: jest.fn(),
      processLocalText: jest.fn(),
      writeRemoteClip: jest.fn(async (_clip: Clip, beforeWrite?: () => Promise<boolean>) => {
        if (!beforeWrite || await beforeWrite()) await apply();
      }),
    } as any;
    const handlers: Array<(msg: ClipMessage) => void> = [];
    const clip: Clip = {
      id: "00000000-0000-4000-8000-000000000015", type: "text", content: "removed",
      originPeerId, capturedAt: 1, shareExpiresAt: 86_400_001,
    };
    const history = {
      accept: jest.fn(async () => ({ kind: "newly-stored", clip, liveHandled: true })),
      getById: jest.fn(async () => null),
    } as any;
    const sync = createClipboardSyncManager({
      clipboard,
      history,
      messaging: { broadcast: jest.fn(), onMessage: (cb: (msg: ClipMessage) => void) => handlers.push(cb) },
      getLocalDeviceId: async () => "me",
    });
    sync.start();

    handlers.forEach((handler) => handler(createClipMessage({ from: "peer", clip, sentAt: 1 })));
    await flushPromises();

    expect(apply).not.toHaveBeenCalled();
  });

  test("forwards a newly stored remote Clip once without blocking its local application", async () => {
    const incoming: Array<(event: { from: string; clip: Clip }) => void> = [];
    const forward = jest.fn(async () => {});
    const clip: Clip = {
      id: "00000000-0000-4000-8000-000000000016", type: "text", content: "gossip",
      originPeerId, capturedAt: 1, shareExpiresAt: 86_400_001,
    };
    const clipboard = {
      start: jest.fn(), stop: jest.fn(), onLocalClip: jest.fn(), onRemoteClipWritten: jest.fn(), processLocalText: jest.fn(),
      writeRemoteClip: jest.fn(async (_clip: Clip, beforeWrite?: () => Promise<boolean>) => {
        if (!beforeWrite || await beforeWrite()) return;
      }),
    } as any;
    const history = {
      accept: jest.fn(async () => ({ kind: "newly-stored", clip, liveHandled: true })),
      getById: jest.fn(async () => ({ clip })),
    } as any;
    const sync = createClipboardSyncManager({
      clipboard,
      history,
      liveGossip: { start: jest.fn(), stop: jest.fn(), forward, onClip: (listener: (event: { from: string; clip: Clip }) => void) => incoming.push(listener) },
      isActiveMember: async () => true,
      getLocalDeviceId: async () => "me",
      now: () => 1_000,
    });
    sync.start();

    incoming[0]({ from: "sender", clip });
    await flushPromises(24);

    expect(history.accept).toHaveBeenCalledWith(clip, { liveHandled: true, admissionPriority: true });
    expect(clipboard.writeRemoteClip).toHaveBeenCalledWith(clip, expect.any(Function));
    expect(forward).toHaveBeenCalledWith(clip, "sender");
  });
});
