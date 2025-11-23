import { ClipboardMessagingLayer } from "../messaging";
import { TrustedDevice } from "../../trust";
import { Clip } from "../../models/Clip";

describe("ClipboardMessagingLayer", () => {
  it("should ignore messages from untrusted peers", async () => {
    const layer = new ClipboardMessagingLayer();
    // Add a trusted peer
    const trustedId = "peer-trusted";
    const device: TrustedDevice = {
      deviceId: trustedId,
      deviceName: "Test",
      publicKey: "pk",
      multiaddr: `/p2p/${trustedId}`,
      multiaddrs: [`/p2p/${trustedId}`],
      createdAt: Date.now(),
    };
    await (layer as any).trust.add(device);
    const received: any[] = [];
    layer.onMessage((msg) => received.push(msg));
    // Simulate receiving from trusted
    (layer as any).messageBus.emit({
      type: "CLIP",
      from: trustedId,
      clip: {
        id: "1",
        type: "text",
        content: "a",
        timestamp: Date.now(),
        senderId: trustedId,
      },
      sentAt: Date.now(),
    });
    // Simulate receiving from untrusted
    (layer as any).messageBus.emit({
      type: "CLIP",
      from: "peer-untrusted",
      clip: {
        id: "2",
        type: "text",
        content: "b",
        timestamp: Date.now(),
        senderId: "peer-untrusted",
      },
      sentAt: Date.now(),
    });
    expect(received.length).toBe(1);
    expect(received[0].from).toBe(trustedId);
  });

  it("should emit peer connect/disconnect events", async () => {
    const layer = new ClipboardMessagingLayer();
    const connected: string[] = [];
    const disconnected: string[] = [];
    layer.onPeerConnected((pid) => connected.push(pid));
    layer.onPeerDisconnected((pid) => disconnected.push(pid));
    (layer as any).connectBus.emit("peer-x");
    (layer as any).disconnectBus.emit("peer-x");
    expect(connected).toContain("peer-x");
    expect(disconnected).toContain("peer-x");
  });
});
