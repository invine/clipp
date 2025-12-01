import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { ClipboardApp } from "@clipp/ui";
import type { Clip, Device, Identity, PendingRequest } from "@clipp/ui";

type AppState = {
  clips: Clip[];
  devices: Device[];
  pending: PendingRequest[];
  peers: string[];
  identity: Identity | null;
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
  identity: null,
  pinnedIds: [],
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
    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
    };
  }, []);

  async function handlePairText(txt: string) {
    const res = await window.clipp.pairFromText(txt);
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
        identity={state.identity}
        pinnedIds={state.pinnedIds || []}
        onDeleteClip={(id) => window.clipp.deleteClip(id)}
        onUnpair={(id) => window.clipp.unpairDevice(id)}
        onAccept={(dev) => window.clipp.acceptRequest(dev)}
        onReject={(dev) => window.clipp.rejectRequest(dev)}
        onPairText={handlePairText}
        onRequestQr={() => window.clipp.getIdentity()}
        onTogglePin={(id) => window.clipp.togglePin(id)}
        onClearAll={() => window.clipp.clearHistory()}
        onRenameIdentity={(name) => window.clipp.renameIdentity(name)}
      />
    </div>
  );
};

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
