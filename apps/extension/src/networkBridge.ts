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
  runtimeForgetPeer: { action: "runtimeForgetPeer"; peerId: string };
  runtimeRefreshPeerRecord: { action: "runtimeRefreshPeerRecord"; peerId: string };
};

export type ExtensionReachabilityResponseMap = {
  runtimeGetSignedPeerRecord: { record: number[] };
  runtimeGetSignedPeerRecordFor: { record?: number[] };
  runtimeImportSignedPeerRecord: { ok: boolean };
  runtimeForgetPeer: { ok: boolean };
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
    | "forgetPeer"
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

    async forgetPeer(peerId) {
      const result = await request({ action: "runtimeForgetPeer", peerId });
      if (!result?.ok) throw new Error("peer_record_forget_failed");
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
    case "runtimeForgetPeer":
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
  transport: Pick<
    MessagingTransport,
    "getSignedPeerRecord" | "getSignedPeerRecordFor" | "importSignedPeerRecord" | "forgetPeer" | "refreshPeerRecord"
  >
): Promise<ExtensionReachabilityResponse> {
  switch (request.action) {
    case "runtimeGetSignedPeerRecord": {
      if (!transport.getSignedPeerRecord) throw new Error("signed_peer_record_unavailable");
      return { record: Array.from(await transport.getSignedPeerRecord()) };
    }
    case "runtimeGetSignedPeerRecordFor": {
      if (!transport.getSignedPeerRecordFor) throw new Error("signed_peer_record_unavailable");
      const record = await transport.getSignedPeerRecordFor(request.peerId);
      return record ? { record: Array.from(record) } : {};
    }
    case "runtimeImportSignedPeerRecord": {
      if (!transport.importSignedPeerRecord) throw new Error("signed_peer_record_unavailable");
      await transport.importSignedPeerRecord(request.peerId, Uint8Array.from(request.record));
      return { ok: true };
    }
    case "runtimeForgetPeer": {
      if (!transport.forgetPeer) throw new Error("peer_record_forget_unavailable");
      await transport.forgetPeer(request.peerId);
      return { ok: true };
    }
    case "runtimeRefreshPeerRecord": {
      if (!transport.refreshPeerRecord) throw new Error("peer_record_refresh_unavailable");
      await transport.refreshPeerRecord(request.peerId);
      return { ok: true };
    }
  }
}
