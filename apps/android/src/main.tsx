import React, { useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom/client";
import { ClipboardApp } from "@clipp/ui";
import type { Clip, Device, Identity, PendingRequest } from "@clipp/ui";
import { AndroidClient, createAndroidClient, type AndroidAppState } from "./client";
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
  diagnostics: {
    lastPairingAttempt: null,
  },
};

const bgStyle = {
  minHeight: "100vh",
  background: "radial-gradient(circle at top, #202333 0, #101114 60%)",
  color: "white",
};

function App() {
  const client = useMemo<AndroidClient>(() => createAndroidClient(), []);
  const [state, setState] = useState<AndroidAppState>(initialState);
  const [error, setError] = useState<string | null>(null);
  const [initializationError, setInitializationError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    client
      .start()
      .then(() => client.getState())
      .then((next) => {
        if (!cancelled) setState(next);
      })
      .catch((err) => {
        console.error("Failed to start Android client", err);
        void client.getInitializationError().then((initialization) => {
          if (cancelled) return;
          if (initialization) {
            setInitializationError(true);
            setError(null);
          } else {
            setError("Unable to start background services. Check clipboard permissions.");
          }
        });
      });

    const unsubscribe = client.onUpdate((next) => {
      if (!cancelled) setState(next);
    });

    return () => {
      cancelled = true;
      unsubscribe();
      client.stop();
    };
  }, [client]);

  async function handlePairText(txt: string) {
    const res = await client.pairFromText(txt);
    console.info("[clipp:android:pairing] pairFromText result", JSON.stringify(res));
    if (res?.ok === false) {
      const suffix = res.diagnostics?.attemptId
        ? `\n\nAttempt: ${res.diagnostics.attemptId}\nDetails are logged under [clipp:android:pairing].`
        : "";
      alert(
        res.error === "invalid"
          ? `Invalid pairing payload${suffix}`
          : res.error === "no_target"
          ? `Could not find a dialable address${suffix}`
          : `Failed to reach device${suffix}`
      );
    }
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
    <div style={bgStyle}>
      {error && (
        <div
          style={{
            background: "rgba(248, 113, 113, 0.1)",
            border: "1px solid rgba(248, 113, 113, 0.3)",
            color: "#fecdd3",
            padding: 12,
            margin: 12,
            borderRadius: 12,
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}
      <PairingDiagnosticsPanel attempt={state.diagnostics?.lastPairingAttempt || null} />
      <ClipboardApp
        clips={state.clips as Clip[]}
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
        initializationError={initializationError}
        identityRotationRecovery={state.identityRotationRecovery}
        identityRotationNotice={state.identityRotationNotice}
        onDeleteClip={(id) => client.deleteClip(id)}
        onUnpair={(id) => client.unpairDevice(id)}
        onRenameDevice={(id, name) => client.renameDevice(id, name)}
        onRenameIdentity={(name) => client.renameIdentity(name)}
        onAccept={(dev) => client.acceptRequest(dev)}
        onReject={(dev) => client.rejectRequest(dev)}
        onPairText={handlePairText}
        onScanPairingCode={handleScanPairingCode}
        onRequestPairingCode={() => client.getPairingCode()}
        onReuseClip={(id) => client.reuseClip(id)}
        onShareNow={() => client.shareCurrentClipboard()}
        onSetPinned={async (id, pinned) => {
          await client.setPinned(id, pinned);
        }}
        onClearAll={() => client.clearHistory()}
        onDismissClipboardHistoryError={() => client.dismissClipboardHistoryError()}
        onRetryHistoryCleanup={() => client.retryHistoryCleanup()}
        onAcknowledgeIdentityRotationNotice={() => client.acknowledgeIdentityRotationNotice()}
        onSetLocalRetention={async (retentionMs) => { await client.setLocalRetention(retentionMs); }}
        onSetAutoSync={async (enabled) => { await client.setAutoSync(enabled); }}
        onSetBackgroundContinuity={async (enabled) => { await client.setBackgroundContinuity(enabled); }}
        onExportBackgroundContinuityDiagnostics={() => client.exportBackgroundContinuityDiagnostics()}
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
      open={attempt.status === "failed"}
      style={{
        margin: 12,
        padding: 12,
        borderRadius: 12,
        border:
          attempt.status === "failed"
            ? "1px solid rgba(248, 113, 113, 0.35)"
            : "1px solid rgba(94, 234, 212, 0.25)",
        background: "rgba(15, 23, 42, 0.72)",
        color: "#e5e7eb",
        fontSize: 12,
      }}
    >
      <summary style={{ cursor: "pointer", fontWeight: 700 }}>
        Pairing diagnostics: {attempt.status} ({attempt.attemptId})
      </summary>
      <pre
        style={{
          marginTop: 10,
          maxHeight: 260,
          overflow: "auto",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          color: "#cbd5e1",
        }}
      >
        {JSON.stringify(attempt, null, 2)}
      </pre>
    </details>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
