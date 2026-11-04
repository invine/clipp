import { MemoryHistoryStore } from "../../../packages/core/history/store";
import type { Clip } from "../../../packages/core/models/Clip";
import {
  encodeHistoryBatchFrame,
  HISTORY_PROTOCOL,
  HISTORY_REQUEST_PROTOCOL,
} from "../../../packages/core/protocols/history";
import {
  encodeLiveClipFrame,
  LIVE_CLIP_PROTOCOL,
  decodeLiveClipFrame,
} from "../../../packages/core/protocols/liveClip";
import { createClipboardSyncManager } from "../../../packages/core/sync/clipboardSync";
import { createClipExchangeRuntime } from "../../../packages/core/sync/clipExchangeRuntime";

const localPeerId = "12D3KooWJ5oQ9G9kDMwrrzmVWwZnJryHJns8ovH8LYgDgJYJYyXy";
const clip = (id: string, content: string): Clip => ({
  id,
  type: "text",
  content,
  originPeerId: localPeerId,
  capturedAt: 1,
  shareExpiresAt: 86_400_001,
});

function harness() {
  const localListeners: Array<
    (value: Clip, options?: { shareNow?: boolean }) => void
  > = [];
  const deliveries: Array<{
    protocol: string;
    peerId: string;
    data?: Uint8Array;
  }> = [];
  const connections: Array<(peerId: string) => void> = [];
  let messageHandler: ((peerId: string, data: Uint8Array) => void) | undefined;
  let streamHandlers = new Map<
    string,
    (peerId: string, frames: AsyncIterable<Uint8Array>) => Promise<void>
  >();
  const history = new MemoryHistoryStore(undefined, { now: () => 1_000 });
  const clipboard = {
    start: jest.fn(),
    stop: jest.fn(async () => undefined),
    onLocalClip: (
      listener: (value: Clip, options?: { shareNow?: boolean }) => void
    ) => localListeners.push(listener),
    onRemoteClipWritten: jest.fn(),
    reuseLocalClip: jest.fn(),
    writeRemoteClip: jest.fn(async () => true),
    processLocalText: jest.fn(),
    clearHistory: jest.fn(),
  } as any;
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
  const transport = {
    start: jest.fn(async () => undefined),
    stop: jest.fn(async () => undefined),
    send: jest.fn(
      async (protocol: string, peerId: string, data: Uint8Array) => {
        deliveries.push({ protocol, peerId, data });
      }
    ),
    sendStream: jest.fn(
      async (
        protocol: string,
        peerId: string,
        frames: AsyncIterable<Uint8Array>
      ) => {
        for await (const data of frames)
          deliveries.push({ protocol, peerId, data });
      }
    ),
    connect: jest.fn(async () => undefined),
    disconnect: jest.fn(async () => undefined),
    onMessage: jest.fn((_protocol: string, handler: typeof messageHandler) => {
      messageHandler = handler;
    }),
    onStream: jest.fn(
      (
        protocol: string,
        handler: (
          peerId: string,
          frames: AsyncIterable<Uint8Array>
        ) => Promise<void>
      ) => {
        streamHandlers.set(protocol, handler);
      }
    ),
    onPeerConnected: jest.fn((handler: (peerId: string) => void) =>
      connections.push(handler)
    ),
    onPeerDisconnected: jest.fn(),
    onSelfPeerUpdate: jest.fn(),
    getConnectedPeers: jest.fn(() => ["member"]),
  };
  return {
    clipboard,
    localListeners,
    deliveries,
    connections,
    history,
    exchange,
    transport,
    messageHandler: () => messageHandler,
    streamHandlers,
  };
}

async function flush(): Promise<void> {
  for (let index = 0; index < 8; index += 1) {
    await Promise.resolve();
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("Clip exchange runtime", () => {
  it("keeps local capture active until a ready transport activates both exchanges", async () => {
    const fixture = harness();
    const readiness = deferred<undefined>();
    fixture.transport.start.mockImplementation(() => readiness.promise);
    fixture.exchange.startLocalCapture();
    const starting = fixture.transport.start();
    const captured = clip(
      "00000000-0000-4000-8000-000000000601",
      "local while starting"
    );
    fixture.localListeners[0](captured);
    await flush();

    expect((await fixture.history.getById(captured.id))?.clip).toEqual(
      captured
    );
    expect(fixture.clipboard.start).toHaveBeenCalledTimes(1);
    expect(fixture.deliveries).toEqual([]);
    expect(fixture.transport.send).not.toHaveBeenCalled();

    readiness.resolve(undefined);
    await starting;
    await fixture.exchange.activateReadyTransport(fixture.transport);
    const exchanged = clip(
      "00000000-0000-4000-8000-000000000602",
      "after ready"
    );
    fixture.localListeners[0](exchanged);
    await flush();

    expect(fixture.transport.onMessage).toHaveBeenCalledWith(
      LIVE_CLIP_PROTOCOL,
      expect.any(Function)
    );
    expect(fixture.transport.onStream).toHaveBeenCalledWith(
      HISTORY_PROTOCOL,
      expect.any(Function)
    );
    expect(fixture.transport.onStream).toHaveBeenCalledWith(
      HISTORY_REQUEST_PROTOCOL,
      expect.any(Function)
    );
    expect(
      fixture.deliveries.some((entry) => entry.protocol === HISTORY_PROTOCOL)
    ).toBe(true);
    const live = fixture.deliveries.find(
      (entry) => entry.protocol === LIVE_CLIP_PROTOCOL
    );
    expect(live?.peerId).toBe("member");
    expect(decodeLiveClipFrame(live?.data ?? new Uint8Array())).toEqual({
      clip: exchanged,
    });

    await fixture.exchange.stop();
  });

  it("gates live and history exchange with Auto Sync and leaves capture running", async () => {
    const fixture = harness();
    fixture.exchange.startLocalCapture();
    await fixture.exchange.activateReadyTransport(fixture.transport);
    fixture.deliveries.length = 0;
    fixture.exchange.setAutoSync(false);

    const local = clip(
      "00000000-0000-4000-8000-000000000603",
      "local while paused"
    );
    fixture.localListeners[0](local);
    await flush();
    fixture.connections.forEach((handler) => handler("member"));
    await flush();

    expect((await fixture.history.getById(local.id))?.clip).toEqual(local);
    expect(fixture.clipboard.start).toHaveBeenCalledTimes(1);
    expect(fixture.deliveries).toEqual([]);

    fixture.exchange.setAutoSync(true);
    const fresh = clip("00000000-0000-4000-8000-000000000604", "resumed");
    fixture.localListeners[0](fresh);
    await flush();
    expect(
      fixture.deliveries.some((entry) => entry.protocol === HISTORY_PROTOCOL)
    ).toBe(true);
    expect(
      fixture.deliveries.some((entry) => entry.protocol === LIVE_CLIP_PROTOCOL)
    ).toBe(true);

    await fixture.exchange.stop();
  });

  it("retires exchange but keeps local capture available", async () => {
    const fixture = harness();
    fixture.exchange.startLocalCapture();
    await fixture.exchange.activateReadyTransport(fixture.transport);
    await fixture.exchange.retireTransport();
    fixture.deliveries.length = 0;

    const local = clip(
      "00000000-0000-4000-8000-000000000605",
      "after transport retirement"
    );
    fixture.localListeners[0](local);
    await flush();

    expect((await fixture.history.getById(local.id))?.clip).toEqual(local);
    expect(fixture.clipboard.start).toHaveBeenCalledTimes(1);
    expect(fixture.deliveries).toEqual([]);
    await fixture.exchange.stop();
  });

  it("stops without starting local capture when shutdown precedes startup", async () => {
    const fixture = harness();
    await fixture.exchange.stop();
    expect(fixture.clipboard.start).not.toHaveBeenCalled();
    expect(fixture.clipboard.stop).toHaveBeenCalledTimes(1);
  });

  it("applies authenticated live Clips while history imports remain local", async () => {
    const fixture = harness();
    fixture.exchange.startLocalCapture();
    await fixture.exchange.activateReadyTransport(fixture.transport);
    fixture.deliveries.length = 0;
    const receivedLive = {
      ...clip("00000000-0000-4000-8000-000000000606", "live delivery"),
      originPeerId: "12D3KooWFNjtBxwwk1dbR9eAcDX11U9TsiU3Xho3fuY3e25tQzdy",
    };
    fixture.messageHandler()?.(
      "member",
      encodeLiveClipFrame({ clip: receivedLive })
    );
    await flush();

    expect((await fixture.history.getById(receivedLive.id))?.clip).toEqual(
      receivedLive
    );
    expect(fixture.clipboard.writeRemoteClip).toHaveBeenCalledTimes(1);
    expect(fixture.clipboard.writeRemoteClip).toHaveBeenCalledWith(
      receivedLive,
      expect.any(Function)
    );

    const imported = {
      ...clip("00000000-0000-4000-8000-000000000607", "history import"),
      originPeerId: "12D3KooWFNjtBxwwk1dbR9eAcDX11U9TsiU3Xho3fuY3e25tQzdy",
    };
    const receiveHistory = fixture.streamHandlers.get(HISTORY_PROTOCOL);
    expect(receiveHistory).toBeDefined();
    await receiveHistory!(
      "member",
      (async function* () {
        yield encodeHistoryBatchFrame({ clips: [imported] });
      })()
    );

    expect((await fixture.history.getById(imported.id))?.clip).toEqual(
      imported
    );
    expect(fixture.clipboard.writeRemoteClip).toHaveBeenCalledTimes(1);
    await fixture.exchange.stop();
  });
});
