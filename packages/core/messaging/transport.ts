export type MessageHandler = (from: string, data: Uint8Array) => void;

/**
 * Minimal messaging transport port.
 *
 * Implementations (e.g. libp2p) live in outer layers; core use-cases depend on this interface.
 */
export interface MessagingTransport {
  start(): Promise<void>;
  stop(): Promise<void>;

  /**
   * Send a single message payload to a peer for a given protocol.
   *
   * `target` can be a peer id or a multiaddr string - the concrete transport decides.
   */
  send(protocol: string, target: string, data: Uint8Array): Promise<void>;

  /**
   * Receive message payloads for a protocol.
   */
  onMessage(protocol: string, cb: MessageHandler): void;

  onPeerConnected(cb: (peerId: string) => void): void;
  onPeerDisconnected(cb: (peerId: string) => void): void;

  getConnectedPeers(): string[];
}

