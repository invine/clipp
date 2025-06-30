import type { MessagingLayer } from "../network/engine";
import type { TrustManager, TrustedDevice } from "../trust/trusted-devices";
import type { Clip } from "../models/Clip";
import { RETENTION_MS, ClipHistoryStore } from "./store";

interface SyncMessage {
  type: "sync-history";
  payload: Clip[];
}

export function initHistorySync(
  messaging: MessagingLayer,
  trust: TrustManager,
  history: ClipHistoryStore
): void {
  const synced = new Set<string>();

  trust.on("approved", async (device: TrustedDevice) => {
    if (synced.has(device.deviceId)) return;
    synced.add(device.deviceId);
    const items = await history.query({ since: Date.now() - RETENTION_MS });
    const local = items.filter((i) => i.isLocal).map((i) => i.clip);
    const chunkSize = 100;
    for (let i = 0; i < local.length; i += chunkSize) {
      const chunk = local.slice(i, i + chunkSize);
      const msg: SyncMessage = { type: "sync-history", payload: chunk };
      const size = Buffer.byteLength(JSON.stringify(msg));
      if (size > 500 * 1024) break;
      await messaging.sendMessage(device.deviceId, msg as any);
    }
  });

  messaging.onMessage(async (msg: any) => {
    if (msg.type === "sync-history" && Array.isArray(msg.payload)) {
      await history.importBatch(msg.payload);
    }
  });
}
