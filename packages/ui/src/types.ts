export type Clip = {
  id: string;
  type: "text" | "url";
  content: string;
  originPeerId: string;
  capturedAt: number;
  shareExpiresAt: number;
};

export type Device = {
  deviceId: string;
  deviceName: string;
  displayName?: string;
  localAlias?: string;
};

export type Identity = {
  deviceId: string;
  deviceName: string;
};

export type PendingRequest = Device;
export type PairingWaiting = { targetPeerId: string; expiresAtUnixMs: number };
export type PairingError = {
  targetPeerId: string;
  code: "membership_persistence_failed";
};

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

export type { PairingCode } from "../../core/pairing/qrCode";

export type PeerState = {
  peers: string[];
  peerConnections?: PeerConnectionInfo[];
  relayConnections?: RelayConnectionInfo[];
};

export type PinnedState = string[];

export type ClipboardHistoryError =
  | "clip_too_large"
  | "pending_capture_too_large"
  | "pending_capture_failed"
  | "pending_capture_dropped";

export type HistoryPolicyError = "history_cleanup_failed";

export type BackgroundContinuityDiagnosticStatus = {
  observedBackgroundFailureCount: number;
  supportState: "unqualified" | "limited";
  batteryOptimizationGuidance: boolean;
};
