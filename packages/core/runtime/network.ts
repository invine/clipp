import type { MessageHandler, MessageStreamHandler, MessagingTransport, StreamingMessagingTransport } from "../messaging/transport";

export interface RuntimeNetworkProxy extends StreamingMessagingTransport {
  /** Attach registered protocol handlers to the currently active transport. */
  bindCurrent(): void;
}

export function createRuntimeNetworkProxy(
  current: () => MessagingTransport | null | undefined
): RuntimeNetworkProxy {
  const protocolHandlers: Array<{
    protocol: string;
    handler: MessageHandler;
    boundTransports: WeakSet<MessagingTransport>;
  }> = [];
  const streamHandlers: Array<{
    protocol: string;
    handler: MessageStreamHandler;
    boundTransports: WeakSet<MessagingTransport>;
  }> = [];
  const requireNetwork = (): MessagingTransport => {
    const network = current();
    if (!network) throw new Error("runtime_network_unavailable");
    return network;
  };
  const bindProtocolHandler = (
    registration: (typeof protocolHandlers)[number],
    network: MessagingTransport
  ) => {
    if (registration.boundTransports.has(network)) return;
    network.onMessage(registration.protocol, registration.handler);
    registration.boundTransports.add(network);
  };
  const bindStreamHandler = (
    registration: (typeof streamHandlers)[number],
    network: MessagingTransport
  ) => {
    if (registration.boundTransports.has(network)) return;
    if (!network.onStream) throw new Error("stream_messaging_unavailable");
    network.onStream(registration.protocol, registration.handler);
    registration.boundTransports.add(network);
  };
  const proxy: RuntimeNetworkProxy = {
    async start() {
      proxy.bindCurrent();
      await requireNetwork().start();
    },
    stop: async () => current()?.stop(),
    send: (protocol, target, data) => requireNetwork().send(protocol, target, data),
    sendStream: (protocol, target, frames) => {
      const network = requireNetwork();
      if (!network.sendStream) throw new Error("stream_messaging_unavailable");
      return network.sendStream(protocol, target, frames);
    },
    connect: (target) => requireNetwork().connect(target),
    async disconnect(peerId) {
      await requireNetwork().disconnect?.(peerId);
    },
    onMessage(protocol, handler) {
      const registration = { protocol, handler, boundTransports: new WeakSet<MessagingTransport>() };
      protocolHandlers.push(registration);
      const network = current();
      if (network) bindProtocolHandler(registration, network);
    },
    onStream(protocol, handler) {
      const registration = { protocol, handler, boundTransports: new WeakSet<MessagingTransport>() };
      streamHandlers.push(registration);
      const network = current();
      if (network) bindStreamHandler(registration, network);
    },
    onPeerConnected: (handler) => requireNetwork().onPeerConnected(handler),
    onPeerDisconnected: (handler) => requireNetwork().onPeerDisconnected(handler),
    onRelayConnectionChanged: (handler) => requireNetwork().onRelayConnectionChanged?.(handler),
    onSelfPeerUpdate: (handler) => requireNetwork().onSelfPeerUpdate(handler),
    getConnectedPeers: () => current()?.getConnectedPeers() ?? [],
    getSelfMultiaddrs: () => current()?.getSelfMultiaddrs?.() ?? [],
    getPeerConnectionInfo: () => current()?.getPeerConnectionInfo?.() ?? [],
    getRelayConnectionInfo: () => current()?.getRelayConnectionInfo?.() ?? [],
    getSignedPeerRecord: () => {
      const network = requireNetwork();
      if (!network.getSignedPeerRecord) throw new Error("signed_peer_record_unavailable");
      return network.getSignedPeerRecord();
    },
    importSignedPeerRecord: (expectedPeerId, record) => {
      const network = requireNetwork();
      if (!network.importSignedPeerRecord) throw new Error("signed_peer_record_unavailable");
      return network.importSignedPeerRecord(expectedPeerId, record);
    },
    bindCurrent() {
      const network = requireNetwork();
      protocolHandlers.forEach((registration) => bindProtocolHandler(registration, network));
      streamHandlers.forEach((registration) => bindStreamHandler(registration, network));
    },
  };
  return proxy;
}
