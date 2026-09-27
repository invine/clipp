import { contextBridge, ipcRenderer } from "electron";
import type {
  Clip,
  Device,
  Identity,
  PairingCode,
  PairingError,
  PairingWaiting,
  PeerConnectionInfo,
  PendingRequest,
  RelayConnectionInfo,
  ClipboardHistoryError,
  HistoryPolicyError,
} from "../../../packages/ui/src/types.js";
import type { IdentityRotationNoticeReason } from "../../../packages/ui/src/identityRotationNotice.js";
import type {
  RelayConfiguration,
  RelayState,
} from "../../../packages/core/network/managedRelays.js";

type AppState = {
  clips: Clip[];
  devices: Device[];
  pending: PendingRequest[];
  waiting: PairingWaiting[];
  pairingErrors: PairingError[];
  peers: string[];
  peerConnections?: PeerConnectionInfo[];
  relayConnections?: RelayConnectionInfo[];
  identity: Identity | null;
  relayAddresses: string[];
  managedRelayConfigurations?: RelayConfiguration[];
  managedRelayStates?: RelayState[];
  pinnedIds?: string[];
  localRetentionMs?: number;
  autoSync?: boolean;
  clipboardHistoryError?: ClipboardHistoryError | null;
  historyPolicyError?: HistoryPolicyError | null;
  identityRotationRecovery?: boolean;
  identityRotationNotice?: IdentityRotationNoticeReason | null;
};

const api = {
  getState: () => ipcRenderer.invoke("clipp:get-state") as Promise<AppState>,
  getIdentity: () =>
    ipcRenderer.invoke("clipp:get-identity") as Promise<Identity | null>,
  getInitializationError: () =>
    ipcRenderer.invoke("clipp:get-initialization-error") as Promise<{
      code: string;
    } | null>,
  retryIdentityInitialization: () =>
    ipcRenderer.invoke("clipp:retry-identity-initialization") as Promise<void>,
  deleteClip: (id: string) => ipcRenderer.invoke("clipp:delete-clip", id),
  reuseClip: (id: string) => ipcRenderer.invoke("clipp:reuse-clip", id),
  shareNow: () => ipcRenderer.invoke("clipp:share-now"),
  clearHistory: () => ipcRenderer.invoke("clipp:clear-history"),
  unpairDevice: (id: string) => ipcRenderer.invoke("clipp:unpair-device", id),
  renameDevice: (id: string, name: string) =>
    ipcRenderer.invoke("clipp:rename-device", { id, name }),
  acceptRequest: (device: PendingRequest) =>
    ipcRenderer.invoke("clipp:respond-trust", { accept: true, device }),
  rejectRequest: (device: PendingRequest) =>
    ipcRenderer.invoke("clipp:respond-trust", { accept: false, device }),
  pairFromText: (txt: string) => ipcRenderer.invoke("clipp:pair-text", txt),
  openQrWindow: () =>
    ipcRenderer.invoke("clipp:open-qr-window") as Promise<PairingCode>,
  setPinned: (id: string, pinned: boolean) =>
    ipcRenderer.invoke("clipp:set-pin", { id, pinned }),
  dismissClipboardHistoryError: () =>
    ipcRenderer.invoke("clipp:dismiss-clipboard-history-error"),
  retryHistoryCleanup: () => ipcRenderer.invoke("clipp:retry-history-cleanup"),
  acknowledgeIdentityRotationNotice: () =>
    ipcRenderer.invoke("clipp:acknowledge-identity-rotation-notice"),
  renameIdentity: (name: string) =>
    ipcRenderer.invoke("clipp:rename-identity", name),
  setRelayAddresses: (addrs: string[]) =>
    ipcRenderer.invoke("clipp:set-relay-addresses", addrs),
  setManagedRelays: (configurations: RelayConfiguration[]) =>
    ipcRenderer.invoke("clipp:set-managed-relays", configurations) as Promise<
      RelayConfiguration[]
    >,
  managedRelayLogin: (key: string) =>
    ipcRenderer.invoke("clipp:managed-relay-login", key) as Promise<void>,
  managedRelayAccount: (key: string) =>
    ipcRenderer.invoke("clipp:managed-relay-account", key) as Promise<void>,
  managedRelayRetry: (key: string) =>
    ipcRenderer.invoke("clipp:managed-relay-retry", key) as Promise<void>,
  setLocalRetention: (retentionMs: number) =>
    ipcRenderer.invoke("clipp:set-local-retention", retentionMs),
  setAutoSync: (enabled: boolean) =>
    ipcRenderer.invoke("clipp:set-auto-sync", enabled),
  onUpdate: (cb: (state: AppState) => void) => {
    const listener = (_event: any, state: AppState) => cb(state);
    ipcRenderer.on("clipp:update", listener);
    return () => ipcRenderer.removeListener("clipp:update", listener);
  },
  onLog: (
    cb: (payload: { level: string; message: string; data?: any }) => void
  ) => {
    const listener = (_event: any, payload: any) => cb(payload);
    ipcRenderer.on("clipp:log", listener);
    return () => ipcRenderer.removeListener("clipp:log", listener);
  },
};

contextBridge.exposeInMainWorld("clipp", api);

declare global {
  interface Window {
    clipp: typeof api;
  }
}
