import "../../../packages/ui/src/styles.css";
import "../../../packages/ui/src/host.css";
import "./android-host.css";
import React, { useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom/client";
import { ClipboardApp } from "@clipp/ui";
import { createHistoryInitialLoadGate } from "@core/history/bootstrap";
import type { Clip, Device, Identity, PendingRequest } from "@clipp/ui";
import {
  AndroidClient,
  createAndroidClient,
  type AndroidAppState,
} from "./client";
import { scanPairingQrWithCamera } from "./qrCameraScanner";

const initialState: AndroidAppState = {
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
  managedRelayConfigurations: [],
  managedRelayStates: [],
  diagnostics: {
    lastPairingAttempt: null,
  },
};

function App() {
  const client = useMemo<AndroidClient>(() => createAndroidClient(), []);
  const [state, setState] = useState<AndroidAppState>(initialState);
  const [error, setError] = useState<string | null>(null);
  const [initializationError, setInitializationError] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyLoadFailed, setHistoryLoadFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const initialLoad = createHistoryInitialLoadGate<AndroidAppState>({
      onState: setState,
      onLoading: setHistoryLoading,
      onFailed: setHistoryLoadFailed,
    });

    client
      .start()
      .then(() => client.getState())
      .then((next) => initialLoad.resolved(next))
      .catch((err) => {
        console.error("Failed to start Android client", err);
        if (!initialLoad.rejected()) return;
        void client.getInitializationError().then((initialization) => {
          if (cancelled) return;
          if (initialization) {
            setInitializationError(true);
            setError(null);
          } else {
            setError(
              "Unable to start background services. Check clipboard permissions."
            );
          }
        });
      });

    const unsubscribe = client.onUpdate((next) => initialLoad.live(next));

    return () => {
      cancelled = true;
      initialLoad.cancel();
      unsubscribe();
      client.stop();
    };
  }, [client]);

  async function handlePairText(txt: string) {
    return await client.pairFromText(txt);
  }

  async function handleScanPairingCode(): Promise<string | null> {
    try {
      return await scanPairingQrWithCamera();
    } catch (err) {
      const message =
        err instanceof Error && err.message === "camera_permission_denied"
          ? "Camera permission is required to scan pairing QR codes."
          : err instanceof Error && err.message === "camera_not_found"
            ? "No camera was found on this device."
            : "Unable to open the camera.";
      alert(message);
      return null;
    }
  }

  return (
    <div className="android-host">
      {error && (
        <div
          style={{
            background: "var(--clipp-surface-raised)",
            border: "1px solid var(--clipp-danger)",
            color: "var(--clipp-danger)",
            padding: 12,
            margin: 12,
            borderRadius: 12,
            fontSize: ".875rem",
          }}
        >
          {error}
        </div>
      )}
      <ClipboardApp
        pairingDiagnostics={
          <PairingDiagnosticsPanel
            attempt={state.diagnostics?.lastPairingAttempt || null}
          />
        }
        clips={state.clips as Clip[]}
        historyLoading={historyLoading}
        historyUnavailable={
          !historyLoading &&
          (historyLoadFailed || state.historyUnavailable || false)
        }
        historyRefreshError={
          state.historyRefreshError ? "history_unavailable" : null
        }
        onRetryHistoryRefresh={async () => {
          const next = await client.getState();
          setState(next);
          setHistoryLoadFailed(false);
          return !next.historyUnavailable && !next.historyRefreshError;
        }}
        devices={state.devices as Device[]}
        pending={state.pending as PendingRequest[]}
        waiting={state.waiting || []}
        pairingErrors={state.pairingErrors || []}
        peers={state.peers}
        peerConnections={state.peerConnections || []}
        relayConnections={state.relayConnections || []}
        identity={state.identity as Identity | null}
        pinnedIds={state.pinnedIds || []}
        localRetentionMs={state.localRetentionMs}
        autoSync={state.autoSync}
        backgroundContinuity={state.backgroundContinuity}
        clipboardHistoryError={state.clipboardHistoryError}
        historyPolicyError={state.historyPolicyError}
        relayAddresses={state.relayAddresses || []}
        managedRelayConfigurations={state.managedRelayConfigurations || []}
        managedRelayStates={state.managedRelayStates || []}
        onRefreshManagedRelays={() => client.refreshManagedRelays()}
        onMutateManagedRelay={(mutation) => client.mutateManagedRelay(mutation)}
        onManagedRelayLogin={(key) => client.loginManagedRelay(key)}
        onManagedRelayAccount={(key) => client.openManagedRelayAccount(key)}
        onManagedRelayRetry={(key) => client.retryManagedRelay(key)}
        initializationError={initializationError}
        identityRotationRecovery={state.identityRotationRecovery}
        identityRotationNotice={state.identityRotationNotice}
        onDeleteClip={(id) => client.deleteClip(id)}
        onUnpair={(id) => client.unpairDevice(id)}
        onRenameDevice={(id, name) => client.renameDevice(id, name)}
        onRenameIdentity={(name, expectedDeviceId) =>
          client.renameIdentity(name, expectedDeviceId)
        }
        onAccept={(dev) => client.acceptRequest(dev)}
        onReject={(dev) => client.rejectRequest(dev)}
        onPairText={handlePairText}
        onScanPairingCode={handleScanPairingCode}
        onRequestPairingCode={() => client.getPairingCode()}
        onCopyPairingText={(text) => client.copyPairingText(text)}
        onReuseClip={(id) => client.reuseClip(id)}
        onShareNow={() => client.shareCurrentClipboard()}
        onSetPinned={async (id, pinned) => {
          await client.setPinned(id, pinned);
        }}
        onClearAll={async () => {
          await client.clearHistory();
          const next = await client.getState();
          setState(next);
          if (next.historyUnavailable || next.historyRefreshError)
            throw new Error("history_refresh_failed");
        }}
        onDismissClipboardHistoryError={() =>
          client.dismissClipboardHistoryError()
        }
        onRetryHistoryCleanup={() => client.retryHistoryCleanup()}
        onAcknowledgeIdentityRotationNotice={() =>
          client.acknowledgeIdentityRotationNotice()
        }
        onSetLocalRetention={async (retentionMs) => {
          await client.setLocalRetention(retentionMs);
        }}
        onSetAutoSync={(enabled) => client.setAutoSync(enabled)}
        onRetryAutoSync={() => client.refreshAutoSync()}
        onSetBackgroundContinuity={async (enabled) => {
          await client.setBackgroundContinuity(enabled);
        }}
        onExportBackgroundContinuityDiagnostics={() =>
          client.exportBackgroundContinuityDiagnostics()
        }
        onRetryInitialization={async () => {
          try {
            setState(await client.retryIdentityInitialization());
            setInitializationError(false);
          } catch {
            setInitializationError(true);
          }
        }}
      />
    </div>
  );
}

function PairingDiagnosticsPanel({
  attempt,
}: {
  attempt: NonNullable<AndroidAppState["diagnostics"]>["lastPairingAttempt"];
}) {
  if (!attempt) return null;

  return (
    <details
      style={{
        maxWidth: "100%",
        maxHeight: "25dvh",
        overflow: "auto",
        overflowWrap: "anywhere",
        margin: 0,
        padding: 12,
        borderRadius: 12,
        border:
          attempt.status === "failed"
            ? "1px solid var(--clipp-danger)"
            : "1px solid var(--clipp-border)",
        background: "var(--clipp-surface-raised)",
        color: "var(--clipp-text)",
        fontSize: ".875rem",
      }}
    >
      <summary style={{ cursor: "pointer", fontWeight: 700 }}>
        Pairing diagnostics: {attempt.status} ({attempt.attemptId})
      </summary>
      <pre
        style={{
          marginTop: 10,
          maxHeight: "15dvh",
          overflow: "auto",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          color: "var(--clipp-text-muted)",
        }}
      >
        {JSON.stringify(attempt, null, 2)}
      </pre>
    </details>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
