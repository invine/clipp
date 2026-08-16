export type Clip = {
  id: string;
  type: string;
  content: string;
  timestamp: number;
  senderId: string;
};

export type Device = {
  deviceId: string;
  deviceName: string;
  publicKey: string;
  createdAt: number;
  multiaddr?: string;
  multiaddrs?: string[];
};

export type Identity = {
  deviceId: string;
  deviceName: string;
  publicKey: string;
  privateKey?: string;
  createdAt: number;
  multiaddr?: string;
  multiaddrs?: string[];
};

export type PendingRequest = Device;
export type PairingWaiting = { targetPeerId: string; expiresAtUnixMs: number };

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

export type PairingCode = {
  image: string;
  text: string;
};

export type PeerState = {
  peers: string[];
  peerConnections?: PeerConnectionInfo[];
  relayConnections?: RelayConnectionInfo[];
};

export type PinnedState = string[];
