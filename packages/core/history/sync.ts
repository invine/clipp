import type { TrustManager, TrustedDevice } from "../trust/trustManager";
import type { ProtocolMessenger } from "../messaging/protocolMessenger";
import type { HistorySyncMessage } from "../protocols/history";
import { RETENTION_MS, ClipHistoryStore } from "./store";
import { IdentityManager } from "../trust";

export function initHistorySync(
  messaging: ProtocolMessenger<HistorySyncMessage>,
  identity: IdentityManager,
  trust: TrustManager,
  history: ClipHistoryStore
): void {
  const synced = new Set<string>();

  trust.on("approved", async (device: TrustedDevice) => {
    if (synced.has(device.deviceId)) return;
    synced.add(device.deviceId);
    const local = await identity.get();
    const items = await history.query({ since: Date.now() - RETENTION_MS });
    const clips = items.filter((i) => i.isLocal).map((i) => i.clip);
    const chunkSize = 100;
    for (let i = 0; i < clips.length; i += chunkSize) {
      const chunk = clips.slice(i, i + chunkSize);
      const msg: HistorySyncMessage = { type: "sync-history", from: local.deviceId, payload: chunk, sentAt: Date.now() };
      const size = Buffer.byteLength(JSON.stringify(msg));
      if (size > 500 * 1024) break;
      const target = device.multiaddrs?.[0] || device.deviceId;
      await messaging.send(target, msg);
    }
  });

  messaging.onMessage(async (msg) => {
    await history.importBatch(msg.payload);
  });
}
