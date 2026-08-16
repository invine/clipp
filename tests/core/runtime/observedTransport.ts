import type { MessageHandler, MessagingTransport } from "../../../packages/core/messaging/transport";

export function createObservedRuntimeTransport() {
  const handlers = new Map<string, MessageHandler[]>();
  const disconnectedPeers: string[] = [];
  const transport: MessagingTransport = {
    start: async () => undefined,
    stop: async () => undefined,
    send: async () => undefined,
    connect: async () => undefined,
    async disconnect(peerId) {
      disconnectedPeers.push(peerId);
    },
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
    disconnectedPeers,
    receive(protocol: string, from: string, data = new Uint8Array()) {
      handlers.get(protocol)?.forEach((handler) => handler(from, data));
    },
    handlerCount(protocol: string) {
      return handlers.get(protocol)?.length ?? 0;
    },
  };
}
