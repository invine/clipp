/* global chrome */
import React, { useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import "./styles/tailwind-built.css";
import { ClipboardApp, Clip, Device, Identity, PendingRequest } from "../../../packages/ui";
import { decodePairing } from "../../../packages/core/pairing/decode";

const Popup = () => {
  const [clips, setClips] = useState<Clip[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [pending, setPending] = useState<PendingRequest[]>([]);
  const [peers, setPeers] = useState<string[]>([]);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const lastClipboardRef = useRef("");

  useEffect(() => {
    refreshHistory();
    refreshDevices();
    refreshPending();
    refreshPeers();
    chrome.runtime.sendMessage({ type: "getLocalIdentity" }, (res) => {
      if (res?.identity) setIdentity(res.identity);
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
    });
  }

  async function handleDeleteClip(id: string) {
    chrome.runtime.sendMessage({ type: "deleteClip", id }, () => {
      setClips((prev) => prev.filter((c) => c.id !== id));
    });
  }

  async function handleUnpair(id: string) {
    chrome.runtime.sendMessage({ type: "revokeDevice", id }, () => {
      setDevices((prev) => prev.filter((d) => d.deviceId !== id));
    });
  }

  async function handlePairingText(txt: string) {
    const payload = decodePairing(txt);
    if (!payload) {
      alert("Invalid pairing payload");
      return;
    }
    chrome.runtime.sendMessage({ type: "pairDevice", pairing: payload }, () => {
      refreshPending();
    });
  }

  async function handleRequestQr(): Promise<Identity | null> {
    return await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "getLocalIdentity" }, (res) => {
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
        peers={peers}
        identity={identity}
        pinnedIds={pinnedIds}
        onDeleteClip={handleDeleteClip}
        onUnpair={handleUnpair}
        onAccept={(dev) =>
          chrome.runtime.sendMessage(
            { type: "respondTrust", id: dev.deviceId, accept: true, device: dev },
            () => {
              setPending((p) => p.filter((d) => d.deviceId !== dev.deviceId));
              refreshDevices();
            }
          )
        }
        onReject={(dev) =>
          chrome.runtime.sendMessage(
            { type: "respondTrust", id: dev.deviceId, accept: false, device: dev },
            () => {
              setPending((p) => p.filter((d) => d.deviceId !== dev.deviceId));
            }
          )
        }
        onPairText={handlePairingText}
        onRequestQr={handleRequestQr}
        onTogglePin={(id) => {
          setPinnedIds((prev) => {
            const set = new Set(prev);
            if (set.has(id)) set.delete(id);
            else set.add(id);
            return Array.from(set);
          });
        }}
        onClearAll={() => {
          setClips([]);
          setPinnedIds([]);
          chrome.runtime.sendMessage({ type: "clearHistory" }, () => {});
        }}
      />
    </div>
  );
};

ReactDOM.createRoot(document.getElementById("root")!).render(<Popup />);
