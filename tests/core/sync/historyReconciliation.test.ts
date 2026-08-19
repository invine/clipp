import { MemoryHistoryStore } from "../../../packages/core/history/store";
import type { MessagingTransport } from "../../../packages/core/messaging/transport";
import type { Clip } from "../../../packages/core/models/Clip";
import { HISTORY_PROTOCOL, HISTORY_REQUEST_PROTOCOL } from "../../../packages/core/protocols/history";
import { encodeHistoryBatchFrame } from "../../../packages/core/protocols/history";
import { createHistoryReconciliation } from "../../../packages/core/sync/historyReconciliation";

const peerIds = {
  electron: "12D3KooWJ5oQ9G9kDMwrrzmVWwZnJryHJns8ovH8LYgDgJYJYyXy",
  android: "12D3KooWFNjtBxwwk1dbR9eAcDX11U9TsiU3Xho3fuY3e25tQzdy",
  extension: "12D3KooWSuG4bhX3bg3oS1P2eS6NWRmArz98sQ5ALbqK2ABu54mF",
};

const clip: Clip = {
  id: "00000000-0000-4000-8000-000000000001",
  type: "text",
  content: "repair me",
  originPeerId: peerIds.electron,
  capturedAt: 1_000,
  shareExpiresAt: 86_401_000,
};

async function flush(times = 4): Promise<void> {
  for (let index = 0; index < times; index += 1) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

function createControlledStream() {
  const values: Array<IteratorResult<Uint8Array>> = [];
  const waiting: Array<(value: IteratorResult<Uint8Array>) => void> = [];
  return {
    stream: {
      [Symbol.asyncIterator]() {
        return {
          next: () => {
            const value = values.shift();
            return value ? Promise.resolve(value) : new Promise<IteratorResult<Uint8Array>>((resolve) => waiting.push(resolve));
          },
        };
      },
    } satisfies AsyncIterable<Uint8Array>,
    push(value: Uint8Array) {
      const resolve = waiting.shift();
      if (resolve) resolve({ done: false, value });
      else values.push({ done: false, value });
    },
    end() {
      const resolve = waiting.shift();
      if (resolve) resolve({ done: true, value: undefined });
      else values.push({ done: true, value: undefined });
    },
  };
}

describe("History reconciliation", () => {
  it("repairs connected Active Members with a snapshot and request when Auto Sync is re-enabled", async () => {
    const sent: Array<{ protocol: string; target: string }> = [];
    const reconciliation = createHistoryReconciliation({
      transport: {
        getConnectedPeers: () => [peerIds.extension],
        onStream: () => {},
        onPeerConnected: () => {},
        async sendStream(protocol, target, frames) {
          sent.push({ protocol, target });
          for await (const _frame of frames) {
            // Drain the independently framed stream.
          }
        },
      },
      history: new MemoryHistoryStore(undefined, { now: () => 2_000 }),
      getLocalDeviceId: async () => peerIds.android,
      membershipStatus: async () => "active",
      now: () => 2_000,
    });
    reconciliation.start();
    await flush();
    sent.length = 0;

    reconciliation.setAutoSync(false);
    reconciliation.setAutoSync(true);
    await flush();

    expect(sent).toEqual([
      { protocol: HISTORY_PROTOCOL, target: peerIds.extension },
      { protocol: HISTORY_REQUEST_PROTOCOL, target: peerIds.extension },
    ]);
  });

  it("imports a complete History Batch before the inbound snapshot reaches EOF", async () => {
    let incomingStream: ((from: string, chunks: AsyncIterable<Uint8Array>) => void | Promise<void>) | undefined;
    const history = new MemoryHistoryStore(undefined, { now: () => 2_000 });
    const reconciliation = createHistoryReconciliation({
      transport: {
        getConnectedPeers: () => [],
        onMessage: () => {},
        onStream: (_protocol: string, handler: typeof incomingStream) => { incomingStream = handler; },
        onPeerConnected: () => {},
        sendStream: async () => {},
      } as any,
      history,
      getLocalDeviceId: async () => peerIds.android,
      membershipStatus: async () => "active",
      now: () => 2_000,
    });
    reconciliation.start();
    expect(incomingStream).toBeDefined();

    const controlled = createControlledStream();
    const receiving = Promise.resolve(incomingStream!(peerIds.extension, controlled.stream));
    controlled.push(encodeHistoryBatchFrame({ clips: [clip] }));
    await flush();

    expect(await history.exportAll()).toEqual([clip]);
    controlled.end();
    await receiving;
  });

  it("does not consume a second inbound snapshot from the same Active Member", async () => {
    let incomingStream: ((from: string, chunks: AsyncIterable<Uint8Array>) => Promise<void>) | undefined;
    const history = new MemoryHistoryStore(undefined, { now: () => 2_000 });
    const reconciliation = createHistoryReconciliation({
      transport: {
        getConnectedPeers: () => [],
        onStream: (_protocol, handler) => { incomingStream = handler; },
        onPeerConnected: () => {},
        sendStream: async () => {},
      },
      history,
      getLocalDeviceId: async () => peerIds.android,
      membershipStatus: async () => "active",
      now: () => 2_000,
    });
    reconciliation.start();

    const first = createControlledStream();
    const firstReceiving = incomingStream!(peerIds.extension, first.stream);
    first.push(encodeHistoryBatchFrame({ clips: [clip] }));
    await flush();

    let secondReads = 0;
    const secondClip: Clip = {
      ...clip,
      id: "00000000-0000-4000-8000-000000000002",
      content: "must remain unread",
    };
    const second = async function *(): AsyncIterable<Uint8Array> {
      secondReads += 1;
      yield encodeHistoryBatchFrame({ clips: [secondClip] });
    };

    await expect(incomingStream!(peerIds.extension, second())).rejects.toThrow("history_snapshot_busy");
    expect(secondReads).toBe(0);
    expect(await history.exportAll()).toEqual([clip]);

    first.end();
    await firstReceiving;
  });

  it("repairs an offline Clip through history only, re-exports it, and remains idempotent", async () => {
    const handlers = new Map<string, (from: string, chunks: AsyncIterable<Uint8Array>) => Promise<void>>();
    const stores = new Map(Object.values(peerIds).map((peerId) => [peerId, new MemoryHistoryStore(undefined, { now: () => 2_000 })]));
    const clipboardWrites = new Map(Object.values(peerIds).map((peerId) => [peerId, 0]));
    const connected = new Map<string, string[]>([
      [peerIds.electron, []],
      [peerIds.extension, []],
      [peerIds.android, []],
    ]);

    const transportFor = (from: string): Pick<MessagingTransport, "getConnectedPeers" | "onPeerConnected"> & {
      onStream: NonNullable<MessagingTransport["onStream"]>;
      sendStream(protocol: string, target: string, frames: AsyncIterable<Uint8Array>): Promise<void>;
    } => ({
      getConnectedPeers: () => connected.get(from) ?? [],
      onStream: (protocol, handler) => {
        if (protocol === HISTORY_PROTOCOL) handlers.set(from, handler);
      },
      onPeerConnected: () => {},
      async sendStream(protocol, target, frames) {
        expect(protocol).toBe(HISTORY_PROTOCOL);
        await handlers.get(target)?.(from, frames);
      },
    });

    const reconcilers = new Map(Object.values(peerIds).map((peerId) => [peerId, createHistoryReconciliation({
      transport: transportFor(peerId),
      history: stores.get(peerId)!,
      getLocalDeviceId: async () => peerId,
      membershipStatus: async () => "active",
      now: () => 2_000,
    })]));
    reconcilers.forEach((reconciler) => reconciler.start());

    await stores.get(peerIds.electron)!.accept(clip, { liveHandled: true });
    connected.set(peerIds.electron, [peerIds.extension]);
    connected.set(peerIds.extension, [peerIds.electron]);
    await reconcilers.get(peerIds.electron)!.snapshotTo(peerIds.extension);
    await flush();

    expect(await stores.get(peerIds.extension)!.exportAll()).toEqual([clip]);
    expect(clipboardWrites.get(peerIds.extension)).toBe(0);

    connected.set(peerIds.extension, [peerIds.android]);
    connected.set(peerIds.android, [peerIds.extension]);
    await reconcilers.get(peerIds.extension)!.snapshotTo(peerIds.android);
    await flush();

    expect(await stores.get(peerIds.android)!.exportAll()).toEqual([clip]);
    await reconcilers.get(peerIds.extension)!.snapshotTo(peerIds.android);
    expect(await stores.get(peerIds.android)!.exportAll()).toEqual([clip]);
  });

  it("retains a valid earlier batch when a later frame is malformed", async () => {
    let incoming: ((from: string, chunks: AsyncIterable<Uint8Array>) => Promise<void>) | undefined;
    const history = new MemoryHistoryStore(undefined, { now: () => 2_000 });
    const reconciliation = createHistoryReconciliation({
      transport: {
        getConnectedPeers: () => [],
        onStream: (_protocol, handler) => { incoming = handler; },
        onPeerConnected: () => {},
        sendStream: async () => {},
      },
      history,
      getLocalDeviceId: async () => peerIds.android,
      membershipStatus: async () => "active",
      now: () => 2_000,
    });
    reconciliation.start();

    const valid = encodeHistoryBatchFrame({ clips: [clip] });
    await expect(incoming!(peerIds.extension, (async function *() {
      yield Uint8Array.from([...valid, 0x80]);
    })())).rejects.toThrow("invalid_history_framing");

    expect(await history.exportAll()).toEqual([clip]);
  });

  it("re-exports a committed import after a later frame terminates the snapshot", async () => {
    let incoming: ((from: string, chunks: AsyncIterable<Uint8Array>) => Promise<void>) | undefined;
    const snapshotTargets: string[] = [];
    let connectedPeers: string[] = [];
    const history = new MemoryHistoryStore(undefined, { now: () => 2_000 });
    const reconciliation = createHistoryReconciliation({
      transport: {
        getConnectedPeers: () => connectedPeers,
        onStream: (_protocol, handler) => { incoming = handler; },
        onPeerConnected: () => {},
        async sendStream(_protocol, target, frames) {
          snapshotTargets.push(target);
          for await (const _frame of frames) {
            // Drain the ordinary outbound snapshot.
          }
        },
      },
      history,
      getLocalDeviceId: async () => peerIds.android,
      membershipStatus: async () => "active",
      now: () => 2_000,
    });
    reconciliation.start();
    connectedPeers = [peerIds.extension, peerIds.electron];

    const valid = encodeHistoryBatchFrame({ clips: [clip] });
    await expect(incoming!(peerIds.extension, (async function *() {
      yield valid;
      yield Uint8Array.of(0x80);
    })())).rejects.toThrow("invalid_history_framing");

    expect(await history.exportAll()).toEqual([clip]);
    expect(snapshotTargets).toEqual([peerIds.electron]);
  });

  it("rejects a failed inbound snapshot without waiting for re-export", async () => {
    let incoming: ((from: string, chunks: AsyncIterable<Uint8Array>) => Promise<void>) | undefined;
    const history = new MemoryHistoryStore(undefined, { now: () => 2_000 });
    const reconciliation = createHistoryReconciliation({
      transport: {
        getConnectedPeers: () => [peerIds.electron],
        onStream: (_protocol, handler) => { incoming = handler; },
        onPeerConnected: () => {},
        sendStream: async () => await new Promise<void>(() => {}),
      },
      history,
      getLocalDeviceId: async () => { throw new Error("identity_failed"); },
      membershipStatus: async () => "active",
      now: () => 2_000,
    });
    reconciliation.start();

    await expect(incoming!(peerIds.extension, (async function *() {
      yield encodeHistoryBatchFrame({ clips: [clip] });
      yield Uint8Array.of(0x80);
    })())).rejects.toThrow("invalid_history_framing");
  });

  it("terminates an inbound snapshot when the sender loses membership", async () => {
    let incoming: ((from: string, chunks: AsyncIterable<Uint8Array>) => Promise<void>) | undefined;
    let active = true;
    let produced = 0;
    const stored: Clip[] = [];
    const reconciliation = createHistoryReconciliation({
      transport: {
        getConnectedPeers: () => [],
        onStream: (_protocol, handler) => { incoming = handler; },
        onPeerConnected: () => {},
        sendStream: async () => {},
      },
      history: {
        query: async () => [],
        getById: async () => null,
        accept: async (accepted) => {
          stored.push(accepted);
          active = false;
          return { kind: "newly-stored" as const, clip: accepted, liveHandled: false };
        },
      },
      getLocalDeviceId: async () => peerIds.android,
      membershipStatus: async () => active ? "active" : "revoked",
      now: () => 2_000,
    });
    reconciliation.start();

    await expect(incoming!(peerIds.extension, (async function *() {
      produced += 1;
      yield encodeHistoryBatchFrame({ clips: [clip] });
      produced += 1;
      yield encodeHistoryBatchFrame({ clips: [{ ...clip, id: "00000000-0000-4000-8000-000000000002" }] });
      produced += 1;
      yield Uint8Array.of(0x80);
    })())).rejects.toThrow("history_sender_inactive");

    expect(stored).toEqual([clip]);
    expect(produced).toBe(2);
  });

  it("rechecks membership for a batch containing only malformed Clips", async () => {
    let incoming: ((from: string, chunks: AsyncIterable<Uint8Array>) => Promise<void>) | undefined;
    let membershipChecks = 0;
    let produced = 0;
    const reconciliation = createHistoryReconciliation({
      transport: {
        getConnectedPeers: () => [],
        onStream: (_protocol, handler) => { incoming = handler; },
        onPeerConnected: () => {},
        sendStream: async () => {},
      },
      history: new MemoryHistoryStore(undefined, { now: () => 2_000 }),
      getLocalDeviceId: async () => peerIds.android,
      membershipStatus: async () => ++membershipChecks === 1 ? "active" : "revoked",
      now: () => 2_000,
    });
    reconciliation.start();
    const malformedClipFrame = Uint8Array.from(encodeHistoryBatchFrame({ clips: [clip] }));
    malformedClipFrame[13] = 0;

    await expect(incoming!(peerIds.extension, (async function *() {
      produced += 1;
      yield malformedClipFrame;
      produced += 1;
      yield Uint8Array.of(0x80);
    })())).rejects.toThrow("history_sender_inactive");

    expect(produced).toBe(1);
  });

  it("offers a snapshot when an already connected device becomes an Active Member", async () => {
    let active = false;
    let membershipChanged: (() => void) | undefined;
    const sendStream = jest.fn(async () => {});
    const reconciliation = createHistoryReconciliation({
      transport: {
        getConnectedPeers: () => [peerIds.extension],
        onStream: () => {},
        onPeerConnected: () => {},
        sendStream,
      },
      history: new MemoryHistoryStore(undefined, { now: () => 2_000 }),
      getLocalDeviceId: async () => peerIds.android,
      membershipStatus: async () => active ? "active" : "unknown",
      onMembershipChanged: (listener) => {
        membershipChanged = listener;
        return () => { membershipChanged = undefined; };
      },
      now: () => 2_000,
    });
    reconciliation.start();

    expect(sendStream).not.toHaveBeenCalled();
    active = true;
    membershipChanged!();
    await flush();

    expect(sendStream).toHaveBeenCalledWith(HISTORY_PROTOCOL, peerIds.extension, expect.anything());
  });
});
