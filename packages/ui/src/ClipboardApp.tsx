import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Clip, ClipboardHistoryError, Device, HistoryPolicyError, Identity, PairingCode, PairingError, PairingWaiting, PeerConnectionInfo, PendingRequest, RelayConnectionInfo } from "./types";
import { identityRotationNoticeMessage, type IdentityRotationNoticeReason } from "./identityRotationNotice";
import clippPurpleIcon from "../../../clipp-electron-icons-bundle/clipp-purple-64.png";

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

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString();
}

function truncate(text: string, max = 220): string {
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function truncateMiddle(text: string, max = 28): string {
  if (!text) return "";
  if (text.length <= max) return text;
  const available = Math.max(max - 3, 1);
  const lead = Math.ceil(available / 2);
  const tail = Math.floor(available / 2);
  return `${text.slice(0, lead)}...${text.slice(text.length - tail)}`;
}

function clipboardHistoryErrorMessage(error: ClipboardHistoryError): string {
  if (error === "clip_too_large") {
    return "A clipboard value was too large to save in Clipboard History.";
  }
  if (error === "pending_capture_too_large") {
    return "A pending clipboard item was too large to keep for a later storage retry.";
  }
  if (error === "pending_capture_dropped") {
    return "Clipboard History storage is unavailable. One or more pending Clips could not be saved.";
  }
  return "Clipboard History storage is unavailable. Clipp will retry pending Clips automatically.";
}

function connectionStatusFor(connection: PeerConnectionInfo | undefined, online: boolean) {
  if (!online) {
    return {
      kind: "offline",
      title: "Offline",
    };
  }
  if (!connection) {
    return {
      kind: "unknown",
      title: "Online; connection path unknown",
    };
  }
  if (connection.hasDirect) {
    return {
      kind: "direct",
      title: connection.hasRelay
        ? "Direct connection active; relay is also available"
        : "Direct peer connection",
    };
  }
  if (connection.hasRelay) {
    return {
      kind: "relay",
      title: "Relayed peer connection",
    };
  }
  return {
    kind: "unknown",
    title: "Online; connection path unknown",
  };
}

function relayDisplayName(address: string, index: number): string {
  const parts = address.split("/").filter(Boolean);
  const hostIndex = parts.findIndex((part) => ["dns4", "dns6", "ip4", "ip6"].includes(part));
  const host = hostIndex >= 0 ? parts[hostIndex + 1] : "";
  const tcpIndex = parts.findIndex((part) => part === "tcp");
  const port = tcpIndex >= 0 ? parts[tcpIndex + 1] : "";
  if (host && port) return `${host}:${port}`;
  if (host) return host;

  const p2pIndex = parts.findIndex((part) => part === "p2p");
  const peerId = p2pIndex >= 0 ? parts[p2pIndex + 1] : "";
  if (peerId) return `Relay ${truncateMiddle(peerId, 12)}`;

  return `Relay ${index + 1}`;
}

function parseRelayInput(value: string): string[] {
  return value
    .split(/\r?\n|,/)
    .map((addr) => addr.trim())
    .filter(Boolean);
}

function relayConnectionFor(address: string, relayConnections: RelayConnectionInfo[]) {
  return relayConnections.find((conn) => conn.address === address || conn.addrs.includes(address));
}

function relayStatusFor(connection: RelayConnectionInfo | undefined) {
  if (!connection) {
    return {
      kind: "unknown",
      label: "Configured",
      title: "Relay configured; connection status is not reported yet",
    };
  }
  if (connection.status === "connected") {
    return {
      kind: "connected",
      label: "Connected",
      title: connection.addrs.length
        ? `Connected to ${connection.addrs.join(", ")}`
        : "Connected to relay",
    };
  }
  if (connection.status === "disconnected") {
    return {
      kind: "disconnected",
      label: "Offline",
      title: "Relay is configured but not connected",
    };
  }
  return {
    kind: "unknown",
    label: "Configured",
    title: connection.peerId
      ? "Relay status is not available yet"
      : "Relay address is configured; connection status cannot be tracked for this address",
  };
}

type MiddleEllipsisTextProps = {
  text: string;
  max?: number;
  className?: string;
  style?: React.CSSProperties;
};

function MiddleEllipsisText({ text, max, className, style }: MiddleEllipsisTextProps) {
  const [display, setDisplay] = useState(text);
  const containerRef = useRef<HTMLSpanElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) return;

    const computeDisplay = () => {
      const containerWidth = container.clientWidth;
      if (!containerWidth) {
        setDisplay(text);
        return;
      }

      // If the full string fits, keep it.
      measure.textContent = text;
      if (measure.scrollWidth <= containerWidth + 0.5) {
        setDisplay(text);
        return;
      }

      // Find the longest middle-ellipsized string that fits the current pixel width.
      const maxChars = Math.max(1, Math.min(max ?? text.length, text.length));
      let low = 1;
      let high = maxChars;
      let best = truncateMiddle(text, low);

      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const candidate = truncateMiddle(text, mid);
        measure.textContent = candidate;
        if (measure.scrollWidth <= containerWidth + 0.5) {
          best = candidate;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }

      setDisplay(best);
    };

    computeDisplay();
    const resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(computeDisplay) : null;
    resizeObserver?.observe(container);
    window.addEventListener("resize", computeDisplay);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", computeDisplay);
    };
  }, [text, max]);

  const classes = className ? `middle-ellipsis ${className}` : "middle-ellipsis";

  return (
    <span ref={containerRef} className={classes} style={style} title={text}>
      <span ref={measureRef} className="middle-ellipsis-measure" aria-hidden>
        {display}
      </span>
      {display}
    </span>
  );
}

export type ClipboardAppProps = {
  clips: Clip[];
  devices: Device[];
  pending: PendingRequest[];
  waiting?: PairingWaiting[];
  pairingErrors?: PairingError[];
  peers: string[];
  peerConnections?: PeerConnectionInfo[];
  relayConnections?: RelayConnectionInfo[];
  identity: Identity | null;
  pinnedIds: string[];
  localRetentionMs?: number;
  autoSync?: boolean;
  clipboardHistoryError?: ClipboardHistoryError | null;
  historyPolicyError?: HistoryPolicyError | null;
  relayAddresses?: string[];
  initializationError?: boolean;
  identityRotationRecovery?: boolean;
  identityRotationNotice?: IdentityRotationNoticeReason | null;
  onDeleteClip(id: string): void | Promise<void>;
  onUnpair(id: string): void | Promise<void>;
  onAccept(dev: PendingRequest): void | Promise<void>;
  onReject(dev: PendingRequest): void | Promise<void>;
  onPairText(txt: string): void | Promise<void>;
  onScanPairingCode?(): Promise<string | null> | string | null;
  onRequestPairingCode(): Promise<PairingCode | null>;
  onReuseClip(id: string): void | Promise<void>;
  onShareNow(): void | Promise<void>;
  onSetPinned(id: string, pinned: boolean): void | Promise<void>;
  onClearAll(): void | Promise<void>;
  onDismissClipboardHistoryError?(): void | Promise<void>;
  onRetryHistoryCleanup?(): void | Promise<void>;
  onSetLocalRetention?(retentionMs: number): void | Promise<void>;
  onSetAutoSync?(enabled: boolean): void | Promise<void>;
  onRenameIdentity?(name: string): Promise<Identity | null>;
  onRenameDevice?(id: string, name: string): Promise<Device | null>;
  onSetRelayAddresses?(addrs: string[]): Promise<string[] | void> | string[] | void;
  onRetryInitialization?(): void | Promise<void>;
  onAcknowledgeIdentityRotationNotice?(): void | Promise<void>;
};

export function ClipboardApp({
  clips,
  devices,
  pending,
  waiting = [],
  pairingErrors = [],
  peers,
  peerConnections = [],
  relayConnections = [],
  identity,
  pinnedIds,
  localRetentionMs = 30 * 24 * 60 * 60 * 1000,
  autoSync = true,
  clipboardHistoryError = null,
  historyPolicyError = null,
  relayAddresses = [],
  initializationError = false,
  identityRotationRecovery = false,
  identityRotationNotice = null,
  onDeleteClip,
  onUnpair,
  onAccept,
  onReject,
  onPairText,
  onScanPairingCode,
  onRequestPairingCode,
  onReuseClip,
  onShareNow,
  onSetPinned,
  onClearAll,
  onDismissClipboardHistoryError,
  onRetryHistoryCleanup,
  onSetLocalRetention,
  onSetAutoSync,
  onRenameIdentity,
  onRenameDevice,
  onSetRelayAddresses,
  onRetryInitialization,
  onAcknowledgeIdentityRotationNotice,
}: ClipboardAppProps) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [isNarrow, setIsNarrow] = useState(false);
  const pinnedSet = useMemo(() => new Set(pinnedIds), [pinnedIds]);
  const [search, setSearch] = useState("");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [filterMode, setFilterMode] = useState<"all" | "pinned">("all");
  const [pairText, setPairText] = useState("");
  const [isScanningPairing, setIsScanningPairing] = useState(false);
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [qrText, setQrText] = useState<string | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);
  const [showNav, setShowNav] = useState(false);
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());
  const [timeMenuOpen, setTimeMenuOpen] = useState(false);
  const [sourceMenuOpen, setSourceMenuOpen] = useState(false);
  const [filtersCollapsed, setFiltersCollapsed] = useState(false);
  const [userToggledFilters, setUserToggledFilters] = useState(false);
  const [editingLocalName, setEditingLocalName] = useState(false);
  const [localNameDraft, setLocalNameDraft] = useState("");
  const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null);
  const [deviceNameDraft, setDeviceNameDraft] = useState("");
  const [revocationError, setRevocationError] = useState<{ deviceId: string } | null>(null);
  const [relaysOpen, setRelaysOpen] = useState(true);
  const [addingRelay, setAddingRelay] = useState(false);
  const [editingRelayIndex, setEditingRelayIndex] = useState<number | null>(null);
  const [relayDraft, setRelayDraft] = useState("");
  const [relaySaving, setRelaySaving] = useState(false);
  const [relayError, setRelayError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [retryHistoryOperation, setRetryHistoryOperation] = useState<(() => void) | null>(null);
  const peerCount = peers.length;
  const navHidden = isNarrow;

  useEffect(() => {
    if (!openMenuId) return;
    function handleDocClick(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (target?.closest(".history-menu")) return;
      setOpenMenuId(null);
    }
    document.addEventListener("mousedown", handleDocClick);
    return () => document.removeEventListener("mousedown", handleDocClick);
  }, [openMenuId]);

  useEffect(() => {
    function handleDocClick(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (target?.closest(".time-filter-wrap") || target?.closest(".source-filter-wrap")) return;
      setTimeMenuOpen(false);
      setSourceMenuOpen(false);
    }
    document.addEventListener("mousedown", handleDocClick);
    return () => document.removeEventListener("mousedown", handleDocClick);
  }, []);

  useEffect(() => {
    function handleResize() {
      const narrow = window.innerWidth < 1100;
      setIsNarrow(narrow);
      if (!narrow) setShowNav(false);
    }
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    function handleHeight() {
      const shouldCollapse = window.innerHeight < 760;
      if (!userToggledFilters) {
        setFiltersCollapsed(shouldCollapse);
      }
    }
    handleHeight();
    window.addEventListener("resize", handleHeight);
    return () => window.removeEventListener("resize", handleHeight);
  }, [userToggledFilters]);

  const deviceNameMap = useMemo(() => {
    const map = new Map<string, string>();
    if (identity) map.set(identity.deviceId, "You");
    devices.forEach((d) => map.set(d.deviceId, d.displayName || d.deviceName));
    return map;
  }, [devices, identity]);

  const connectedPeerSet = useMemo(() => new Set(peers), [peers]);
  const peerConnectionMap = useMemo(() => {
    const map = new Map<string, PeerConnectionInfo>();
    peerConnections.forEach((conn) => map.set(conn.peerId, conn));
    return map;
  }, [peerConnections]);
  const connectedRelayCount = useMemo(
    () =>
      relayAddresses.filter(
        (address) => relayConnectionFor(address, relayConnections)?.status === "connected",
      ).length,
    [relayAddresses, relayConnections],
  );

  const sources = useMemo(() => {
    const set = new Set<string>();
    clips.forEach((c) => set.add(c.originPeerId));
    if (identity) set.add(identity.deviceId);
    devices.forEach((d) => set.add(d.deviceId));
    return ["all", ...Array.from(set)];
  }, [clips, devices, identity]);

  const filteredClips = useMemo(() => {
    const now = Date.now();
    const rangeMs = timeOptions.find((t) => t.value === timeFilter)?.ms;
    let list = clips
      .filter((c) => {
        if (rangeMs) return c.capturedAt >= now - rangeMs;
        return true;
      })
      .filter((c) => {
        if (sourceFilter === "all") return true;
        if (sourceFilter === "local" && identity) return c.originPeerId === identity.deviceId;
        if (sourceFilter === "remote" && identity) return c.originPeerId !== identity.deviceId;
        return c.originPeerId === sourceFilter;
      })
      .filter((c) => {
        if (!search.trim()) return true;
        const label = deviceNameMap.get(c.originPeerId) || c.originPeerId;
        return (
          fuzzyMatch(c.content, search.trim()) ||
          fuzzyMatch(label, search.trim()) ||
          fuzzyMatch(c.originPeerId, search.trim())
        );
      })
      .sort((a, b) => b.capturedAt - a.capturedAt);

    if (filterMode === "pinned") {
      list = list.filter((c) => pinnedSet.has(c.id));
    }

    return list;
  }, [clips, search, timeFilter, sourceFilter, deviceNameMap, filterMode, pinnedSet, identity]);

  function setPinned(id: string, pinned: boolean) {
    setOpenMenuId(null);
    void Promise.resolve()
      .then(() => onSetPinned(id, pinned))
      .then(() => {
        setHistoryError(null);
        setRetryHistoryOperation(null);
      })
      .catch(() => {
        setHistoryError("Could not confirm this Clip's pin state. Retry to apply it again.");
        setRetryHistoryOperation(() => () => setPinned(id, pinned));
      });
  }

  function handleDelete(id: string) {
    setRemovingIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    setTimeout(() => {
      Promise.resolve(onDeleteClip(id))
        .then(() => {
          setHistoryError(null);
          setRetryHistoryOperation(null);
        })
        .catch(() => {
          setHistoryError("Could not delete this Clip. It is still in your history.");
          setRetryHistoryOperation(() => () => handleDelete(id));
        })
        .finally(() => setRemovingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        }));
    }, 180);
  }

  function clearAllHistory() {
    setRemovingIds(new Set(clips.map((c) => c.id)));
    Promise.resolve(onClearAll())
      .then(() => {
        setHistoryError(null);
        setRetryHistoryOperation(null);
      })
      .catch(() => {
        setHistoryError("Could not clear history. Your Clips are still available.");
        setRetryHistoryOperation(() => clearAllHistory);
      })
      .finally(() => setRemovingIds(new Set()));
  }

  function toggleFilters() {
    setFiltersCollapsed((v) => !v);
    setUserToggledFilters(true);
  }

  function beginEditLocalName() {
    if (!identity) return;
    setLocalNameDraft(identity.deviceName || "");
    setEditingLocalName(true);
  }

  useEffect(() => {
    if (!editingLocalName && identity) {
      setLocalNameDraft(identity.deviceName || "");
    }
  }, [identity, editingLocalName]);

  useEffect(() => {
    if (editingRelayIndex !== null && editingRelayIndex >= relayAddresses.length) {
      setEditingRelayIndex(null);
      setRelayDraft("");
      setRelayError(null);
    }
    if (!addingRelay && editingRelayIndex === null) {
      setRelayDraft("");
      setRelayError(null);
    }
  }, [relayAddresses, addingRelay, editingRelayIndex]);

  function saveLocalName() {
    const trimmed = localNameDraft.trim();
    if (!identity) return;
    if (!trimmed) {
      setEditingLocalName(false);
      return;
    }
    const rename = onRenameIdentity ? onRenameIdentity(trimmed) : Promise.resolve(null);
    rename
      .catch(() => {})
      .finally(() => {
        setEditingLocalName(false);
      });
  }

  function beginEditDeviceName(device: Device) {
    setDeviceNameDraft(device.displayName || device.deviceName || "");
    setEditingDeviceId(device.deviceId);
  }

  function cancelEditDeviceName() {
    setEditingDeviceId(null);
    setDeviceNameDraft("");
  }

  function saveDeviceName(device: Device) {
    const trimmed = deviceNameDraft.trim();
    if (!trimmed || trimmed === (device.displayName || device.deviceName)) {
      cancelEditDeviceName();
      return;
    }
    const rename = onRenameDevice ? onRenameDevice(device.deviceId, trimmed) : Promise.resolve(null);
    rename
      .catch(() => {})
      .finally(() => {
        cancelEditDeviceName();
      });
  }

  async function revokeDevice(device: Device): Promise<void> {
    const confirmed = globalThis.confirm(
      `Permanently revoke ${device.displayName || device.deviceName || device.deviceId}? This cannot be undone.`,
    );
    if (!confirmed) return;
    try {
      await onUnpair(device.deviceId);
      setRevocationError(null);
    } catch {
      setRevocationError({ deviceId: device.deviceId });
    }
  }

  function reuseClip(id: string) {
    void Promise.resolve()
      .then(() => onReuseClip(id))
      .then(() => {
        setHistoryError(null);
        setRetryHistoryOperation(null);
      })
      .catch(() => {
        setHistoryError("Could not copy this Clip. Your clipboard and history were not changed.");
        setRetryHistoryOperation(() => () => reuseClip(id));
      });
  }

  function shareNow() {
    void Promise.resolve()
      .then(() => onShareNow())
      .then(() => {
        setHistoryError(null);
        setRetryHistoryOperation(null);
      })
      .catch(() => {
        setHistoryError("Could not share the current clipboard.");
        setRetryHistoryOperation(() => shareNow);
      });
  }

  function beginAddRelay() {
    setRelaysOpen(true);
    setAddingRelay(true);
    setEditingRelayIndex(null);
    setRelayDraft("");
    setRelayError(null);
  }

  function beginRenameRelay(index: number, address: string) {
    setRelaysOpen(true);
    setAddingRelay(false);
    setEditingRelayIndex(index);
    setRelayDraft(address);
    setRelayError(null);
  }

  function cancelRelayEdit() {
    setAddingRelay(false);
    setEditingRelayIndex(null);
    setRelayDraft("");
    setRelayError(null);
  }

  async function updateRelayAddresses(next: string[]) {
    if (!onSetRelayAddresses || relaySaving) return;
    setRelaySaving(true);
    setRelayError(null);
    try {
      await onSetRelayAddresses(next);
      cancelRelayEdit();
    } catch (err) {
      console.warn("Failed to save relay addresses", err);
      setRelayError("Failed to save relay changes.");
    } finally {
      setRelaySaving(false);
    }
  }

  async function saveNewRelay() {
    const entries = parseRelayInput(relayDraft);
    if (entries.length === 0) {
      setRelayError("Enter a relay address.");
      return;
    }
    await updateRelayAddresses([...relayAddresses, ...entries]);
  }

  async function saveRelayRename(index: number) {
    const entries = parseRelayInput(relayDraft);
    if (entries.length !== 1) {
      setRelayError("Enter one relay address.");
      return;
    }
    const next = relayAddresses.map((address, i) => (i === index ? entries[0] : address));
    await updateRelayAddresses(next);
  }

  async function removeRelay(index: number) {
    const next = relayAddresses.filter((_, i) => i !== index);
    await updateRelayAddresses(next);
  }

  async function updateLocalRetention(retentionMs: number) {
    if (!onSetLocalRetention) return;
    try {
      await onSetLocalRetention(retentionMs);
      setHistoryError(null);
    } catch {
      setHistoryError("Could not save the history retention setting.");
      setRetryHistoryOperation(() => () => void updateLocalRetention(retentionMs));
    }
  }

  function sourceOptionLabel(src: string): string {
    if (src === "all") return "All sources";
    if (src === "local") return "Local";
    if (src === "remote") return "Remote";
    return deviceNameMap.get(src) || src;
  }

  function sourceFilterLabel(src: string): string {
    if (src === "all") return "Source: All";
    if (src === "local") return "Source: Local";
    if (src === "remote") return "Source: Remote";
    return `Source: ${deviceNameMap.get(src) || src}`;
  }

  async function handleShowQr() {
    setShowNav(false);
    setQrImage(null);
    setQrText(null);
    setQrError(null);
    setQrLoading(true);
    setQrOpen(true);
    try {
      const code = await onRequestPairingCode();
      if (!code) {
        setQrError("Unable to create a pairing QR code.");
        return;
      }
      setQrImage(code.image);
      setQrText(code.text);
    } catch (err) {
      console.warn("Failed to create pairing QR", err);
      setQrError("Unable to create a pairing QR code.");
    } finally {
      setQrLoading(false);
    }
  }

  function closeQr() {
    setQrOpen(false);
    setQrImage(null);
    setQrText(null);
    setQrError(null);
    setQrLoading(false);
  }

  function submitPairText() {
    const trimmed = pairText.trim();
    setPairText("");
    if (!trimmed) {
      return;
    }
    void Promise.resolve(onPairText(trimmed));
  }

  async function scanPairingCode() {
    if (!onScanPairingCode || isScanningPairing) return;
    setIsScanningPairing(true);
    try {
      const scanned = await onScanPairingCode();
      const trimmed = scanned?.trim();
      if (trimmed) {
        await onPairText(trimmed);
      }
    } catch (err) {
      console.warn("Pairing QR scan failed", err);
    } finally {
      setIsScanningPairing(false);
    }
  }

  function relaySummaryLabel() {
    if (relayAddresses.length === 0) return "No relays";
    if (connectedRelayCount > 0) {
      return `${connectedRelayCount}/${relayAddresses.length} connected`;
    }
    return relayAddresses.length === 1 ? "1 configured" : `${relayAddresses.length} configured`;
  }

  function renderRelayDraftCard() {
    return (
      <div className="relay-card relay-card-editing">
        <div className="peer-avatar relay-avatar unknown">
          <span className="icon" style={{ fontSize: 16 }}>
            add_link
          </span>
        </div>
        <div className="peer-meta">
          <input
            className="relay-address-input"
            value={relayDraft}
            onChange={(e) => setRelayDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void saveNewRelay();
              if (e.key === "Escape") cancelRelayEdit();
            }}
            placeholder="/dns4/relay.example.com/tcp/443/wss/p2p/..."
            autoFocus
          />
          {relayError && addingRelay && <div className="relay-error">{relayError}</div>}
        </div>
        <div className="peer-actions">
          <button
            className="icon-button"
            title="Add relay"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => void saveNewRelay()}
            disabled={relaySaving}
          >
            <span className="icon" style={{ fontSize: 16 }}>
              check
            </span>
          </button>
          <button
            className="icon-button"
            title="Cancel"
            onMouseDown={(e) => e.preventDefault()}
            onClick={cancelRelayEdit}
            disabled={relaySaving}
          >
            <span className="icon" style={{ fontSize: 16 }}>
              close
            </span>
          </button>
        </div>
      </div>
    );
  }

  function renderRelayCard(address: string, index: number) {
    const editingThisRelay = editingRelayIndex === index;
    const connection = relayConnectionFor(address, relayConnections);
    const status = relayStatusFor(connection);

    return (
      <div
        key={`${address}-${index}`}
        className={`relay-card ${editingThisRelay ? "relay-card-editing" : ""}`}
        title={`${address}\n${status.title}`}
      >
        <div className={`peer-avatar relay-avatar ${status.kind}`}>
          <span className="icon" style={{ fontSize: 16 }}>
            hub
          </span>
        </div>
        <div className="peer-meta">
          {editingThisRelay ? (
            <>
              <input
                className="relay-address-input"
                value={relayDraft}
                onChange={(e) => setRelayDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void saveRelayRename(index);
                  if (e.key === "Escape") cancelRelayEdit();
                }}
                autoFocus
              />
              {relayError && <div className="relay-error">{relayError}</div>}
            </>
          ) : (
            <>
              <MiddleEllipsisText className="peer-name" text={relayDisplayName(address, index)} />
              <MiddleEllipsisText
                className="peer-sub"
                text={address}
                max={isNarrow ? 24 : 34}
              />
              <div className={`relay-status ${status.kind}`} title={status.title}>
                <span className="relay-status-dot"></span>
                <span className="relay-status-label">{status.label}</span>
              </div>
            </>
          )}
        </div>
        <div className="peer-actions">
          {editingThisRelay ? (
            <>
              <button
                className="icon-button"
                title="Save relay address"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void saveRelayRename(index)}
                disabled={relaySaving}
              >
                <span className="icon" style={{ fontSize: 16 }}>
                  check
                </span>
              </button>
              <button
                className="icon-button"
                title="Cancel"
                onMouseDown={(e) => e.preventDefault()}
                onClick={cancelRelayEdit}
                disabled={relaySaving}
              >
                <span className="icon" style={{ fontSize: 16 }}>
                  close
                </span>
              </button>
            </>
          ) : (
            <>
              <button
                className="icon-button"
                title="Rename relay"
                onClick={() => beginRenameRelay(index, address)}
                disabled={relaySaving}
              >
                <span className="icon" style={{ fontSize: 16 }}>
                  edit
                </span>
              </button>
              <button
                className="icon-button"
                title="Remove relay"
                onClick={() => void removeRelay(index)}
                disabled={relaySaving}
              >
                <span className="icon" style={{ fontSize: 16 }}>
                  delete
                </span>
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  function renderRelaysSection() {
    if (!onSetRelayAddresses) return null;
    return (
      <>
        <div className="section-divider"></div>
        <div className="relay-settings">
          <div className="nav-section-label">Network</div>
          <div className="relay-accordion-head">
            <button
              className="relay-accordion-toggle"
              onClick={() => setRelaysOpen((open) => !open)}
              aria-expanded={relaysOpen}
            >
              <span className="icon" style={{ fontSize: 16 }}>
                {relaysOpen ? "expand_less" : "expand_more"}
              </span>
              <span className="relay-accordion-title">Relays</span>
              <span className="relay-summary-text">{relaySummaryLabel()}</span>
            </button>
            <button
              className="icon-button"
              title="Add relay"
              onClick={beginAddRelay}
              disabled={relaySaving}
            >
              <span className="icon" style={{ fontSize: 16 }}>
                add
              </span>
            </button>
          </div>
          {relaysOpen && (
            <div className="relay-list">
              {relayAddresses.length === 0 && !addingRelay && (
                <div className="relay-empty">No relays configured.</div>
              )}
              {relayError && !addingRelay && editingRelayIndex === null && (
                <div className="relay-error relay-section-error">{relayError}</div>
              )}
              {relayAddresses.map((address, index) => renderRelayCard(address, index))}
              {addingRelay && renderRelayDraftCard()}
            </div>
          )}
        </div>
      </>
    );
  }

  function renderNavContent(isDrawer = false) {
    return (
      <>
        <div className="nav-header">
          <div className="nav-title">Peers</div>
          {isDrawer ? (
            <button className="icon-button" onClick={() => setShowNav(false)}>
              <span className="icon">close</span>
            </button>
          ) : (
            <div className="nav-chip">{peerCount} online</div>
          )}
        </div>

        <div className="peer-list">
          {identity && (
            <>
              <div className="peer-item active">
                <div className="peer-avatar" style={{ minWidth: 32 }}>L</div>
                <div className="peer-meta">
                  <div className="peer-name-row">
                    {editingLocalName ? (
                      <input
                        className="peer-name-input"
                        value={localNameDraft}
                        onChange={(e) => setLocalNameDraft(e.target.value)}
                        onBlur={saveLocalName}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveLocalName();
                          if (e.key === "Escape") setEditingLocalName(false);
                        }}
                        autoFocus
                      />
                    ) : (
                      <MiddleEllipsisText
                        className="peer-name"
                        text={identity.deviceName || "Local device"}
                      />
                    )}
                    <button
                      className="icon-button"
                      style={{ width: 18, height: 18 }}
                      title="Rename this device"
                      onClick={editingLocalName ? saveLocalName : beginEditLocalName}
                    >
                      <span
                        className="icon"
                        style={{ fontSize: 12, lineHeight: 1 }}
                      >
                        {editingLocalName ? "check" : "edit"}
                      </span>
                    </button>
                  </div>
                  <MiddleEllipsisText
                    className="peer-sub"
                    text={identity.deviceId}
                    max={isNarrow ? 22 : 30}
                  />
                </div>
                <div className="peer-actions">
                  <div className="peer-indicator">
                    <span className="icon" style={{ fontSize: 14 }}>
                      laptop_mac
                    </span>
                  </div>
                </div>
              </div>
              <button
                className="text-button"
                style={{ marginTop: 4, marginLeft: 6, alignSelf: "flex-start" }}
                onClick={handleShowQr}
              >
                <span className="icon">qr_code</span>Show my QR
              </button>
            </>
          )}
        </div>

        {(pending.length > 0 || waiting.length > 0 || pairingErrors.length > 0) && (
          <>
            <div className="section-divider"></div>
            <div>
              <div className="nav-section-label" style={{ marginTop: 14 }}>
                Pending requests
              </div>
              {waiting.map((entry) => <div key={entry.targetPeerId} className="pending-card"><div className="peer-meta"><span className="peer-name">Waiting for approval</span><span className="peer-sub">{entry.targetPeerId}</span></div></div>)}
              {pairingErrors.map((entry) => <div key={entry.targetPeerId} className="pending-card"><div className="peer-meta"><span className="peer-name">Pairing storage error; retrying</span><span className="peer-sub">{entry.targetPeerId}</span></div></div>)}
              <div className="pending-list">
                {pending.map((req) => {
                  return (
                    <div key={req.deviceId} className="pending-card">
                      <div className="pending-card-header">
                        <div className="peer-avatar">{req.deviceName?.[0] || "D"}</div>
                        <div className="peer-meta">
                          <MiddleEllipsisText
                            className="peer-name"
                            text={req.deviceName}
                          />
                          <span className="peer-sub" title={req.deviceId}>{req.deviceId}</span>
                        </div>
                      </div>
                      <div className="pending-actions">
                        <button className="primary-button compact-button" onClick={() => onAccept(req)}>
                          Accept
                        </button>
                        <button className="text-button" onClick={() => onReject(req)}>
                          Reject
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        <div className="section-divider"></div>

        <div>
          <div className="nav-section-label">Pairing</div>
          <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
            <input
              className="search-field"
              style={{ flex: 1, minWidth: 0, borderRadius: 12 }}
              placeholder="Paste pairing text (base64)…"
              value={pairText}
              onChange={(e) => setPairText(e.target.value)}
            />
            <button
              className="primary-button"
              onClick={submitPairText}
            >
              Add
            </button>
          </div>
          {onScanPairingCode && (
            <button
              className="text-button"
              style={{ marginTop: 8, alignSelf: "flex-start" }}
              onClick={scanPairingCode}
              disabled={isScanningPairing}
            >
              <span className="icon">qr_code_scanner</span>
              {isScanningPairing ? "Scanning" : "Scan QR"}
            </button>
          )}
        </div>

        <div>
          <div className="nav-section-label" style={{ marginTop: 14 }}>
            Connected devices
          </div>
          <div
            style={{
              marginTop: 8,
              display: "flex",
              flexDirection: "column",
              gap: 8,
              maxHeight: 200,
              overflow: "auto",
            }}
          >
            {devices.length === 0 && <div className="content-subtitle">No devices yet.</div>}
            {revocationError && (
              <div className="content-subtitle" role="alert">
                Could not revoke this device. It remains trusted.
                <button
                  className="text-button"
                  onClick={() => {
                    const device = devices.find((candidate) => candidate.deviceId === revocationError.deviceId);
                    if (device) void revokeDevice(device);
                  }}
                >
                  Retry
                </button>
              </div>
            )}
            {devices.map((dev) => {
              const editingThisDevice = editingDeviceId === dev.deviceId;
              const devicePeerIds = [
                dev.deviceId,
                ...(dev.multiaddr ? [dev.multiaddr] : []),
                ...(dev.multiaddrs || []),
              ];
              const connectionInfo = devicePeerIds
                .map((value) =>
                  peerConnectionMap.get(value) ||
                  peerConnections.find((conn) => value.endsWith(`/p2p/${conn.peerId}`))
                )
                .find(Boolean);
              const isOnline = devicePeerIds.some((value) =>
                connectedPeerSet.has(value) ||
                peers.some((peer) => value.endsWith(`/p2p/${peer}`)),
              ) || Boolean(connectionInfo);
              const connectionStatus = connectionStatusFor(connectionInfo, isOnline);
              return (
                <div
                  key={dev.deviceId}
                  className="peer-item"
                  title={`Paired ${formatTime(dev.createdAt)}\n${connectionStatus.title}`}
                  style={{ border: "1px solid rgba(255,255,255,0.06)" }}
                >
                  <div className={`peer-avatar ${isOnline ? "online" : "offline"} ${connectionStatus.kind}`}>
                    {(dev.displayName || dev.deviceName)?.[0] || "D"}
                  </div>
                  <div className="peer-meta">
                    {editingThisDevice ? (
                      <input
                        className="peer-name-input"
                        value={deviceNameDraft}
                        onChange={(e) => setDeviceNameDraft(e.target.value)}
                        onBlur={() => saveDeviceName(dev)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveDeviceName(dev);
                          if (e.key === "Escape") cancelEditDeviceName();
                        }}
                        autoFocus
                      />
                    ) : (
                      <MiddleEllipsisText
                        className="peer-name"
                        text={dev.displayName || dev.deviceName}
                      />
                    )}
                    <MiddleEllipsisText
                      className="peer-sub"
                      text={dev.deviceId}
                      max={isNarrow ? 22 : 32}
                    />
                  </div>
                  <div className="peer-actions">
                    <div className="peer-indicator">
                      <span className="icon" style={{ fontSize: 14 }}>
                        smartphone
                      </span>
                    </div>
                    {onRenameDevice && (
                      <button
                        className="icon-button"
                        title={editingThisDevice ? "Save device name" : "Rename this device"}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          if (editingThisDevice) {
                            saveDeviceName(dev);
                          } else {
                            beginEditDeviceName(dev);
                          }
                        }}
                      >
                        <span className="icon" style={{ fontSize: 16 }}>
                          {editingThisDevice ? "check" : "edit"}
                        </span>
                      </button>
                    )}
                    <button
                      className="icon-button"
                      title="Revoke this device"
                      onClick={() => void revokeDevice(dev)}
                    >
                      <span className="icon" style={{ fontSize: 16 }}>
                        link_off
                      </span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {renderRelaysSection()}

        {onSetLocalRetention && (
          <div className="relay-settings">
            <label className="peer-sub" htmlFor="history-retention">Keep unpinned history</label>
            <select
              id="history-retention"
              value={localRetentionMs}
              onChange={(event) => void updateLocalRetention(Number(event.target.value))}
            >
              <option value={7 * 24 * 60 * 60 * 1000}>7 days</option>
              <option value={30 * 24 * 60 * 60 * 1000}>30 days</option>
              <option value={90 * 24 * 60 * 60 * 1000}>90 days</option>
              <option value={365 * 24 * 60 * 60 * 1000}>1 year</option>
            </select>
          </div>
        )}

        {onSetAutoSync && (
          <div className="relay-settings">
            <label className="peer-sub" htmlFor="auto-sync">Auto Sync</label>
            <select
              id="auto-sync"
              value={autoSync ? "enabled" : "disabled"}
              onChange={(event) => void onSetAutoSync(event.target.value === "enabled")}
            >
              <option value="enabled">Enabled</option>
              <option value="disabled">Disabled — keep Clips local</option>
            </select>
          </div>
        )}
      </>
    );
  }

  return (
    <div className={initializationError ? "app-shell app-shell-with-initialization-error" : "app-shell"}>
      <header className="app-bar">
        <div className="app-bar-left">
          <div
            className="app-logo"
            onClick={() => {
              if (isNarrow) setShowNav(true);
            }}
          >
            <img src={clippPurpleIcon} alt="Clipp" draggable={false} />
          </div>
          <div className="app-title-block">
            <div className="app-title">
              Clipp
              <span className="chip-status">
                <span className="dot"></span>
                {peerCount ? "Synced" : "Offline"}
              </span>
            </div>
            <div className="app-subtitle">
              Clipboard sharing across all your devices.
            </div>
          </div>
        </div>

        <div className="app-bar-right">
          <div className="search-field">
            <span className="icon">search</span>
            <input
              placeholder="Search history: text, URL, device…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <button className="icon-button" title="Toggle theme">
            <span className="icon">dark_mode</span>
          </button>

        </div>
      </header>

      {initializationError && (
        <div className="initialization-error" role="alert">
          <span>Device identity could not be initialized. Clipboard capture and networking are paused.</span>
          {onRetryInitialization && (
            <button type="button" onClick={() => void onRetryInitialization()}>
              Retry
            </button>
          )}
        </div>
      )}

      {identityRotationRecovery && (
        <div className="initialization-error" role="alert">
          <span>Identity rotation is recovering. Clipboard History and local capture remain available; networking will stay disabled and retry automatically.</span>
        </div>
      )}

      {identityRotationNotice && !identityRotationRecovery && (
        <div className="initialization-error" role="status">
          <span>{identityRotationNoticeMessage(identityRotationNotice)}</span>
          {onAcknowledgeIdentityRotationNotice && (
            <button type="button" onClick={() => void onAcknowledgeIdentityRotationNotice()}>
              Dismiss
            </button>
          )}
        </div>
      )}

      {historyError && (
        <div className="initialization-error" role="alert">
          <span>{historyError}</span>
          {retryHistoryOperation && (
            <button type="button" onClick={() => {
              const retry = retryHistoryOperation;
              setHistoryError(null);
              setRetryHistoryOperation(null);
              retry();
            }}>
              Retry
            </button>
          )}
        </div>
      )}

      {clipboardHistoryError && (
        <div className="initialization-error" role="alert">
          <span>{clipboardHistoryErrorMessage(clipboardHistoryError)}</span>
          {clipboardHistoryError !== "pending_capture_failed" && onDismissClipboardHistoryError && (
            <button type="button" onClick={() => void onDismissClipboardHistoryError()}>
              Dismiss
            </button>
          )}
        </div>
      )}

      {historyPolicyError && (
        <div className="initialization-error" role="alert">
          <span>Clipboard History cleanup could not finish. Existing Clips remain available.</span>
          {onRetryHistoryCleanup && (
            <button type="button" onClick={() => void onRetryHistoryCleanup()}>
              Retry
            </button>
          )}
        </div>
      )}

      <main className="app-main">
        <aside className="surface nav-pane" style={{ display: navHidden ? "none" : undefined }}>
          {renderNavContent(false)}
        </aside>

        <section className="surface content-pane">
          <header className="content-header">
            <div className="content-title-block">
              <div className="content-title">History</div>
            </div>

            <div className="content-header-actions">
              <button className="text-button" onClick={shareNow}>
                <span className="icon">send</span>
                Share Now
              </button>
              <div className="segmented">
                <button
                  className={filterMode === "all" ? "active" : ""}
                  onClick={() => setFilterMode("all")}
                >
                  All
                </button>
                <button
                  className={filterMode === "pinned" ? "active" : ""}
                  onClick={() => setFilterMode("pinned")}
                >
                  Pinned
                </button>
              </div>

              <div className="content-filter-toggle">
                <button className="text-button" onClick={toggleFilters}>
                  <span className="icon">{filtersCollapsed ? "unfold_more" : "unfold_less"}</span>
                  {filtersCollapsed ? "More" : "Less"}
                </button>
              </div>
            </div>
          </header>

          {!filtersCollapsed && (
            <div className="content-filters">
              <div className="time-filter-wrap">
                <button className="text-button" onClick={() => setTimeMenuOpen((v) => !v)}>
                  <span className="icon">schedule</span>
                  <span className="filter-button-label">
                    {timeOptions.find((t) => t.value === timeFilter)?.label || "All time"}
                  </span>
                  <span className="icon" style={{ fontSize: 16, marginLeft: 4 }}>
                    expand_more
                  </span>
                </button>
                {timeMenuOpen && (
                  <div className="time-menu">
                    {timeOptions.map((t) => (
                      <button
                        key={t.value}
                        className={`time-menu-item ${timeFilter === t.value ? "active" : ""}`}
                        onClick={() => {
                          setTimeFilter(t.value);
                          setTimeMenuOpen(false);
                        }}
                      >
                        <span className="filter-menu-label">{t.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="source-filter-wrap">
                <button className="text-button" onClick={() => setSourceMenuOpen((v) => !v)}>
                  <span className="icon">filter_alt</span>
                  <span className="filter-button-label">
                    {sourceFilterLabel(sourceFilter)}
                  </span>
                  <span className="icon" style={{ fontSize: 16, marginLeft: 4 }}>
                    expand_more
                  </span>
                </button>
                {sourceMenuOpen && (
                  <div className="time-menu source-menu">
                    {sources.map((src) => (
                      <button
                        key={src}
                        className={`time-menu-item ${sourceFilter === src ? "active" : ""}`}
                        onClick={() => {
                          setSourceFilter(src);
                          setSourceMenuOpen(false);
                        }}
                      >
                        <span className="filter-menu-label">{sourceOptionLabel(src)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button className="text-button" onClick={clearAllHistory}>
                <span className="icon">delete_sweep</span>
                Clear
              </button>
            </div>
          )}

          <div className="history-grid">
          {filteredClips.length === 0 && (
            <article className="history-card" style={{ minHeight: 120, maxHeight: 120 }}>
              <div className="history-body">
                <div className="history-text">No clips yet. Copy something!</div>
                </div>
              </article>
            )}
            {filteredClips.map((clip) => {
              const label = deviceNameMap.get(clip.originPeerId) || clip.originPeerId;
              const timeLabel = formatTime(clip.capturedAt);
              const isLocal = clip.originPeerId === identity?.deviceId;
              const pinned = pinnedSet.has(clip.id);
              const pinIconName = pinned ? "keep" : "push_pin";
              return (
                <article
                  className={`history-card ${removingIds.has(clip.id) ? "leaving" : ""}`}
                  key={clip.id}
                  style={{ position: "relative" }}
                >
                  <div className="history-card-header">
                    <div className="history-chip" title={`From: ${label}`}>
                      <span className="chip-dot"></span>
                      <span className="history-chip-prefix">From:</span>
                      <MiddleEllipsisText className="history-chip-label" text={label} />
                    </div>
                    <div className="history-actions">
                      <button
                        className="icon-button"
                        title={pinned ? "Unpin" : "Pin"}
                        onClick={() => setPinned(clip.id, !pinned)}
                        style={{
                          transform: pinned ? "rotate(18deg)" : "none",
                        }}
                      >
                        <span
                          className={`icon pin-icon ${pinned ? "filled" : "outlined"}`}
                        >
                          {pinIconName}
                        </span>
                      </button>
                      <div className="history-menu">
                        <button
                          className="icon-button"
                          title="More"
                          onClick={() => setOpenMenuId(openMenuId === clip.id ? null : clip.id)}
                        >
                          <span className="icon">more_vert</span>
                        </button>
                        {openMenuId === clip.id && (
                          <div className="history-menu-dropdown">
                            <button
                              className="text-button"
                              style={{ width: "100%", justifyContent: "flex-start" }}
                              onClick={() => {
                                setOpenMenuId(null);
                                handleDelete(clip.id);
                              }}
                            >
                              <span className="icon">delete</span>Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="history-body">
                    <div className="history-text">{truncate(clip.content)}</div>
                  </div>

                  <div className="history-meta">
                    <div className="meta-left">
                      <div className="meta-top-line">
                        <span className="pill-source">
                          <span className="icon" style={{ fontSize: 12 }}>
                            {isLocal ? "computer" : "devices"}
                          </span>
                          {isLocal ? "Local" : "Remote"}
                        </span>
                        <span className="meta-time">{timeLabel}</span>
                      </div>
                      <div className="meta-bottom-line">{clip.type === "url" ? "URL" : "Text"}</div>
                    </div>
                    <div className="meta-actions">
                      <button className="mini-button" onClick={() => reuseClip(clip.id)}>
                        <span className="icon" style={{ fontSize: 14 }}>
                          content_copy
                        </span>
                        Copy
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </main>

      {showNav && isNarrow && (
        <div className="nav-overlay" onClick={() => setShowNav(false)}>
          <div className="nav-drawer nav-drawer-open" onClick={(e) => e.stopPropagation()}>
            <aside className="surface nav-pane drawer-pane">
              {renderNavContent(true)}
            </aside>
          </div>
        </div>
      )}

      {qrOpen && (
        createPortal(
          <div className="qr-modal-backdrop" role="presentation">
            <div className="qr-modal" role="dialog" aria-modal="true" aria-labelledby="qr-modal-title">
              <div className="qr-modal-header">
                <div id="qr-modal-title" className="qr-modal-title">
                  Pair this device
                </div>
                <button className="icon-button" onClick={closeQr} aria-label="Close QR dialog">
                  <span className="icon">close</span>
                </button>
              </div>
              {qrLoading && <div className="qr-modal-status">Creating QR code...</div>}
              {!qrLoading && qrError && <div className="qr-modal-error">{qrError}</div>}
              {!qrLoading && !qrError && qrImage && (
                <div className="qr-code-frame">
                  <img src={qrImage} alt="Pairing QR" className="qr-modal-image" />
                </div>
              )}
              {!qrLoading && !qrError && qrText && (
                <button
                  className="primary-button qr-modal-copy"
                  onClick={() => navigator.clipboard.writeText(qrText)}
                >
                  Copy QR text
                </button>
              )}
            </div>
          </div>,
          document.body
        )
      )}

    </div>
  );
}
