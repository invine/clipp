import "../../../packages/ui/src/styles.css";
import "../../../packages/ui/src/host.css";
import "./electron-host.css";
import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { ClipboardApp } from "@clipp/ui";
import { createHistoryInitialLoadGate } from "../../../packages/core/history/bootstrap.js";
import type {
  Clip,
  ClipboardHistoryError,
  Device,
  HistoryPolicyError,
  Identity,
  IdentityRotationNoticeReason,
  PairingError,
  PairingWaiting,
  PeerConnectionInfo,
  PendingRequest,
  RelayConnectionInfo,
} from "@clipp/ui";
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
  historyUnavailable?: boolean;
  historyRefreshError?: boolean;
  localRetentionMs?: number;
  autoSync?: boolean;
  clipboardHistoryError?: ClipboardHistoryError | null;
  historyPolicyError?: HistoryPolicyError | null;
  identityRotationRecovery?: boolean;
  identityRotationNotice?: IdentityRotationNoticeReason | null;
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

const App = () => {
  const [state, setState] = useState<AppState>(initialState);
  const [, setError] = useState<string | null>(null);
  const [initializationError, setInitializationError] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyLoadFailed, setHistoryLoadFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const initialLoad = createHistoryInitialLoadGate<AppState>({
      onState: setState,
      onLoading: setHistoryLoading,
      onFailed: setHistoryLoadFailed,
    });
    const api = window.clipp;
    if (!api) {
      setError("Bridge unavailable (preload not loaded)");
      return;
    }
    async function load() {
      try {
        const s = await api.getState();
        initialLoad.resolved(s);
      } catch (err) {
        if (!initialLoad.rejected()) return;
        setError("Failed to load state");
        const initialization = await api
          .getInitializationError?.()
          .catch(() => null);
        if (!cancelled)
          setInitializationError(
            initialization?.code === "identity_initialization_failed"
          );
        console.error("Failed to load state", err);
      }
    }
    load();
    const unsubscribe = api.onUpdate((s) => initialLoad.live(s));
    const unlog = api.onLog?.((payload) => {
      const { level, message, data } = payload || {};
      const fn =
        level === "warn"
          ? console.warn
          : level === "error"
            ? console.error
            : console.info;
      fn(`[clipp:${level || "info"}] ${message || ""}`, data || "");
    });
    return () => {
      cancelled = true;
      initialLoad.cancel();
      if (unsubscribe) unsubscribe();
      if (unlog) unlog();
    };
  }, []);

  async function handlePairText(txt: string) {
    return await window.clipp.pairFromText(txt);
  }

  return (
    <div className="electron-host">
      <ClipboardApp
        clips={state.clips}
        devices={state.devices}
        pending={state.pending}
        waiting={state.waiting}
        pairingErrors={state.pairingErrors}
        peers={state.peers}
        peerConnections={state.peerConnections || []}
        relayConnections={state.relayConnections || []}
        identity={state.identity}
        pinnedIds={state.pinnedIds || []}
        historyLoading={historyLoading}
        historyUnavailable={
          !historyLoading &&
          (historyLoadFailed || state.historyUnavailable || false)
        }
        historyRefreshError={
          state.historyRefreshError ? "history_unavailable" : null
        }
        onRetryHistoryRefresh={async () => {
          const next = await window.clipp.getState();
          setState(next);
          setHistoryLoadFailed(false);
          return !next.historyUnavailable && !next.historyRefreshError;
        }}
        localRetentionMs={state.localRetentionMs}
        autoSync={state.autoSync}
        clipboardHistoryError={state.clipboardHistoryError}
        historyPolicyError={state.historyPolicyError}
        relayAddresses={state.relayAddresses || []}
        managedRelayConfigurations={state.managedRelayConfigurations || []}
        managedRelayStates={state.managedRelayStates || []}
        initializationError={initializationError}
        identityRotationRecovery={state.identityRotationRecovery}
        identityRotationNotice={state.identityRotationNotice}
        onDeleteClip={(id) => window.clipp.deleteClip(id)}
        onUnpair={(id) => window.clipp.unpairDevice(id)}
        onRenameDevice={(id, name) => window.clipp.renameDevice(id, name)}
        onAccept={(dev) => window.clipp.acceptRequest(dev)}
        onReject={(dev) => window.clipp.rejectRequest(dev)}
        onPairText={handlePairText}
        onRequestPairingCode={() => window.clipp.openQrWindow()}
        onCopyPairingText={(text) => window.clipp.copyPairingText(text)}
        onReuseClip={async (id) => (await window.clipp.reuseClip(id)).outcome}
        onShareNow={() => window.clipp.shareNow()}
        onSetPinned={(id, pinned) => window.clipp.setPinned(id, pinned)}
        onClearAll={async () => {
          await window.clipp.clearHistory();
          const next = await window.clipp.getState();
          setState(next);
          if (next.historyUnavailable || next.historyRefreshError)
            throw new Error("history_refresh_failed");
        }}
        onDismissClipboardHistoryError={() =>
          window.clipp.dismissClipboardHistoryError()
        }
        onRetryHistoryCleanup={() => window.clipp.retryHistoryCleanup()}
        onAcknowledgeIdentityRotationNotice={() =>
          window.clipp.acknowledgeIdentityRotationNotice()
        }
        onSetLocalRetention={(retentionMs) =>
          window.clipp.setLocalRetention(retentionMs)
        }
        onSetAutoSync={(enabled) => window.clipp.setAutoSync(enabled)}
        onRetryAutoSync={() => window.clipp.refreshAutoSync()}
        onRenameIdentity={(name, expectedDeviceId) =>
          window.clipp.renameIdentity(name, expectedDeviceId)
        }
        onRetryInitialization={() => window.clipp.retryIdentityInitialization()}
        onRefreshManagedRelays={() => window.clipp.refreshManagedRelays()}
        onMutateManagedRelay={(mutation) =>
          window.clipp.mutateManagedRelay(mutation)
        }
        onManagedRelayLogin={(key) => window.clipp.managedRelayLogin(key)}
        onManagedRelayAccount={(key) => window.clipp.managedRelayAccount(key)}
        onManagedRelayRetry={(key) => window.clipp.managedRelayRetry(key)}
      />
    </div>
  );
};

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
