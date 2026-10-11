import type { AutoSyncActionResult } from "../../../packages/core/runtime/autoSyncAction.js";
import type {
  RelayMutation,
  RelayMutationResult,
} from "../../../packages/core/network/relayMutations.js";
import type { RelayActionResult } from "../../../packages/core/network/relayActions.js";
import {
  confirmPayloadCopy,
  type PayloadCopyResult,
} from "../../../packages/core/clipboard/payloadCopy.js";
import type {
  PairingApprovalResult,
  PairingSubmissionResult,
} from "../../../packages/core/pairing/results";
import { contextBridge, ipcRenderer } from "electron";
import type {
  Clip,
  Device,
  Identity,
  PairingCode,
  PairingError,
  PairingOutcomeSnapshot,
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
  pairingState?: PairingOutcomeSnapshot;
  peers: string[];
  peerConnections?: PeerConnectionInfo[];
  relayConnections?: RelayConnectionInfo[];
  identity: Identity | null;
  relayAddresses: string[];
  managedRelayConfigurations?: RelayConfiguration[];
  managedRelayStates?: RelayState[];
  pinnedIds?: string[];
  historyUnavailable?: boolean;
  historyRefreshError?: boolean;
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
    ipcRenderer.invoke("clipp:respond-trust", {
      accept: true,
      device,
    }) as Promise<PairingApprovalResult>,
  rejectRequest: (device: PendingRequest) =>
    ipcRenderer.invoke("clipp:respond-trust", {
      accept: false,
      device,
    }) as Promise<PairingApprovalResult>,
  pairFromText: (txt: string) =>
    ipcRenderer.invoke(
      "clipp:pair-text",
      txt
    ) as Promise<PairingSubmissionResult>,
  dismissPairingOutcome: (
    targetPeerId: string,
    expected: { sessionId: string; revision: number }
  ) =>
    ipcRenderer.invoke("clipp:dismiss-pairing-outcome", {
      targetPeerId,
      expected,
    }) as Promise<boolean>,
  copyPairingText: (text: string): Promise<PayloadCopyResult> =>
    confirmPayloadCopy(() =>
      ipcRenderer.invoke("clipp:copy-pairing-text", text)
    ),
  openQrWindow: () =>
    ipcRenderer.invoke("clipp:open-qr-window") as Promise<PairingCode>,
  setPinned: (id: string, pinned: boolean) =>
    ipcRenderer.invoke("clipp:set-pin", { id, pinned }),
  dismissClipboardHistoryError: () =>
    ipcRenderer.invoke("clipp:dismiss-clipboard-history-error"),
  retryHistoryCleanup: () => ipcRenderer.invoke("clipp:retry-history-cleanup"),
  acknowledgeIdentityRotationNotice: () =>
    ipcRenderer.invoke("clipp:acknowledge-identity-rotation-notice"),
  renameIdentity: (name: string, expectedDeviceId: string) =>
    ipcRenderer.invoke("clipp:rename-identity", { name, expectedDeviceId }),
  refreshManagedRelays: (): Promise<RelayConfiguration[]> =>
    ipcRenderer.invoke("clipp:refresh-managed-relays"),
  mutateManagedRelay: (mutation: RelayMutation): Promise<RelayMutationResult> =>
    ipcRenderer.invoke(
      "clipp:mutate-managed-relay",
      mutation
    ) as Promise<RelayMutationResult>,
  managedRelayLogin: (key: string): Promise<RelayActionResult> =>
    ipcRenderer.invoke(
      "clipp:managed-relay-login",
      key
    ) as Promise<RelayActionResult>,
  managedRelayAccount: (key: string): Promise<RelayActionResult> =>
    ipcRenderer.invoke(
      "clipp:managed-relay-account",
      key
    ) as Promise<RelayActionResult>,
  managedRelayRetry: (key: string): Promise<RelayActionResult> =>
    ipcRenderer.invoke(
      "clipp:managed-relay-retry",
      key
    ) as Promise<RelayActionResult>,
  setLocalRetention: (retentionMs: number) =>
    ipcRenderer.invoke("clipp:set-local-retention", retentionMs),
  refreshAutoSync: (): Promise<boolean> =>
    ipcRenderer.invoke("clipp:refresh-auto-sync"),
  setAutoSync: (enabled: boolean): Promise<AutoSyncActionResult> =>
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
