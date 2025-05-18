import { Libp2pEngine } from "../../../packages/core/libp2p/engine";
import { SyncMessage } from "../../../packages/core/models/SyncMessage";

// Mock libp2p imports to avoid ESM loading issues in Jest
jest.mock("../../../packages/core/libp2p/peer", () => ({
  createPeer: jest.fn(() => ({})),
}));

describe("Libp2pEngine - Additional", () => {
  it("calls all registered message handlers", async () => {
    const engine = new Libp2pEngine();
    const calls: any[] = [];
    engine.onMessage((msg, peerId) => calls.push(["a", msg, peerId]));
    engine.onMessage((msg, peerId) => calls.push(["b", msg, peerId]));
    // Simulate message
    (engine as any).handlers.forEach((fn: any) =>
      fn(
        { type: "HELLO", payload: {}, senderId: "p", timestamp: Date.now() },
        "peer-x"
      )
    );
    expect(calls.length).toBe(2);
  });

  it("broadcast sends to all peers (mocked)", async () => {
    const engine = new Libp2pEngine();
    (engine as any).node = {
      getConnections: () => [
        { remotePeer: { toString: () => "p1" } },
        { remotePeer: { toString: () => "p2" } },
      ],
      dialProtocol: async () => ({ sink: async () => {} }),
    };
    const msg: SyncMessage = {
      type: "HELLO",
      payload: {},
      senderId: "me",
      timestamp: Date.now(),
    };
    const spy = jest.spyOn(engine, "sendMessage").mockResolvedValue();
    await engine.broadcast(msg);
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });
});
