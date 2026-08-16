import { createExtensionReachabilityBridge } from "../../apps/extension/src/networkBridge";

describe("Chrome extension reachability bridge", () => {
  it("retrieves remote records and performs exact peer-record refreshes offscreen", async () => {
    const requests: unknown[] = [];
    const request = jest.fn(async (message: any) => {
      requests.push(message);
      if (message.action === "runtimeGetSignedPeerRecordFor") return { record: [4, 5, 6] };
      return { ok: true };
    });
    const bridge = createExtensionReachabilityBridge(request);

    await expect(bridge.getSignedPeerRecordFor("member-peer")).resolves.toEqual(
      Uint8Array.of(4, 5, 6)
    );
    await bridge.refreshPeerRecord("pairing-target");

    expect(requests).toEqual([
      { action: "runtimeGetSignedPeerRecordFor", peerId: "member-peer" },
      { action: "runtimeRefreshPeerRecord", peerId: "pairing-target" },
    ]);
  });
});
