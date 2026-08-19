import type { MessageHandler, MessageStreamHandler, StreamingMessagingTransport } from "../../../packages/core/messaging/transport";

export function createObservedRuntimeTransport() {
  const handlers = new Map<string, MessageHandler[]>();
  const streamHandlers = new Map<string, MessageStreamHandler>();
  const disconnectedPeers: string[] = [];
  const transport: StreamingMessagingTransport = {
    start: async () => undefined,
    stop: async () => undefined,
    send: async () => undefined,
    sendStream: async () => undefined,
    connect: async () => undefined,
    async disconnect(peerId) {
      disconnectedPeers.push(peerId);
    },
    onMessage(protocol, handler) {
      handlers.set(protocol, [...(handlers.get(protocol) ?? []), handler]);
    },
    onStream(protocol, handler) {
      streamHandlers.set(protocol, handler);
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
    async receiveStream(protocol: string, from: string, chunks: AsyncIterable<Uint8Array>) {
      await streamHandlers.get(protocol)?.(from, chunks);
    },
    handlerCount(protocol: string) {
      return handlers.get(protocol)?.length ?? 0;
    },
    streamHandlerCount(protocol: string) {
      return streamHandlers.has(protocol) ? 1 : 0;
    },
  };
}
