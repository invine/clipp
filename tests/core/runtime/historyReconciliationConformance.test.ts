import { MemoryHistoryStore } from "../../../packages/core/history/store";
import type { StreamingMessagingTransport } from "../../../packages/core/messaging/transport";
import type { Clip } from "../../../packages/core/models/Clip";
import { decodeHistorySnapshot, encodeHistoryBatchFrame, HISTORY_PROTOCOL } from "../../../packages/core/protocols/history";
import { createRuntimeClipboardService } from "../../../packages/core/runtime/clipboard";
import { RUNTIME_CAPABILITIES } from "../../../packages/core/runtime/capabilities";
import { createClipboardSyncManager } from "../../../packages/core/sync/clipboardSync";
import { createHistoryReconciliation } from "../../../packages/core/sync/historyReconciliation";

const localPeerId = "12D3KooWFNjtBxwwk1dbR9eAcDX11U9TsiU3Xho3fuY3e25tQzdy";
const senderPeerId = "12D3KooWSuG4bhX3bg3oS1P2eS6NWRmArz98sQ5ALbqK2ABu54mF";
const targetPeerId = "12D3KooWJ5oQ9G9kDMwrrzmVWwZnJryHJns8ovH8LYgDgJYJYyXy";
const historicalClip: Clip = {
  id: "00000000-0000-4000-8000-000000000011",
  type: "text",
  content: "history only",
  originPeerId: senderPeerId,
  capturedAt: 1_000,
  shareExpiresAt: 86_401_000,
};

describe.each([
  ["Desktop", RUNTIME_CAPABILITIES.electron],
  ["Mobile", RUNTIME_CAPABILITIES.android],
  ["Extension", RUNTIME_CAPABILITIES.chromeExtension],
] as const)("%s Clipboard History Reconciliation", (_name, capabilities) => {
  it("imports without changing the clipboard, re-exports, and remains idempotent", async () => {
    const history = new MemoryHistoryStore(undefined, { now: () => 2_000 });
    const clipboardWrites: string[] = [];
    const clipboard = createRuntimeClipboardService({
      capabilities,
      history,
      getSenderId: () => localPeerId,
      readText: capabilities.clipboardCapture === "polling" ? async () => "current clipboard" : undefined,
      writeText: async (text) => { clipboardWrites.push(text); },
      pollIntervalMs: 0,
      now: () => 2_000,
    });
    const clipboardSync = createClipboardSyncManager({
      clipboard,
      history,
      getLocalDeviceId: async () => localPeerId,
      now: () => 2_000,
    });
    clipboardSync.start();

    let incoming: ((from: string, chunks: AsyncIterable<Uint8Array>) => Promise<void>) | undefined;
    const outbound: Uint8Array[] = [];
    const connectedPeers = [targetPeerId];
    const transport: Pick<StreamingMessagingTransport, "getConnectedPeers" | "onPeerConnected" | "sendStream" | "onStream"> = {
      getConnectedPeers: () => connectedPeers,
      onPeerConnected: () => {},
      onStream: (protocol, handler) => {
        if (protocol === HISTORY_PROTOCOL) incoming = handler;
      },
      async sendStream(protocol, target, frames) {
        expect({ protocol, target }).toEqual({ protocol: HISTORY_PROTOCOL, target: targetPeerId });
        for await (const frame of frames) outbound.push(frame);
      },
    };
    const reconciliation = createHistoryReconciliation({
      transport,
      history,
      getLocalDeviceId: async () => localPeerId,
      membershipStatus: async () => "active",
      now: () => 2_000,
    });
    reconciliation.start();

    const inboundSnapshot = async function *(): AsyncIterable<Uint8Array> {
      yield encodeHistoryBatchFrame({ clips: [historicalClip] });
    };
    await incoming!(senderPeerId, inboundSnapshot());
    await incoming!(senderPeerId, inboundSnapshot());

    expect(await history.exportAll()).toEqual([historicalClip]);
    expect(clipboardWrites).toEqual([]);
    expect(decodeHistorySnapshot(concat(outbound))).toEqual([{ clips: [historicalClip] }]);

    reconciliation.stop();
    clipboardSync.stop();
  });
});

function concat(parts: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}
