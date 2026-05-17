import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { ClipboardApp } from "@clipp/ui";
import type { Clip, Device, Identity, PeerConnectionInfo, PendingRequest, RelayConnectionInfo } from "@clipp/ui";

type AppState = {
  clips: Clip[];
  devices: Device[];
  pending: PendingRequest[];
  peers: string[];
  peerConnections?: PeerConnectionInfo[];
  relayConnections?: RelayConnectionInfo[];
  identity: Identity | null;
  relayAddresses: string[];
  pinnedIds?: string[];
  diagnostics?: {
    lastClipboardCheck: number | null;
    lastClipboardPreview: string | null;
    lastClipboardError: string | null;
  };
};

const initialState: AppState = {
  clips: [],
  devices: [],
  pending: [],
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

  useEffect(() => {
    let cancelled = false;
    const api = window.clipp;
    if (!api) {
      setError("Bridge unavailable (preload not loaded)");
      return;
    }
    async function load() {
      try {
        const s = await api.getState();
        if (!cancelled) setState(s);
      } catch (err) {
        if (!cancelled) setError("Failed to load state");
        console.error("Failed to load state", err);
      }
    }
    load();
    const unsubscribe = api.onUpdate((s) => !cancelled && setState(s));
    const unlog = api.onLog?.((payload) => {
      const { level, message, data } = payload || {};
      const fn = level === "warn" ? console.warn : level === "error" ? console.error : console.info;
      fn(`[clipp:${level || "info"}] ${message || ""}`, data || "");
    });
    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
      if (unlog) unlog();
    };
  }, []);

  async function handlePairText(txt: string) {
    const res = await window.clipp.pairFromText(txt);
    console.info("[clipp] pairFromText result", res);
    if (res?.ok === false) {
      alert(res.error === "invalid" ? "Invalid pairing payload" : "Failed to reach device");
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-950 to-black text-white">
      <ClipboardApp
        clips={state.clips}
        devices={state.devices}
        pending={state.pending}
        peers={state.peers}
        peerConnections={state.peerConnections || []}
        relayConnections={state.relayConnections || []}
        identity={state.identity}
        pinnedIds={state.pinnedIds || []}
        relayAddresses={state.relayAddresses || []}
        onDeleteClip={(id) => window.clipp.deleteClip(id)}
        onUnpair={(id) => window.clipp.unpairDevice(id)}
        onRenameDevice={(id, name) => window.clipp.renameDevice(id, name)}
        onAccept={(dev) => window.clipp.acceptRequest(dev)}
        onReject={(dev) => window.clipp.rejectRequest(dev)}
        onPairText={handlePairText}
        onRequestPairingCode={() => window.clipp.openQrWindow()}
        onTogglePin={(id) => window.clipp.togglePin(id)}
        onClearAll={() => window.clipp.clearHistory()}
        onRenameIdentity={(name) => window.clipp.renameIdentity(name)}
        onSetRelayAddresses={async (addrs) => {
          const res = await window.clipp.setRelayAddresses(addrs);
          return res?.relayAddresses || addrs;
        }}
      />
    </div>
  );
};

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
