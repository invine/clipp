/* global chrome */
import React, { useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom/client";
import "./styles/tailwind-built.css";
import { encode } from "../../../packages/core/qr";
import { encodePairing } from "../../../packages/core/pairing/encode";
import { decodePairing } from "../../../packages/core/pairing/decode";

// Types from background responses
type Clip = {
  id: string;
  type: string;
  content: string;
  timestamp: number;
  senderId: string;
};

type Device = {
  deviceId: string;
  deviceName: string;
  publicKey: string;
  createdAt: number;
  multiaddr?: string;
  multiaddrs?: string[];
};

type PendingRequest = Device;

type Identity = {
  deviceId: string;
  deviceName: string;
  publicKey: string;
  createdAt: number;
  multiaddr?: string;
  multiaddrs?: string[];
};

type TimeFilter = "all" | "24h" | "7d" | "30d";

const timeOptions: { value: TimeFilter; label: string; ms?: number }[] = [
  { value: "all", label: "All time" },
  { value: "24h", label: "Last 24h", ms: 24 * 60 * 60 * 1000 },
  { value: "7d", label: "Last 7d", ms: 7 * 24 * 60 * 60 * 1000 },
  { value: "30d", label: "Last 30d", ms: 30 * 24 * 60 * 60 * 1000 },
];

function fuzzyMatch(text: string, query: string): boolean {
  const t = text.toLowerCase();
  const q = query.toLowerCase();
  if (t.includes(q)) return true;
  let ti = 0;
  for (let qi = 0; qi < q.length; qi++) {
    const idx = t.indexOf(q[qi], ti);
    if (idx === -1) return false;
    ti = idx + 1;
  }
  return true;
}

function truncate(text: string, max = 160): string {
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString();
}

function StatusDot({ connected }: { connected: boolean }) {
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${
        connected ? "bg-green-500" : "bg-gray-400"
      }`}
    />
  );
}

function HistoryTab({
  clips,
  devices,
  identity,
  onDelete,
}: {
  clips: Clip[];
  devices: Device[];
  identity: Identity | null;
  onDelete: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");

  const deviceNameMap = useMemo(() => {
    const map = new Map<string, string>();
    if (identity) map.set(identity.deviceId, "You");
    devices.forEach((d) => map.set(d.deviceId, d.deviceName));
    return map;
  }, [devices, identity]);

  const sources = useMemo(() => {
    const set = new Set<string>();
    clips.forEach((c) => set.add(c.senderId));
    if (identity) set.add(identity.deviceId);
    devices.forEach((d) => set.add(d.deviceId));
    return ["all", ...Array.from(set)];
  }, [clips, devices, identity]);

  const filtered = useMemo(() => {
    const now = Date.now();
    const rangeMs = timeOptions.find((t) => t.value === timeFilter)?.ms;
    return clips
      .filter((c) => {
        if (rangeMs) return c.timestamp >= now - rangeMs;
        return true;
      })
      .filter((c) => {
        if (sourceFilter === "all") return true;
        return c.senderId === sourceFilter;
      })
      .filter((c) => {
        if (!search.trim()) return true;
        const label = deviceNameMap.get(c.senderId) || c.senderId;
        return (
          fuzzyMatch(c.content, search.trim()) ||
          fuzzyMatch(label, search.trim()) ||
          fuzzyMatch(c.senderId, search.trim())
        );
      })
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [clips, search, timeFilter, sourceFilter, deviceNameMap]);

  function copyClip(text: string) {
    navigator.clipboard.writeText(text).catch(() => {});
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <input
          className="flex-1 min-w-[140px] px-2 py-1 border rounded"
          placeholder="Search content, source..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="px-2 py-1 border rounded"
          value={timeFilter}
          onChange={(e) => setTimeFilter(e.target.value as TimeFilter)}
        >
          {timeOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          className="px-2 py-1 border rounded"
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
        >
          {sources.map((s) => (
            <option key={s} value={s}>
              {s === "all"
                ? "All sources"
                : deviceNameMap.get(s) || s.slice(0, 10)}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
        {filtered.length === 0 && (
          <div className="text-sm text-gray-500">No clips found.</div>
        )}
        {filtered.map((clip) => {
          const label = deviceNameMap.get(clip.senderId) || clip.senderId;
          return (
            <div
              key={clip.id}
              className="border border-gray-200 dark:border-gray-700 rounded p-3 shadow-sm bg-white dark:bg-gray-900"
            >
              <div className="text-sm whitespace-pre-wrap break-words text-gray-900 dark:text-gray-100 mb-2">
                {truncate(clip.content)}
              </div>
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span className="truncate" title={label}>
                  {label}
                </span>
                <span>{formatTime(clip.timestamp)}</span>
              </div>
              <div className="mt-2 flex gap-2">
                <button
                  className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                  onClick={() => copyClip(clip.content)}
                >
                  Copy
                </button>
                <button
                  className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200"
                  onClick={() => onDelete(clip.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DevicesTab({
  devices,
  pending,
  connectedPeers,
  onUnpair,
  onAccept,
  onReject,
  onShowQR,
  onPairText,
}: {
  devices: Device[];
  pending: PendingRequest[];
  connectedPeers: string[];
  onUnpair: (id: string) => void;
  onAccept: (dev: PendingRequest) => void;
  onReject: (dev: PendingRequest) => void;
  onShowQR: () => void;
  onPairText: (txt: string) => void;
}) {
  const [pairText, setPairText] = useState("");
  const connectedSet = useMemo(() => new Set(connectedPeers), [connectedPeers]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <button
          className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          onClick={onShowQR}
        >
          Show my QR
        </button>
        <div className="flex-1 flex gap-2">
          <input
            className="flex-1 px-2 py-1 border rounded"
            placeholder="Paste pairing text (base64)..."
            value={pairText}
            onChange={(e) => setPairText(e.target.value)}
          />
          <button
            className="px-3 py-2 bg-gray-800 text-white rounded hover:bg-gray-900"
            onClick={() => {
              if (pairText.trim()) onPairText(pairText.trim());
            }}
          >
            Add
          </button>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-2">Pairing Requests</h3>
        <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
          {pending.length === 0 && (
            <div className="text-sm text-gray-500">No pending requests.</div>
          )}
          {pending.map((req) => (
            <div
              key={req.deviceId}
              className="border border-yellow-300 bg-yellow-50 dark:border-yellow-600 dark:bg-yellow-900/40 rounded p-3"
            >
              <div className="text-sm font-medium">{req.deviceName}</div>
              <div className="text-xs text-gray-600 dark:text-gray-300">
                {req.deviceId}
              </div>
              <div className="mt-2 flex gap-2">
                <button
                  className="px-2 py-1 text-xs bg-blue-600 text-white rounded"
                  onClick={() => onAccept(req)}
                >
                  Accept
                </button>
                <button
                  className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded"
                  onClick={() => onReject(req)}
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-2">Connected Devices</h3>
        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
          {devices.length === 0 && (
            <div className="text-sm text-gray-500">No paired devices.</div>
          )}
          {devices.map((dev) => {
            const connected = connectedSet.has(dev.deviceId);
            return (
              <div
                key={dev.deviceId}
                className="border border-gray-200 dark:border-gray-700 rounded p-3 shadow-sm bg-white dark:bg-gray-900"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <StatusDot connected={connected} />
                    <div>
                      <div className="text-sm font-medium">{dev.deviceName}</div>
                      <div className="text-xs text-gray-500">
                        Paired: {formatTime(dev.createdAt)}
                      </div>
                    </div>
                  </div>
                  <button
                    className="text-xs text-red-600 hover:underline"
                    onClick={() => onUnpair(dev.deviceId)}
                  >
                    Unpair
                  </button>
                </div>
                <div className="mt-1 text-xs text-gray-500 break-all">
                  {dev.deviceId}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const Popup = () => {
  const [activeTab, setActiveTab] = useState<"history" | "devices">("history");
  const [clips, setClips] = useState<Clip[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [pending, setPending] = useState<PendingRequest[]>([]);
  const [peers, setPeers] = useState<string[]>([]);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [qrText, setQrText] = useState<string | null>(null);
  const lastClipboardRef = React.useRef("");

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

  async function openQR() {
    chrome.runtime.sendMessage({ type: "getLocalIdentity" }, async (res) => {
      if (!res?.identity) return;
      const info = {
        deviceId: res.identity.deviceId,
        deviceName: res.identity.deviceName,
        multiaddrs:
          res.identity.multiaddrs ||
          (res.identity.multiaddr ? [res.identity.multiaddr] : []),
        publicKey: res.identity.publicKey,
      };
      const img = await encode(info);
      const txt = encodePairing(info);
      setQrImage(img);
      setQrText(txt);
      setQrOpen(true);
    });
  }

  return (
    <div className="w-[440px] h-[640px] overflow-hidden bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-50">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800">
        <div className="flex gap-2">
          <button
            className={`px-3 py-1 rounded ${
              activeTab === "history"
                ? "bg-blue-600 text-white"
                : "bg-gray-200 dark:bg-gray-800"
            }`}
            onClick={() => setActiveTab("history")}
          >
            History
          </button>
          <button
            className={`px-3 py-1 rounded ${
              activeTab === "devices"
                ? "bg-blue-600 text-white"
                : "bg-gray-200 dark:bg-gray-800"
            }`}
            onClick={() => setActiveTab("devices")}
          >
            Connected Devices
          </button>
        </div>
      </div>

      <div className="p-4">
        {activeTab === "history" ? (
          <HistoryTab
            clips={clips}
            devices={devices}
            identity={identity}
            onDelete={handleDeleteClip}
          />
        ) : (
          <DevicesTab
            devices={devices}
            pending={pending}
            connectedPeers={peers}
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
            onShowQR={openQR}
            onPairText={handlePairingText}
          />
        )}
      </div>

      {qrOpen && qrImage && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-900 p-4 rounded shadow-lg w-[360px]">
            <div className="flex justify-between items-center mb-2">
              <div className="font-semibold">Pair this device</div>
              <button
                className="text-sm text-gray-500 hover:text-gray-800"
                onClick={() => setQrOpen(false)}
              >
                Close
              </button>
            </div>
            <img src={qrImage} alt="Pairing QR" className="w-48 h-48 mx-auto" />
            {qrText && (
              <button
                className="mt-3 w-full px-3 py-2 bg-gray-700 text-white rounded hover:bg-gray-800 text-sm"
                onClick={() => navigator.clipboard.writeText(qrText)}
              >
                Copy QR Text
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

ReactDOM.createRoot(document.getElementById("root")!).render(<Popup />);
