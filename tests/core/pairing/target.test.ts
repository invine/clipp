import { importPairingTargetAndRequest } from "../../../packages/core/pairing/target";
import { encodePairingTarget } from "../../../packages/core/pairing/v2";

const peerId = "12D3KooWJ7cZsGHAw84d9JLU6V3bqm1SGUvDg68RTNWJyPCduyfv";

describe("Pairing Target import", () => {
  it("imports verified reachability, dials the named identity, then sends immediately", async () => {
    const calls: string[] = [];
    const text = encodePairingTarget({
      targetPeerId: peerId,
      signedPeerRecord: new Uint8Array([1]),
    });
    await importPairingTargetAndRequest({
      text,
      network: {
        start: async () => undefined,
        stop: async () => undefined,
        send: async () => undefined,
        connect: async (target) => void calls.push(`connect:${target}`),
        onMessage: () => undefined,
        onPeerConnected: () => undefined,
        onPeerDisconnected: () => undefined,
        onSelfPeerUpdate: () => undefined,
        getConnectedPeers: () => [],
        importSignedPeerRecord: async (target, record) =>
          void calls.push(`import:${target}:${record[0]}`),
        refreshPeerRecord: async (target) =>
          void calls.push(`refresh:${target}`),
      },
      request: async (target) => {
        calls.push(`request:${target}`);
        return new Uint8Array();
      },
    });
    expect(calls).toEqual([
      `import:${peerId}:1`,
      `refresh:${peerId}`,
      `connect:${peerId}`,
      `request:${peerId}`,
    ]);
  });

  it.each(["invalid_signed_peer_record", "lookup_timeout"])(
    "still requests pairing using verified reachability when relay refresh fails with %s",
    async (error) => {
      const connect = jest.fn(async () => undefined);
      const request = jest.fn(async () => new Uint8Array());
      const text = encodePairingTarget({
        targetPeerId: peerId,
        signedPeerRecord: Uint8Array.of(1),
      });
      await importPairingTargetAndRequest({
        text,
        network: {
          start: async () => undefined,
          stop: async () => undefined,
          send: async () => undefined,
          connect,
          onMessage: () => undefined,
          onPeerConnected: () => undefined,
          onPeerDisconnected: () => undefined,
          onSelfPeerUpdate: () => undefined,
          getConnectedPeers: () => [],
          importSignedPeerRecord: async () => undefined,
          refreshPeerRecord: async () => {
            throw new Error(error);
          },
        },
        request,
      });
      expect(connect).toHaveBeenCalledWith(peerId);
      expect(request).toHaveBeenCalledWith(peerId);
    }
  );

  it.each(["invalid_signed_peer_record", "revoked_peer"])(
    "blocks dial and pairing after %s",
    async (error) => {
      const connect = jest.fn(async () => undefined);
      const refreshPeerRecord = jest.fn(async () => {
        throw new Error("revoked_peer");
      });
      const request = jest.fn(async () => new Uint8Array());
      await expect(
        importPairingTargetAndRequest({
          text: encodePairingTarget({
            targetPeerId: peerId,
            signedPeerRecord: Uint8Array.of(1),
          }),
          network: {
            start: async () => undefined,
            stop: async () => undefined,
            send: async () => undefined,
            connect,
            onMessage: () => undefined,
            onPeerConnected: () => undefined,
            onPeerDisconnected: () => undefined,
            onSelfPeerUpdate: () => undefined,
            getConnectedPeers: () => [],
            importSignedPeerRecord: async () => {
              if (error === "invalid_signed_peer_record")
                throw new Error(error);
            },
            refreshPeerRecord,
          },
          request,
        })
      ).rejects.toThrow(error);
      if (error === "invalid_signed_peer_record")
        expect(refreshPeerRecord).not.toHaveBeenCalled();
      else expect(refreshPeerRecord).toHaveBeenCalledWith(peerId);
      expect(connect).not.toHaveBeenCalled();
      expect(request).not.toHaveBeenCalled();
    }
  );
});
