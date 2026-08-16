import type { MessagingTransport } from "../../../packages/core/messaging/transport";
import { decodeSignedPeerRecordBytes } from "../../../packages/core/network/peerRecords";

export type ExtensionReachabilityRequestMap = {
  runtimeGetSignedPeerRecord: { action: "runtimeGetSignedPeerRecord" };
  runtimeGetSignedPeerRecordFor: {
    action: "runtimeGetSignedPeerRecordFor";
    peerId: string;
  };
  runtimeImportSignedPeerRecord: {
    action: "runtimeImportSignedPeerRecord";
    peerId: string;
    record: number[];
  };
  runtimeRefreshPeerRecord: { action: "runtimeRefreshPeerRecord"; peerId: string };
};

export type ExtensionReachabilityResponseMap = {
  runtimeGetSignedPeerRecord: { record: number[] };
  runtimeGetSignedPeerRecordFor: { record?: number[] };
  runtimeImportSignedPeerRecord: { ok: boolean };
  runtimeRefreshPeerRecord: { ok: boolean };
};

type ReachabilityAction = keyof ExtensionReachabilityRequestMap;
export type ExtensionReachabilityRequest = ExtensionReachabilityRequestMap[ReachabilityAction];
export type ExtensionReachabilityResponse = ExtensionReachabilityResponseMap[ReachabilityAction];
export type ExtensionReachabilityRequester = <Request extends ExtensionReachabilityRequest>(
  message: Request
) => Promise<ExtensionReachabilityResponseMap[Request["action"]]>;

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
  request: ExtensionReachabilityRequester
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

export function isExtensionReachabilityRequest(
  value: unknown
): value is ExtensionReachabilityRequest {
  if (!value || typeof value !== "object") return false;
  const message = value as Record<string, unknown>;
  switch (message.action) {
    case "runtimeGetSignedPeerRecord":
      return true;
    case "runtimeGetSignedPeerRecordFor":
    case "runtimeRefreshPeerRecord":
      return typeof message.peerId === "string" && message.peerId.length > 0;
    case "runtimeImportSignedPeerRecord":
      return (
        typeof message.peerId === "string" &&
        message.peerId.length > 0 &&
        Array.isArray(message.record)
      );
    default:
      return false;
  }
}

export async function handleExtensionReachabilityRequest(
  request: ExtensionReachabilityRequest,
  transport: ExtensionReachabilityBridge
): Promise<ExtensionReachabilityResponse> {
  switch (request.action) {
    case "runtimeGetSignedPeerRecord":
      return { record: Array.from(await transport.getSignedPeerRecord()) };
    case "runtimeGetSignedPeerRecordFor": {
      const record = await transport.getSignedPeerRecordFor(request.peerId);
      return record ? { record: Array.from(record) } : {};
    }
    case "runtimeImportSignedPeerRecord":
      await transport.importSignedPeerRecord(request.peerId, Uint8Array.from(request.record));
      return { ok: true };
    case "runtimeRefreshPeerRecord":
      await transport.refreshPeerRecord(request.peerId);
      return { ok: true };
  }
}
