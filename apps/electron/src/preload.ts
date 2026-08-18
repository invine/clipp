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
  diagnostics?: {
    lastClipboardCheck: number | null;
    lastClipboardPreview: string | null;
    lastClipboardError: string | null;
  };
  pinnedIds?: string[];
  localRetentionMs?: number;
  clipboardHistoryError?: ClipboardHistoryError | null;
  historyPolicyError?: HistoryPolicyError | null;
};

const api = {
  getState: () => ipcRenderer.invoke("clipp:get-state") as Promise<AppState>,
  getIdentity: () => ipcRenderer.invoke("clipp:get-identity") as Promise<Identity | null>,
  getInitializationError: () => ipcRenderer.invoke("clipp:get-initialization-error") as Promise<{ code: string } | null>,
  retryIdentityInitialization: () => ipcRenderer.invoke("clipp:retry-identity-initialization") as Promise<void>,
  deleteClip: (id: string) => ipcRenderer.invoke("clipp:delete-clip", id),
  clearHistory: () => ipcRenderer.invoke("clipp:clear-history"),
  unpairDevice: (id: string) => ipcRenderer.invoke("clipp:unpair-device", id),
  renameDevice: (id: string, name: string) => ipcRenderer.invoke("clipp:rename-device", { id, name }),
  acceptRequest: (device: PendingRequest) =>
    ipcRenderer.invoke("clipp:respond-trust", { accept: true, device }),
  rejectRequest: (device: PendingRequest) =>
    ipcRenderer.invoke("clipp:respond-trust", { accept: false, device }),
  pairFromText: (txt: string) => ipcRenderer.invoke("clipp:pair-text", txt),
  // TODO: confirm that it's not used anywhere
  // shareNow: () => ipcRenderer.invoke("clipp:share-now"),
  openQrWindow: () => ipcRenderer.invoke("clipp:open-qr-window") as Promise<PairingCode>,
  setPinned: (id: string, pinned: boolean) => ipcRenderer.invoke("clipp:set-pin", { id, pinned }),
  dismissClipboardHistoryError: () => ipcRenderer.invoke("clipp:dismiss-clipboard-history-error"),
  retryHistoryCleanup: () => ipcRenderer.invoke("clipp:retry-history-cleanup"),
  renameIdentity: (name: string) => ipcRenderer.invoke("clipp:rename-identity", name),
  setRelayAddresses: (addrs: string[]) => ipcRenderer.invoke("clipp:set-relay-addresses", addrs),
  setLocalRetention: (retentionMs: number) => ipcRenderer.invoke("clipp:set-local-retention", retentionMs),
  onUpdate: (cb: (state: AppState) => void) => {
    const listener = (_event: any, state: AppState) => cb(state);
    ipcRenderer.on("clipp:update", listener);
    return () => ipcRenderer.removeListener("clipp:update", listener);
  },
  onLog: (cb: (payload: { level: string; message: string; data?: any }) => void) => {
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
