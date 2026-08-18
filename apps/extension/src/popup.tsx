/* global chrome */
import React, { useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import QRCode from "qrcode";
import "./styles/tailwind-built.css";
import {
  ClipboardApp,
  Clip,
  ClipboardHistoryError,
  Device,
  HistoryPolicyError,
  Identity,
  PairingCode,
  PairingError,
  PairingWaiting,
  PeerConnectionInfo,
  PendingRequest,
} from "../../../packages/ui";
import { decodePairingTarget } from "../../../packages/core/pairing/v2";

const Popup = () => {
  const [clips, setClips] = useState<Clip[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [pending, setPending] = useState<PendingRequest[]>([]);
  const [waiting, setWaiting] = useState<PairingWaiting[]>([]);
  const [pairingErrors, setPairingErrors] = useState<PairingError[]>([]);
  const [peers, setPeers] = useState<string[]>([]);
  const [peerConnections, setPeerConnections] = useState<PeerConnectionInfo[]>([]);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [localRetentionMs, setLocalRetentionMs] = useState(30 * 24 * 60 * 60 * 1000);
  const [clipboardHistoryError, setClipboardHistoryError] = useState<ClipboardHistoryError | null>(null);
  const [historyPolicyError, setHistoryPolicyError] = useState<HistoryPolicyError | null>(null);
  const [initializationError, setInitializationError] = useState(false);
  const lastClipboardRef = useRef("");

  useEffect(() => {
    refreshHistory();
    refreshDevices();
    refreshPending();
    refreshPeers();
    chrome.runtime.sendMessage({ type: "getRuntimeState" }, (res) => {
      if (res?.state?.waiting) setWaiting(res.state.waiting);
      if (res?.state?.pairingErrors) setPairingErrors(res.state.pairingErrors);
      if (res?.state?.pinnedIds) setPinnedIds(res.state.pinnedIds);
      setClipboardHistoryError(res?.state?.clipboardHistoryError || null);
      setHistoryPolicyError(res?.state?.historyPolicyError || null);
    });
    chrome.runtime.sendMessage({ type: "getLocalIdentity" }, (res) => {
      if (res?.identity) setIdentity(res.identity);
    });
    chrome.runtime.sendMessage({ type: "getInitializationError" }, (res) => {
      setInitializationError(res?.error?.code === "identity_initialization_failed");
    });
    chrome.runtime.sendMessage({ type: "getSettings" }, (res) => {
      if (typeof res?.localRetentionMs === "number") setLocalRetentionMs(res.localRetentionMs);
    });

    const handler = (msg: any) => {
      if (msg.type === "newClip" && msg.clip) {
        setClips((prev) => [
          msg.clip,
          ...prev.filter((c) => c.id !== msg.clip.id),
        ]);
      }
      if (msg.type === "trustRequest" && msg.device) {
        setPending((p) => {
          if (p.find((d) => d.deviceId === msg.device.deviceId)) return p;
          return [...p, msg.device];
        });
      }
      if (msg.type === "runtimeState" && msg.state) {
        setPending(msg.state.pending || []);
        setWaiting(msg.state.waiting || []);
        setPairingErrors(msg.state.pairingErrors || []);
        setPinnedIds(msg.state.pinnedIds || []);
        setClipboardHistoryError(msg.state.clipboardHistoryError || null);
        setHistoryPolicyError(msg.state.historyPolicyError || null);
      }
    };
    chrome.runtime.onMessage.addListener(handler);
    const peerTimer = setInterval(refreshPeers, 5000);
    return () => {
      chrome.runtime.onMessage.removeListener(handler);
      clearInterval(peerTimer);
    };
  }, []);

  useEffect(() => {
    async function checkClipboard() {
      try {
        const text = await navigator.clipboard.readText();
        if (text && text !== lastClipboardRef.current) {
          lastClipboardRef.current = text;
          chrome.runtime.sendMessage({ type: "clipboardUpdate", text });
        }
      } catch {
        // ignore
      }
    }
    const onFocus = () => {
      void checkClipboard();
    };
    if (document.hasFocus()) onFocus();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  function refreshHistory() {
    chrome.runtime.sendMessage({ type: "getClipHistory" }, (resp) => {
      setClips(resp?.clips || []);
    });
  }

  function refreshDevices() {
    chrome.runtime.sendMessage({ type: "getTrustedDevices" }, (resp) => {
      setDevices(resp?.devices || []);
    });
  }

  function refreshPending() {
    chrome.runtime.sendMessage({ type: "getPendingRequests" }, (resp) => {
      setPending(resp || []);
    });
  }

  function refreshPeers() {
    chrome.runtime.sendMessage({ type: "getConnectedPeers" }, (resp) => {
      setPeers(resp?.peers || []);
      setPeerConnections(resp?.peerConnections || []);
    });
  }

  async function runHistoryOperation<Result extends { ok: true } = { ok: true }>(
    message: Record<string, unknown>,
  ): Promise<Result> {
    return await new Promise<Result>((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        const error = chrome.runtime.lastError;
        if (error || !response?.ok) {
          reject(error ?? new Error(response?.error || "history_operation_failed"));
          return;
        }
        resolve(response as Result);
      });
    });
  }

  async function handleDeleteClip(id: string) {
    await runHistoryOperation({ type: "deleteClip", id });
    setClips((prev) => prev.filter((c) => c.id !== id));
  }

  async function handleUnpair(id: string) {
    chrome.runtime.sendMessage({ type: "revokeDevice", id }, () => {
      setDevices((prev) => prev.filter((d) => d.deviceId !== id));
    });
  }

  async function handleRenameDevice(id: string, name: string): Promise<Device | null> {
    return await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "renameDevice", id, name }, (res) => {
        if (res?.device) {
          setDevices((prev) => prev.map((d) => (d.deviceId === id ? res.device : d)));
        }
        resolve(res?.device || null);
      });
    });
  }

  async function handlePairingText(txt: string) {
    if (!decodePairingTarget(txt)) {
      alert("Invalid pairing payload");
      return;
    }
    chrome.runtime.sendMessage({ type: "pairDevice", pairingText: txt }, () => {
      refreshPending();
    });
  }

  async function handleRequestPairingCode(): Promise<PairingCode | null> {
    const target = await new Promise<string | null>((resolve) => {
      chrome.runtime.sendMessage({ type: "getPairingTarget" }, (res) => resolve(res?.text || null));
    });
    if (!target) return null;
    return {
      image: await QRCode.toDataURL(target, { errorCorrectionLevel: "L", margin: 0, scale: 2 }),
      text: target,
    };
  }

  async function handleRenameIdentity(name: string): Promise<Identity | null> {
    return await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "renameLocalIdentity", name }, (res) => {
        if (res?.identity) setIdentity(res.identity);
        resolve(res?.identity || null);
      });
    });
  }

  return (
    <div
      style={{ width: "100%", height: "100%" }}
      className="overflow-hidden bg-gradient-to-br from-slate-900 via-slate-950 to-black"
    >
      <ClipboardApp
        clips={clips}
        devices={devices}
        pending={pending}
        waiting={waiting}
        pairingErrors={pairingErrors}
        peers={peers}
        peerConnections={peerConnections}
        identity={identity}
        pinnedIds={pinnedIds}
        localRetentionMs={localRetentionMs}
        clipboardHistoryError={clipboardHistoryError}
        historyPolicyError={historyPolicyError}
        initializationError={initializationError}
        onDeleteClip={handleDeleteClip}
        onUnpair={handleUnpair}
        onRenameDevice={handleRenameDevice}
        onAccept={(dev) =>
          chrome.runtime.sendMessage(
            { type: "respondTrust", id: dev.deviceId, accept: true, device: dev },
            (response) => {
              if (!response?.ok) return;
              setPending((p) => p.filter((d) => d.deviceId !== dev.deviceId));
              refreshDevices();
            }
          )
        }
        onReject={(dev) =>
          chrome.runtime.sendMessage(
            { type: "respondTrust", id: dev.deviceId, accept: false, device: dev },
            (response) => {
              if (!response?.ok) return;
              setPending((p) => p.filter((d) => d.deviceId !== dev.deviceId));
            }
          )
        }
        onPairText={handlePairingText}
        onRequestPairingCode={handleRequestPairingCode}
        onSetPinned={async (id, pinned) => {
          const response = await runHistoryOperation<{ ok: true; pinnedIds: string[] }>({
            type: "setPin",
            id,
            pinned,
          });
          setPinnedIds(response.pinnedIds);
        }}
        onClearAll={async () => {
          await runHistoryOperation({ type: "clearHistory" });
          setClips([]);
          setPinnedIds([]);
        }}
        onSetLocalRetention={async (retentionMs) => {
          const response = await runHistoryOperation<{ ok: true; localRetentionMs: number }>({
            type: "setLocalRetention",
            retentionMs,
          });
          setLocalRetentionMs(response.localRetentionMs);
        }}
        onDismissClipboardHistoryError={async () => {
          await runHistoryOperation({ type: "dismissClipboardHistoryError" });
          setClipboardHistoryError(null);
        }}
        onRetryHistoryCleanup={async () => {
          await runHistoryOperation({ type: "retryHistoryCleanup" });
        }}
        onRenameIdentity={handleRenameIdentity}
        onRetryInitialization={() => chrome.runtime.sendMessage({ type: "retryIdentityInitialization" })}
      />
    </div>
  );
};

ReactDOM.createRoot(document.getElementById("root")!).render(<Popup />);
