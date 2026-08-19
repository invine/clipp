export type MessageHandler = (from: string, data: Uint8Array) => void;

export type PeerConnectionPath = "direct" | "relay" | "unknown";

export type PeerConnectionInfo = {
  peerId: string;
  path: PeerConnectionPath;
  hasDirect: boolean;
  hasRelay: boolean;
  addrs: string[];
};

export type RelayConnectionStatus = "connected" | "disconnected" | "unknown";

export type RelayConnectionInfo = {
  address: string;
  peerId: string | null;
  status: RelayConnectionStatus;
  addrs: string[];
};

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

  /** Send multiple frames on one short-lived application stream, then close it. */
  sendStream?(protocol: string, target: string, frames: AsyncIterable<Uint8Array>): Promise<void>;

  /**
   * Establish a best-effort connection to a peer without opening an application
   * protocol stream.
   *
   * `target` can be a peer id or a multiaddr string - the concrete transport decides.
   */
  connect(target: string): Promise<void>;

  /** Close authenticated connections to a peer after an invalid unknown-peer message. */
  disconnect?(peerId: string): Promise<void>;

  /**
   * Receive message payloads for a protocol.
   */
  onMessage(protocol: string, cb: MessageHandler): void;

  onPeerConnected(cb: (peerId: string) => void): void;
  onPeerDisconnected(cb: (peerId: string) => void): void;
  onRelayConnectionChanged?(cb: () => void): void;

  /**
   * Emits whenever the transport's own advertised/observed multiaddrs change.
   *
   * Used by apps to persist updated addresses for pairing/identity sharing.
   */
  onSelfPeerUpdate(cb: (multiaddrs: string[]) => void): void;

  getConnectedPeers(): string[];

  getSelfMultiaddrs?(): string[];

  getPeerConnectionInfo?(): PeerConnectionInfo[];

  getRelayConnectionInfo?(): RelayConnectionInfo[];

  /** Public, signed reachability data used only by an explicit Pairing Target. */
  getSignedPeerRecord?(): Promise<Uint8Array>;
  getSignedPeerRecordFor?(peerId: string): Promise<Uint8Array | undefined>;
  importSignedPeerRecord?(expectedPeerId: string, record: Uint8Array): Promise<void>;

  /** Looks up, verifies, imports, and persists one peer's latest reachability record. */
  refreshPeerRecord?(peerId: string): Promise<void>;
}
