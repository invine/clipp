import {
  createExtensionReachabilityBridge,
  handleExtensionReachabilityRequest,
  isExtensionReachabilityRequest,
  type ExtensionReachabilityRequester,
} from "../../apps/extension/src/networkBridge";

describe("Chrome extension reachability bridge", () => {
  it("retrieves remote records and performs exact peer-record refreshes offscreen", async () => {
    const requests: unknown[] = [];
    const request = jest.fn(async (message: any) => {
      requests.push(message);
      if (message.action === "runtimeGetSignedPeerRecordFor") return { record: [4, 5, 6] };
      return { ok: true };
    });
    const bridge = createExtensionReachabilityBridge(
      request as ExtensionReachabilityRequester
    );

    await expect(bridge.getSignedPeerRecordFor("member-peer")).resolves.toEqual(
      Uint8Array.of(4, 5, 6)
    );
    await bridge.refreshPeerRecord("pairing-target");

    expect(requests).toEqual([
      { action: "runtimeGetSignedPeerRecordFor", peerId: "member-peer" },
      { action: "runtimeRefreshPeerRecord", peerId: "pairing-target" },
    ]);
  });

  it("shares the typed request contract with the offscreen dispatcher", async () => {
    const transport = {
      getSignedPeerRecord: jest.fn(async () => Uint8Array.of(1)),
      getSignedPeerRecordFor: jest.fn(async () => Uint8Array.of(4, 5)),
      importSignedPeerRecord: jest.fn(async () => undefined),
      refreshPeerRecord: jest.fn(async () => undefined),
    };
    const request = { action: "runtimeRefreshPeerRecord", peerId: "peer" } as const;

    expect(isExtensionReachabilityRequest(request)).toBe(true);
    expect(isExtensionReachabilityRequest({ action: request.action })).toBe(false);
    await expect(handleExtensionReachabilityRequest(request, transport)).resolves.toEqual({ ok: true });
    expect(transport.refreshPeerRecord).toHaveBeenCalledWith("peer");
  });
});
