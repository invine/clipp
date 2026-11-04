import { useNotificationAvailability } from "../../../packages/ui/src/useNotificationAvailability";
import { useNotificationRequests } from "../../../packages/ui/src/useNotificationRequests";
import { useRuntimeSettings } from "../../../packages/ui/src/useRuntimeSettings";
import "../../../packages/ui/src/styles.css";
import "../../../packages/ui/src/host.css";
import "./electron-host.css";
import React, { useEffect, useLayoutEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom/client";
import { ClipboardWorkspace } from "../../../packages/ui/src/ClipboardWorkspace";
import type { ClipboardAppProps } from "../../../packages/ui/src/ClipboardApp";
import { createUiRuntimeStore } from "../../../packages/ui/src/runtimeAdapter";
import { createUiSession } from "../../../packages/ui/src/uiSession";
import { bindElectronHostTaskInput } from "./hostTaskInput";
import {
  createRuntimeUiRecovery,
  initialRuntimeUiRecovery,
} from "../../../packages/core/runtime/uiRecovery.js";
import type {
  Clip,
  ClipboardHistoryError,
  Device,
  HistoryPolicyError,
  Identity,
  PairingError,
  PairingOutcomeSnapshot,
  PairingWaiting,
  PeerConnectionInfo,
  PendingRequest,
  RelayConnectionInfo,
} from "../../../packages/ui/src/types";
import type { IdentityRotationNoticeReason } from "../../../packages/ui/src/identityRotationNotice";
import type {
  RelayConfiguration,
  RelayState,
} from "../../../packages/core/network/managedRelays.js";
import type { IdentityResetState } from "../../../packages/core/trust/manualIdentityReset.js";

type AppState = {
  clips: Clip[];
  devices: Device[];
  pending: PendingRequest[];
  waiting: PairingWaiting[];
  pairingErrors: PairingError[];
  pairingState?: PairingOutcomeSnapshot;
  peers: string[];
  connectionStateKnown?: boolean;
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
  identityResetState?: IdentityResetState;
};

const initialState: AppState = {
  clips: [],
  devices: [],
  pending: [],
  waiting: [],
  pairingErrors: [],
  peers: [],
  peerConnections: [],
  relayConnections: [],
  identity: null,
  pinnedIds: [],
  relayAddresses: [],
};

function ElectronWorkspace({
  props,
  session,
}: {
  props: ClipboardAppProps;
  session: ReturnType<typeof createUiSession>;
}) {
  const adapter = useMemo(() => createUiRuntimeStore(props), []);
  useLayoutEffect(() => adapter.publish(props), [adapter, props]);
  return <ClipboardWorkspace adapter={adapter} session={session} />;
}

const App = () => {
  const session = useMemo(() => createUiSession(), []);
  useEffect(() => bindElectronHostTaskInput(window.clipp, session), [session]);
  const notificationControls = useNotificationAvailability(window.clipp);
  const appearanceSettings = useRuntimeSettings({
    send: (message) => {
      if (!window.clipp) throw new Error("bridge_unavailable");
      return message.type === "getSettings"
        ? window.clipp.getSettings()
        : window.clipp.setSettings(message.settings);
    },
    subscribe: (listener) => {
      if (!window.clipp?.onSettingsUpdate)
        throw new Error("bridge_unavailable");
      return window.clipp.onSettingsUpdate((snapshot) =>
        listener({ type: "settingsState", snapshot })
      );
    },
  });
  const [state, setState] = useState<AppState>(initialState);
  const [recovery, setRecovery] = useState(initialRuntimeUiRecovery);
  const consumer = useMemo(
    () =>
      createRuntimeUiRecovery<AppState>({
        load: async () => {
          if (!window.clipp) throw new Error("bridge_unavailable");
          return window.clipp.getState();
        },
        initializationError: async () =>
          (await window.clipp?.getInitializationError?.()) ?? null,
        version: (state) => state.pairingState,
        authority: () => window.clipp.getRuntimeAuthority(),
        confirmed: (state) =>
          !state.historyUnavailable && !state.historyRefreshError,
        onState: setState,
        onRecovery: setRecovery,
      }),
    []
  );
  useEffect(() => {
    const api = window.clipp;
    const unsubscribe = api?.onUpdate((state) => consumer.live(state));
    const unlog = api?.onLog?.((payload) => {
      const { level, message, data } = payload || {};
      const fn =
        level === "warn"
          ? console.warn
          : level === "error"
            ? console.error
            : console.info;
      fn(`[clipp:${level || "info"}] ${message || ""}`, data || "");
    });
    void consumer.load();
    return () => {
      consumer.cancel();
      if (unsubscribe) unsubscribe();
      if (unlog) unlog();
    };
  }, [consumer]);

  useNotificationRequests(window.clipp, session, {
    ready:
      !recovery.loading &&
      !recovery.unavailable &&
      !!state.pairingState &&
      !!state.identity &&
      !state.identityRotationRecovery,
    clipIds: state.clips.map((clip) => clip.id),
    requestIds: state.pending.map((request) => request.deviceId),
  });

  async function handlePairText(txt: string) {
    return await window.clipp.pairFromText(txt);
  }

  const props: ClipboardAppProps = {
    notificationControls,
    appearanceSettings,
    clips: state.clips,
    devices: state.devices,
    pending: state.pending,
    requestsLoading: recovery.loading,
    requestsUnavailable: recovery.unavailable || !state.pairingState,
    onRetryRequests: () => consumer.load(),
    waiting: state.waiting,
    pairingErrors: state.pairingErrors,
    pairingOutcomes: state.pairingState?.outcomes,
    onDismissPairingOutcome: (target) =>
      state.pairingState
        ? window.clipp.dismissPairingOutcome(target, state.pairingState)
        : Promise.resolve(false),
    peers: state.peers,
    connectionStateKnown:
      state.connectionStateKnown === true && !recovery.unavailable,
    peerConnections: state.peerConnections || [],
    relayConnections: state.relayConnections || [],
    identity: state.identity,
    pinnedIds: state.pinnedIds || [],
    historyLoading: recovery.loading,
    historyUnavailable:
      !recovery.loading && (state.historyUnavailable || false),
    historyRefreshError: state.historyRefreshError
      ? "history_unavailable"
      : null,
    onRetryHistoryRefresh: () => consumer.load(),
    runtimeError:
      recovery.unavailable && !recovery.initializationError
        ? "Runtime state could not be loaded."
        : null,
    onRetryRuntime: () => consumer.load(),
    localRetentionMs: state.localRetentionMs,
    autoSync: state.autoSync,
    autoSyncKnown: !recovery.loading && !recovery.unavailable,
    autoSyncLoading: recovery.loading,
    clipboardHistoryError: state.clipboardHistoryError,
    historyPolicyError: state.historyPolicyError,
    relayAddresses: state.relayAddresses || [],
    managedRelayConfigurations: state.managedRelayConfigurations || [],
    managedRelayStates: state.managedRelayStates || [],
    initializationError: recovery.initializationError,
    identityRotationRecovery: state.identityRotationRecovery,
    identityRotationNotice: state.identityRotationNotice,
    identityResetState: state.identityResetState,
    manualIdentityResetAvailable: false,
    identityResetActions: window.clipp.identityReset,
    onPairAfterIdentityReset: () =>
      session.open({ kind: "pairing", origin: "identity-reset-complete" }),
    onCopyFormerIdentity: async (receipt) => {
      const result = await window.clipp.identityReset.copyFormerPeerId(
        receipt.receiptId
      );
      if (result.status !== "copied")
        throw new Error("peer_id_copy_unconfirmed");
    },
    onDeleteClip: (id) => window.clipp.deleteClip(id),
    onUnpair: (id) => window.clipp.unpairDevice(id),
    onRenameDevice: (id, name) => window.clipp.renameDevice(id, name),
    onAccept: (dev) => window.clipp.acceptRequest(dev),
    onReject: (dev) => window.clipp.rejectRequest(dev),
    onPairText: handlePairText,
    onRequestPairingCode: () => window.clipp.openQrWindow(),
    onCopyPairingText: (text) => window.clipp.copyPairingText(text),
    onReuseClip: async (id) => (await window.clipp.reuseClip(id)).outcome,
    onShareNow: () => window.clipp.shareNow(),
    onSetPinned: (id, pinned) => window.clipp.setPinned(id, pinned),
    onClearAll: async () => {
      await window.clipp.clearHistory();
      if (!(await consumer.load())) throw new Error("history_refresh_failed");
    },
    onDismissClipboardHistoryError: () =>
      window.clipp.dismissClipboardHistoryError(),
    onRetryHistoryCleanup: () => window.clipp.retryHistoryCleanup(),
    onAcknowledgeIdentityRotationNotice: () =>
      window.clipp.acknowledgeIdentityRotationNotice(),
    onSetLocalRetention: (retentionMs) =>
      window.clipp.setLocalRetention(retentionMs),
    onSetAutoSync: (enabled) => window.clipp.setAutoSync(enabled),
    onRetryAutoSync: () => window.clipp.refreshAutoSync(),
    onRenameIdentity: (name, expectedDeviceId) =>
      window.clipp.renameIdentity(name, expectedDeviceId),
    onRetryInitialization: () =>
      consumer.load(() => window.clipp.retryIdentityInitialization()),
    onRefreshManagedRelays: () => window.clipp.refreshManagedRelays(),
    onMutateManagedRelay: (mutation) =>
      window.clipp.mutateManagedRelay(mutation),
    onManagedRelayLogin: (key) => window.clipp.managedRelayLogin(key),
    onManagedRelayAccount: (key) => window.clipp.managedRelayAccount(key),
    onManagedRelayRetry: (key) => window.clipp.managedRelayRetry(key),
    session,
  };
  return (
    <div className="electron-host">
      <ElectronWorkspace props={props} session={session} />
    </div>
  );
};

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
