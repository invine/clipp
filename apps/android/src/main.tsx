import React, { useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom/client";
import { ClipboardApp } from "@clipp/ui";
import type { Clip, Device, Identity, PendingRequest } from "@clipp/ui";
import { AndroidClient, createAndroidClient, type AndroidAppState } from "./client";

const initialState: AndroidAppState = {
  clips: [],
  devices: [],
  pending: [],
  peers: [],
  identity: null,
  pinnedIds: [],
  diagnostics: {
    lastClipboardCheck: null,
    lastClipboardPreview: null,
    lastClipboardError: null,
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
        if (!cancelled) setError("Unable to start background services. Check clipboard permissions.");
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
    if (res?.ok === false) {
      alert(
        res.error === "invalid"
          ? "Invalid pairing payload"
          : res.error === "no_target"
          ? "Could not find a dialable address"
          : "Failed to reach device"
      );
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
      <ClipboardApp
        clips={state.clips as Clip[]}
        devices={state.devices as Device[]}
        pending={state.pending as PendingRequest[]}
        peers={state.peers}
        identity={state.identity as Identity | null}
        pinnedIds={state.pinnedIds || []}
        onDeleteClip={(id) => client.deleteClip(id)}
        onUnpair={(id) => client.unpairDevice(id)}
        onAccept={(dev) => client.acceptRequest(dev)}
        onReject={(dev) => client.rejectRequest(dev)}
        onPairText={handlePairText}
        onRequestQr={() => client.getIdentity()}
        onTogglePin={(id) => client.togglePin(id)}
        onClearAll={() => client.clearHistory()}
      />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
