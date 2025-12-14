import { contextBridge, ipcRenderer } from "electron";
import type { Clip, Device, Identity, PendingRequest } from "../../../packages/ui/src/types.js";

type AppState = {
  clips: Clip[];
  devices: Device[];
  pending: PendingRequest[];
  peers: string[];
  identity: Identity | null;
  relayAddresses: string[];
  diagnostics?: {
    lastClipboardCheck: number | null;
    lastClipboardPreview: string | null;
    lastClipboardError: string | null;
  };
  pinnedIds?: string[];
};

const api = {
  getState: () => ipcRenderer.invoke("clipp:get-state") as Promise<AppState>,
  getIdentity: () => ipcRenderer.invoke("clipp:get-identity") as Promise<Identity | null>,
  deleteClip: (id: string) => ipcRenderer.invoke("clipp:delete-clip", id),
  clearHistory: () => ipcRenderer.invoke("clipp:clear-history"),
  unpairDevice: (id: string) => ipcRenderer.invoke("clipp:unpair-device", id),
  acceptRequest: (device: PendingRequest) =>
    ipcRenderer.invoke("clipp:respond-trust", { accept: true, device }),
  rejectRequest: (device: PendingRequest) =>
    ipcRenderer.invoke("clipp:respond-trust", { accept: false, device }),
  pairFromText: (txt: string) => ipcRenderer.invoke("clipp:pair-text", txt),
  // TODO: confirm that it's not used anywhere
  // shareNow: () => ipcRenderer.invoke("clipp:share-now"),
  openQrWindow: () => ipcRenderer.invoke("clipp:open-qr-window"),
  togglePin: (id: string) => ipcRenderer.invoke("clipp:toggle-pin", id),
  renameIdentity: (name: string) => ipcRenderer.invoke("clipp:rename-identity", name),
  setRelayAddresses: (addrs: string[]) => ipcRenderer.invoke("clipp:set-relay-addresses", addrs),
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
