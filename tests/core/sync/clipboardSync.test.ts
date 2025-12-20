import { createClipboardSyncManager } from "../../../packages/core/sync/clipboardSync";
import type { ClipMessage } from "../../../packages/core/protocols/clip";
import type { Clip } from "../../../packages/core/models/Clip";

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
    });
    sync.start();

    const clip: Clip = {
      id: "c1",
      type: "text",
      content: "hello",
      timestamp: 1,
      senderId: "me",
    };
    localHandlers.forEach((h) => h(clip));
    await flushPromises();

    expect(history.add).toHaveBeenCalledWith(clip, "me", true);
    expect(broadcast).toHaveBeenCalledTimes(1);
    expect((broadcast.mock.calls[0] as any)[0]).toMatchObject({
      type: "CLIP",
      from: "me",
      clip,
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
      timestamp: 1,
      senderId: "me",
    };
    localHandlers.forEach((h) => h(clip));
    await flushPromises();

    expect(history.add).toHaveBeenCalled();
    expect(broadcast).not.toHaveBeenCalled();
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
      id: "r1",
      type: "text",
      content: "remote",
      timestamp: 1,
      senderId: "peer",
    };
    const msg: ClipMessage = {
      type: "CLIP",
      from: "peer",
      clip,
      sentAt: 1,
    };

    msgHandlers.forEach((h) => h(msg));
    await flushPromises();

    msgHandlers.forEach((h) => h(msg));
    await flushPromises();

    expect(history.add).toHaveBeenCalledTimes(1);
    expect(clipboard.writeRemoteClip).toHaveBeenCalledTimes(1);
  });
});
