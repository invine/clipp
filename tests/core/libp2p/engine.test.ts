// Mock peer creation to avoid heavy deps
jest.mock("../../../packages/core/libp2p/peer", () => ({
  createPeer: jest.fn(async () => ({
    addEventListener: jest.fn(),
    handle: jest.fn(),
    start: jest.fn(),
    stop: jest.fn(),
    getConnections: jest.fn(() => []),
    dialProtocol: jest.fn(async () => ({ sink: jest.fn(async () => {}) })),
  })),
}));

jest.mock("../../../packages/core/libp2p/protocol", () => {
  return {
    PROTOCOL: "/clipp/sync/1.0.0",
    encodeMessage: jest.fn(() => new Uint8Array([1])),
    decodeMessage: jest.fn(),
  };
});

import { Libp2pEngine } from "../../../packages/core/libp2p/engine";
import { SyncMessage } from "../../../packages/core/models/SyncMessage";
import { createPeer } from "../../../packages/core/libp2p/peer";
import { encodeMessage, PROTOCOL } from "../../../packages/core/libp2p/protocol";

describe("Libp2pEngine", () => {
  it("start and stop are idempotent", async () => {
    const engine = new Libp2pEngine();
    await engine.start();
    await engine.start();
    expect(createPeer).toHaveBeenCalledTimes(1);
    await engine.stop();
    await engine.stop();
    const node = await (createPeer as jest.Mock).mock.results[0].value;
    expect(node.stop).toHaveBeenCalledTimes(1);
  });

  it("sendMessage dials peer and encodes message", async () => {
    const engine = new Libp2pEngine();
    await engine.start();
    const node = await (createPeer as jest.Mock).mock.results.slice(-1)[0].value;
    const msg: SyncMessage = { type: "HELLO", payload: {}, senderId: "me", timestamp: 1 } as any;
    await engine.sendMessage("peer-x", msg);
    expect(node.dialProtocol).toHaveBeenCalledWith("peer-x", PROTOCOL);
    expect(encodeMessage).toHaveBeenCalledWith(msg);
  });
});
