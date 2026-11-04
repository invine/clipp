import { MemoryHistoryStore } from "../../packages/core/history/store";
import type { Clip } from "../../packages/core/models/Clip";
import type { StreamingMessagingTransport } from "../../packages/core/messaging/transport";
import {
  decodeLiveClipFrame,
  encodeLiveClipFrame,
  LIVE_CLIP_PROTOCOL,
} from "../../packages/core/protocols/liveClip";
import { createClipboardSyncManager } from "../../packages/core/sync/clipboardSync";
import { createClipExchangeRuntime } from "../../packages/core/sync/clipExchangeRuntime";

const localPeerId = "12D3KooWJ5oQ9G9kDMwrrzmVWwZnJryHJns8ovH8LYgDgJYJYyXy";
const remotePeerId = "12D3KooWFNjtBxwwk1dbR9eAcDX11U9TsiU3Xho3fuY3e25tQzdy";

function clip(id: string, content: string, originPeerId = localPeerId): Clip {
  return {
    id,
    type: "text",
    content,
    originPeerId,
    capturedAt: 1,
    shareExpiresAt: 86_400_001,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function createOffscreenNetwork() {
  const messageHandlers = new Map<
    string,
    (from: string, frame: Uint8Array) => void
  >();
  const peerConnected: Array<(peerId: string) => void> = [];
  let sendLive: (
    peerId: string,
    data: Uint8Array
  ) => Promise<void> = async () => undefined;
  const transport: StreamingMessagingTransport = {
    start: async () => undefined,
    stop: async () => undefined,
    send: async (protocol, peerId, data) => {
      if (protocol.endsWith("clip/1.0.0")) await sendLive(peerId, data);
    },
    sendStream: async () => undefined,
    connect: async () => undefined,
    disconnect: async () => undefined,
    onMessage: (protocol, handler) => messageHandlers.set(protocol, handler),
    onStream: () => undefined,
    onPeerConnected: (handler) => peerConnected.push(handler),
    onPeerDisconnected: () => undefined,
    onSelfPeerUpdate: () => undefined,
    getConnectedPeers: () => [remotePeerId],
  };
  return {
    transport,
    sendLive(handler: (peerId: string, data: Uint8Array) => Promise<void>) {
      sendLive = handler;
    },
    receive(protocol: string, from: string, frame: Uint8Array) {
      messageHandlers.get(protocol)?.(from, frame);
    },
    peerConnected,
  };
}

function createBackgroundFixture() {
  let offscreen = createOffscreenNetwork();
  const originalOffscreen = offscreen;
  const history = new MemoryHistoryStore(undefined, { now: () => 1_000 });
  const localListeners: Array<
    (value: Clip, options?: { shareNow?: boolean }) => void
  > = [];
  const remoteApplications: Clip[] = [];
  const clipboard = {
    start: jest.fn(),
    stop: jest.fn(async () => undefined),
    onLocalClip: (
      listener: (value: Clip, options?: { shareNow?: boolean }) => void
    ) => localListeners.push(listener),
    onRemoteClipWritten: jest.fn(),
    reuseLocalClip: jest.fn(),
    writeRemoteClip: jest.fn(
      async (value: Clip, eligible?: () => Promise<boolean>) => {
        if (eligible && !(await eligible())) return false;
        remoteApplications.push(value);
        return true;
      }
    ),
    processLocalText: jest.fn(),
    clearHistory: jest.fn(),
  } as any;

  // This stable background-owned proxy mirrors extensionNetwork: protocol
  // callbacks are registered on whichever offscreen document currently owns
  // libp2p, while the background keeps the shared exchange owner.
  const backgroundNetwork: StreamingMessagingTransport = {
    start: async () => offscreen.transport.start(),
    stop: async () => offscreen.transport.stop(),
    send: async (...args) => offscreen.transport.send(...args),
    sendStream: async (...args) => offscreen.transport.sendStream(...args),
    connect: async (...args) => offscreen.transport.connect(...args),
    disconnect: async (...args) => offscreen.transport.disconnect?.(...args),
    onMessage: (protocol, handler) =>
      offscreen.transport.onMessage(protocol, handler),
    onStream: (protocol, handler) =>
      offscreen.transport.onStream(protocol, handler),
    onPeerConnected: (handler) => offscreen.transport.onPeerConnected(handler),
    onPeerDisconnected: (handler) =>
      offscreen.transport.onPeerDisconnected(handler),
    onSelfPeerUpdate: (handler) =>
      offscreen.transport.onSelfPeerUpdate(handler),
    getConnectedPeers: () => offscreen.transport.getConnectedPeers(),
  };
  const clipboardSync = createClipboardSyncManager({
    clipboard,
    history,
    getLocalDeviceId: async () => localPeerId,
    now: () => 1_000,
  });
  const exchange = createClipExchangeRuntime({
    clipboardSync,
    history,
    getLocalDeviceId: async () => localPeerId,
    membershipStatus: async () => "active",
    now: () => 1_000,
  });

  return {
    history,
    localListeners,
    remoteApplications,
    clipboard,
    exchange,
    backgroundNetwork,
    originalOffscreen,
    replaceOffscreen(next: ReturnType<typeof createOffscreenNetwork>) {
      offscreen = next;
      return next;
    },
    currentOffscreen: () => offscreen,
  };
}

async function flush(): Promise<void> {
  for (let index = 0; index < 8; index += 1) {
    await Promise.resolve();
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

describe("Chrome background/offscreen Clip exchange ownership", () => {
  it("does not apply an old offscreen callback after the background attaches a replacement", async () => {
    const fixture = createBackgroundFixture();
    fixture.exchange.startLocalCapture();
    await fixture.exchange.activateReadyTransport(fixture.backgroundNetwork);
    const oldCallback = fixture.originalOffscreen.receive.bind(
      fixture.originalOffscreen
    );
    const incoming = clip(
      "00000000-0000-4000-8000-000000000701",
      "offscreen inbound",
      remotePeerId
    );
    const stored = deferred<void>();
    const release = deferred<void>();
    const accept = fixture.history.accept.bind(fixture.history);
    fixture.history.accept = async (value, options) => {
      if (value.id === incoming.id) {
        stored.resolve();
        await release.promise;
      }
      return await accept(value, options);
    };

    oldCallback(
      LIVE_CLIP_PROTOCOL,
      remotePeerId,
      encodeLiveClipFrame({ clip: incoming })
    );
    await stored.promise;
    const replacement = fixture.replaceOffscreen(createOffscreenNetwork());
    await fixture.exchange.retireTransport();
    await fixture.exchange.activateReadyTransport(fixture.backgroundNetwork);
    replacement.receive(
      LIVE_CLIP_PROTOCOL,
      remotePeerId,
      encodeLiveClipFrame({
        clip: clip(
          "00000000-0000-4000-8000-000000000702",
          "current offscreen inbound",
          remotePeerId
        ),
      })
    );
    release.resolve();
    await flush();

    expect(fixture.remoteApplications.map((value) => value.id)).toEqual([
      "00000000-0000-4000-8000-000000000702",
    ]);
    await fixture.exchange.stop();
  });

  it("keeps the same Share Now Clip pending across an offscreen replacement until the new send completes", async () => {
    const fixture = createBackgroundFixture();
    const receiver = new MemoryHistoryStore(undefined, { now: () => 1_000 });
    const oldResult = deferred<void>();
    const currentResult = deferred<void>();
    const ids: string[] = [];
    fixture.originalOffscreen.sendLive(async (_peerId, data) => {
      const frame = decodeLiveClipFrame(data);
      if (frame) {
        ids.push(frame.clip.id);
        await receiver.accept(frame.clip, { liveHandled: true });
      }
      await oldResult.promise;
    });

    fixture.exchange.startLocalCapture();
    await fixture.exchange.activateReadyTransport(fixture.backgroundNetwork);
    fixture.exchange.setAutoSync(false);
    const shared = clip(
      "00000000-0000-4000-8000-000000000703",
      "offscreen Share Now"
    );
    fixture.localListeners[0](shared, { shareNow: true });
    await flush();
    expect((await fixture.history.getById(shared.id))?.shareNowPending).toBe(
      true
    );

    const replacement = fixture.replaceOffscreen(createOffscreenNetwork());
    replacement.sendLive(async (_peerId, data) => {
      const frame = decodeLiveClipFrame(data);
      if (frame) {
        ids.push(frame.clip.id);
        await receiver.accept(frame.clip, { liveHandled: true });
      }
      await currentResult.promise;
    });
    await fixture.exchange.retireTransport();
    await fixture.exchange.activateReadyTransport(fixture.backgroundNetwork);
    await flush();
    expect(ids).toEqual([shared.id, shared.id]);
    expect(await receiver.query()).toHaveLength(1);

    oldResult.reject(new Error("offscreen_send_result_lost"));
    await flush();
    expect((await fixture.history.getById(shared.id))?.shareNowPending).toBe(
      true
    );
    currentResult.resolve();
    await flush();
    expect((await fixture.history.getById(shared.id))?.shareNowPending).toBe(
      false
    );
    await fixture.exchange.stop();
  });
});
