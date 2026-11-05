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

function harness(
  membershipStatus: () => Promise<
    "active" | "revoked" | "unknown"
  > = async () => "active"
) {
  const localListeners: Array<
    (value: Clip, options?: { shareNow?: boolean }) => void
  > = [];
  const deliveries: Array<{
    protocol: string;
    peerId: string;
    data?: Uint8Array;
  }> = [];
  const remoteApplications: Clip[] = [];
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
    writeRemoteClip: jest.fn(
      async (value: Clip, shouldApply?: () => Promise<boolean>) => {
        if (shouldApply && !(await shouldApply())) return false;
        remoteApplications.push(value);
        return true;
      }
    ),
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
    membershipStatus,
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
    remoteApplications,
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
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
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

  it("does not apply an inbound Clip whose old transport callback settles after replacement", async () => {
    const membership = deferred<"active">();
    const fixture = harness(() => membership.promise);
    fixture.exchange.startLocalCapture();
    await fixture.exchange.activateReadyTransport(fixture.transport);
    const oldCallback = fixture.messageHandler();
    const incoming = {
      ...clip("00000000-0000-4000-8000-000000000608", "retired inbound"),
      originPeerId: "12D3KooWFNjtBxwwk1dbR9eAcDX11U9TsiU3Xho3fuY3e25tQzdy",
    };
    const secondIncoming = {
      ...incoming,
      id: "00000000-0000-4000-8000-000000000609",
      content: "retired while storing",
    };
    oldCallback?.("member", encodeLiveClipFrame({ clip: incoming }));
    membership.resolve("active");
    await flush();
    expect(fixture.clipboard.writeRemoteClip).toHaveBeenCalledTimes(1);

    const stored = deferred<void>();
    const release = deferred<void>();
    const accept = fixture.history.accept.bind(fixture.history);
    fixture.history.accept = async (value, options) => {
      if (value.id === secondIncoming.id) {
        stored.resolve();
        await release.promise;
      }
      return await accept(value, options);
    };
    oldCallback?.("member", encodeLiveClipFrame({ clip: secondIncoming }));
    await stored.promise;

    await fixture.exchange.retireTransport();
    const replacement = { ...fixture.transport };
    await fixture.exchange.activateReadyTransport(replacement);
    release.resolve();
    await flush();

    expect(fixture.remoteApplications).toEqual([incoming]);
    await fixture.exchange.stop();
  });

  it("reoffers the same pending Share Now Clip after an ambiguous retired send", async () => {
    const fixture = harness();
    const receiver = new MemoryHistoryStore(undefined, { now: () => 1_000 });
    const oldResult = deferred<void>();
    const currentResult = deferred<void>();
    const reofferedIds: string[] = [];
    const oldTransport = {
      ...fixture.transport,
      send: jest.fn(
        async (_protocol: string, _peerId: string, data: Uint8Array) => {
          const frame = decodeLiveClipFrame(data);
          if (frame) {
            reofferedIds.push(frame.clip.id);
            await receiver.accept(frame.clip, { liveHandled: true });
          }
          await oldResult.promise;
        }
      ),
    };
    const currentTransport = {
      ...fixture.transport,
      send: jest.fn(
        async (_protocol: string, _peerId: string, data: Uint8Array) => {
          const frame = decodeLiveClipFrame(data);
          if (frame) {
            reofferedIds.push(frame.clip.id);
            await receiver.accept(frame.clip, { liveHandled: true });
          }
          await currentResult.promise;
        }
      ),
    };

    fixture.exchange.startLocalCapture();
    await fixture.exchange.activateReadyTransport(oldTransport);
    fixture.exchange.setAutoSync(false);
    const shared = clip("00000000-0000-4000-8000-000000000610", "Share Now");
    fixture.localListeners[0](shared, { shareNow: true });
    await flush();
    expect(oldTransport.send).toHaveBeenCalledTimes(1);
    expect((await fixture.history.getById(shared.id))?.shareNowPending).toBe(
      true
    );

    await fixture.exchange.retireTransport();
    await fixture.exchange.activateReadyTransport(currentTransport);
    await flush();
    expect(currentTransport.send).toHaveBeenCalledTimes(1);
    expect(reofferedIds).toEqual([shared.id, shared.id]);
    expect(await receiver.query()).toHaveLength(1);

    oldResult.reject(new Error("old_transport_result_lost"));
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
