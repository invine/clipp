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
  createdAt: number;
  multiaddr?: string;
  multiaddrs?: string[];
};

export type PendingRequest = Device;

export type PeerState = {
  peers: string[];
};

export type PinnedState = string[];
