import type { MessagingTransport } from "../../../packages/core/messaging/transport";
import { decodeSignedPeerRecordBytes } from "../../../packages/core/network/peerRecords";

type OffscreenRequest = (message: Record<string, unknown>) => Promise<any>;

export type ExtensionReachabilityBridge = Required<
  Pick<
    MessagingTransport,
    | "getSignedPeerRecord"
    | "getSignedPeerRecordFor"
    | "importSignedPeerRecord"
    | "refreshPeerRecord"
  >
>;

export function createExtensionReachabilityBridge(
  request: OffscreenRequest
): ExtensionReachabilityBridge {
  return {
    async getSignedPeerRecord() {
      const result = await request({ action: "runtimeGetSignedPeerRecord" });
      const record = decodeSignedPeerRecordBytes(result?.record);
      if (!record) throw new Error("signed_peer_record_unavailable");
      return record;
    },

    async getSignedPeerRecordFor(peerId) {
      const result = await request({ action: "runtimeGetSignedPeerRecordFor", peerId });
      return decodeSignedPeerRecordBytes(result?.record);
    },

    async importSignedPeerRecord(peerId, record) {
      const result = await request({
        action: "runtimeImportSignedPeerRecord",
        peerId,
        record: Array.from(record),
      });
      if (!result?.ok) throw new Error("invalid_signed_peer_record");
    },

    async refreshPeerRecord(peerId) {
      const result = await request({ action: "runtimeRefreshPeerRecord", peerId });
      if (!result?.ok) throw new Error("peer_record_refresh_failed");
    },
  };
}
