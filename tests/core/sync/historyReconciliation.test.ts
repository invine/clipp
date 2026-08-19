import { MemoryHistoryStore } from "../../../packages/core/history/store";
import type { MessagingTransport } from "../../../packages/core/messaging/transport";
import type { Clip } from "../../../packages/core/models/Clip";
import { HISTORY_PROTOCOL } from "../../../packages/core/protocols/history";
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

describe("History reconciliation", () => {
  it("repairs an offline Clip through history only, re-exports it, and remains idempotent", async () => {
    const handlers = new Map<string, (from: string, data: Uint8Array) => void>();
    const stores = new Map(Object.values(peerIds).map((peerId) => [peerId, new MemoryHistoryStore(undefined, { now: () => 2_000 })]));
    const clipboardWrites = new Map(Object.values(peerIds).map((peerId) => [peerId, 0]));
    const connected = new Map<string, string[]>([
      [peerIds.electron, []],
      [peerIds.extension, []],
      [peerIds.android, []],
    ]);

    const transportFor = (from: string): Pick<MessagingTransport, "getConnectedPeers" | "onMessage" | "onPeerConnected"> & {
      sendStream(protocol: string, target: string, frames: AsyncIterable<Uint8Array>): Promise<void>;
    } => ({
      getConnectedPeers: () => connected.get(from) ?? [],
      onMessage: (protocol, handler) => {
        if (protocol === HISTORY_PROTOCOL) handlers.set(from, handler);
      },
      onPeerConnected: () => {},
      async sendStream(protocol, target, frames) {
        expect(protocol).toBe(HISTORY_PROTOCOL);
        const chunks: Uint8Array[] = [];
        for await (const frame of frames) chunks.push(frame);
        const size = chunks.reduce((total, frame) => total + frame.byteLength, 0);
        const stream = new Uint8Array(size);
        let offset = 0;
        for (const frame of chunks) {
          stream.set(frame, offset);
          offset += frame.byteLength;
        }
        handlers.get(target)?.(from, stream);
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
    let incoming: ((from: string, data: Uint8Array) => void) | undefined;
    const history = new MemoryHistoryStore(undefined, { now: () => 2_000 });
    const reconciliation = createHistoryReconciliation({
      transport: {
        getConnectedPeers: () => [],
        onMessage: (_protocol, handler) => { incoming = handler; },
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
    incoming!(peerIds.extension, Uint8Array.from([...valid, 0x80]));
    await flush();

    expect(await history.exportAll()).toEqual([clip]);
  });

  it("offers a snapshot when an already connected device becomes an Active Member", async () => {
    let active = false;
    let membershipChanged: (() => void) | undefined;
    const sendStream = jest.fn(async () => {});
    const reconciliation = createHistoryReconciliation({
      transport: {
        getConnectedPeers: () => [peerIds.extension],
        onMessage: () => {},
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
