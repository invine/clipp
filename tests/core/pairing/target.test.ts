import { importPairingTargetAndRequest } from "../../../packages/core/pairing/target";
import { encodePairingTarget } from "../../../packages/core/pairing/v2";

const peerId = "12D3KooWJ7cZsGHAw84d9JLU6V3bqm1SGUvDg68RTNWJyPCduyfv";

describe("Pairing Target import", () => {
  it("imports verified reachability, dials the named identity, then sends immediately", async () => {
    const calls: string[] = [];
    const text = encodePairingTarget({ targetPeerId: peerId, signedPeerRecord: new Uint8Array([1]) });
    await importPairingTargetAndRequest({
      text,
      network: {
        start: async () => undefined, stop: async () => undefined, send: async () => undefined,
        connect: async (target) => void calls.push(`connect:${target}`), onMessage: () => undefined,
        onPeerConnected: () => undefined, onPeerDisconnected: () => undefined, onSelfPeerUpdate: () => undefined,
        getConnectedPeers: () => [], importSignedPeerRecord: async (target, record) => void calls.push(`import:${target}:${record[0]}`),
        lookupPeer: async (target) => void calls.push(`lookup:${target}`),
      },
      request: async (target) => { calls.push(`request:${target}`); return new Uint8Array(); },
    });
    expect(calls).toEqual([`import:${peerId}:1`, `lookup:${peerId}`, `connect:${peerId}`, `request:${peerId}`]);
  });
});
