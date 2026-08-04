import type { MessagingTransport } from "../messaging/transport";

export function createRuntimeNetworkProxy(
  current: () => MessagingTransport | null | undefined
): MessagingTransport {
  const requireNetwork = (): MessagingTransport => {
    const network = current();
    if (!network) throw new Error("runtime_network_unavailable");
    return network;
  };
  return {
    start: () => requireNetwork().start(),
    stop: async () => current()?.stop(),
    send: (protocol, target, data) => requireNetwork().send(protocol, target, data),
    connect: (target) => requireNetwork().connect(target),
    onMessage: (protocol, handler) => requireNetwork().onMessage(protocol, handler),
    onPeerConnected: (handler) => requireNetwork().onPeerConnected(handler),
    onPeerDisconnected: (handler) => requireNetwork().onPeerDisconnected(handler),
    onRelayConnectionChanged: (handler) => requireNetwork().onRelayConnectionChanged?.(handler),
    onSelfPeerUpdate: (handler) => requireNetwork().onSelfPeerUpdate(handler),
    getConnectedPeers: () => current()?.getConnectedPeers() ?? [],
    getSelfMultiaddrs: () => current()?.getSelfMultiaddrs?.() ?? [],
    getPeerConnectionInfo: () => current()?.getPeerConnectionInfo?.() ?? [],
    getRelayConnectionInfo: () => current()?.getRelayConnectionInfo?.() ?? [],
  };
}
