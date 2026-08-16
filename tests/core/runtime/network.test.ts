import type { MessageHandler, MessagingTransport } from "../../../packages/core/messaging/transport";
import { createRuntimeNetworkProxy } from "../../../packages/core/runtime/network";

function createObservedTransport() {
  const handlers = new Map<string, MessageHandler[]>();
  const disconnect = jest.fn(async () => undefined);
  const transport: MessagingTransport = {
    start: async () => undefined,
    stop: async () => undefined,
    send: async () => undefined,
    connect: async () => undefined,
    disconnect,
    onMessage(protocol, handler) {
      handlers.set(protocol, [...(handlers.get(protocol) ?? []), handler]);
    },
    onPeerConnected: () => undefined,
    onPeerDisconnected: () => undefined,
    onSelfPeerUpdate: () => undefined,
    getConnectedPeers: () => [],
  };
  return {
    transport,
    disconnect,
    receive(protocol: string, from: string, data: Uint8Array) {
      handlers.get(protocol)?.forEach((handler) => handler(from, data));
    },
    handlerCount(protocol: string) {
      return handlers.get(protocol)?.length ?? 0;
    },
  };
}

describe("replaceable runtime network", () => {
  it("binds each protocol handler once to the initial and replacement transports", () => {
    const initial = createObservedTransport();
    const replacement = createObservedTransport();
    let current = initial.transport;
    const network = createRuntimeNetworkProxy(() => current);
    const received: string[] = [];

    network.onMessage("/clipp/pairing/1.0.0", (from) => received.push(from));
    network.bindCurrent();
    initial.receive("/clipp/pairing/1.0.0", "initial-peer", new Uint8Array());

    current = replacement.transport;
    network.bindCurrent();
    network.bindCurrent();
    replacement.receive("/clipp/pairing/1.0.0", "replacement-peer", new Uint8Array());

    expect(initial.handlerCount("/clipp/pairing/1.0.0")).toBe(1);
    expect(replacement.handlerCount("/clipp/pairing/1.0.0")).toBe(1);
    expect(received).toEqual(["initial-peer", "replacement-peer"]);
  });

  it("forwards disconnect to the current transport", async () => {
    const observed = createObservedTransport();
    const network = createRuntimeNetworkProxy(() => observed.transport);

    await network.disconnect?.("peer-a");

    expect(observed.disconnect).toHaveBeenCalledWith("peer-a");
  });
});
