import "../../../packages/ui/src/styles.css";
import "../../../packages/ui/src/host.css";
import "./android-host.css";
import React, { useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom/client";
import { ClipboardApp } from "@clipp/ui";
import {
  createRuntimeUiRecovery,
  initialRuntimeUiRecovery,
} from "@core/runtime/uiRecovery";
import type { Clip, Device, Identity, PendingRequest } from "@clipp/ui";
import {
  AndroidClient,
  createAndroidClient,
  type AndroidAppState,
} from "./client";
import { bindAndroidHostGeometry } from "./hostGeometryNative";
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
  useEffect(() => bindAndroidHostGeometry(), []);
  const client = useMemo<AndroidClient>(() => createAndroidClient(), []);
  const [state, setState] = useState<AndroidAppState>(initialState);
  const [recovery, setRecovery] = useState(initialRuntimeUiRecovery);
  const consumer = useMemo(
    () =>
      createRuntimeUiRecovery<AndroidAppState>({
        load: async () => {
          await client.start();
          return client.getState();
        },
        initializationError: async () =>
          (await client.getInitializationError()) ?? null,
        confirmed: (state) =>
          !state.historyUnavailable && !state.historyRefreshError,
        onState: setState,
        onRecovery: setRecovery,
      }),
    [client]
  );
  useEffect(() => {
    void consumer.load();
    const unsubscribe = client.onUpdate((state) => consumer.live(state));
    return () => {
      consumer.cancel();
      unsubscribe();
      client.stop();
    };
  }, [client, consumer]);

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
      <ClipboardApp
        pairingDiagnostics={
          <PairingDiagnosticsPanel
            attempt={state.diagnostics?.lastPairingAttempt || null}
          />
        }
        clips={state.clips as Clip[]}
        historyLoading={recovery.loading}
        historyUnavailable={
          !recovery.loading && (state.historyUnavailable || false)
        }
        historyRefreshError={
          state.historyRefreshError ? "history_unavailable" : null
        }
        onRetryHistoryRefresh={() => consumer.load()}
        runtimeError={
          recovery.unavailable && !recovery.initializationError
            ? "Android services could not be started or loaded."
            : null
        }
        onRetryRuntime={() => consumer.load()}
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
        initializationError={recovery.initializationError}
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
          if (!(await consumer.load()))
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
        onRetryInitialization={() =>
          consumer.load(async () => {
            await client.retryIdentityInitialization();
          })
        }
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
    <div
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
      <p style={{ fontWeight: 700 }}>
        Pairing diagnostics: {attempt.status} ({attempt.attemptId})
      </p>
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
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
