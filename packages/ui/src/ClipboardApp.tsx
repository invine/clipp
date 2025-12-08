import React, { useEffect, useMemo, useRef, useState } from "react";
import { Buffer } from "buffer";
import { Clip, Device, Identity, PendingRequest } from "./types";
import { encode } from "../../core/qr";
import { encodePairing } from "../../core/pairing/encode";
import { DEFAULT_WEBRTC_STAR_RELAYS } from "../../core/network/constants";
import { deviceIdToPeerId } from "../../core/network/peerId";
import appLogo from "../../../clipp-electron-icons-bundle/clipp-purple-32.png";

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

type MiddleEllipsisTextProps = {
  text: string;
  max?: number;
  className?: string;
  style?: React.CSSProperties;
};

function MiddleEllipsisText({ text, max = 28, className, style }: MiddleEllipsisTextProps) {
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

      // Find the longest middle-ellipsized string (up to `max` chars) that fits.
      const maxChars = Math.max(6, Math.min(max, text.length));
      let low = 6;
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
  peers: string[];
  identity: Identity | null;
  pinnedIds: string[];
  onDeleteClip(id: string): void | Promise<void>;
  onUnpair(id: string): void | Promise<void>;
  onAccept(dev: PendingRequest): void | Promise<void>;
  onReject(dev: PendingRequest): void | Promise<void>;
  onPairText(txt: string): void | Promise<void>;
  onRequestQr(): Promise<Identity | null>;
  onTogglePin(id: string): void | Promise<void>;
  onClearAll(): void | Promise<void>;
  onRenameIdentity?(name: string): Promise<Identity | null>;
};

export function ClipboardApp({
  clips,
  devices,
  pending,
  peers,
  identity,
  pinnedIds,
  onDeleteClip,
  onUnpair,
  onAccept,
  onReject,
  onPairText,
  onRequestQr,
  onTogglePin,
  onClearAll,
  onRenameIdentity,
}: ClipboardAppProps) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [isNarrow, setIsNarrow] = useState(false);
  const pinnedSet = useMemo(() => new Set(pinnedIds), [pinnedIds]);
  const [search, setSearch] = useState("");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [filterMode, setFilterMode] = useState<"all" | "pinned">("all");
  const [pairText, setPairText] = useState("");
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [qrText, setQrText] = useState<string | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [showNav, setShowNav] = useState(false);
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());
  const [peerIdMap, setPeerIdMap] = useState<Record<string, string>>({});
  const [timeMenuOpen, setTimeMenuOpen] = useState(false);
  const [sourceMenuOpen, setSourceMenuOpen] = useState(false);
  const [filtersCollapsed, setFiltersCollapsed] = useState(false);
  const [userToggledFilters, setUserToggledFilters] = useState(false);
  const [editingLocalName, setEditingLocalName] = useState(false);
  const [localNameDraft, setLocalNameDraft] = useState("");
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

  useEffect(() => {
    let cancelled = false;
    async function computePeerIds() {
      try {
        const ids = Array.from(new Set([...devices, ...pending].map((dev) => dev.deviceId)));
        const entries = await Promise.all(
          ids.map(async (id) => [id, await deviceIdToPeerId(id)] as const),
        );
        if (cancelled) return;
        const next: Record<string, string> = {};
        entries.forEach(([id, pid]) => {
          next[id] = pid;
        });
        setPeerIdMap(next);
      } catch {
        // ignore errors and fall back to deviceId
      }
    }
    computePeerIds();
    return () => {
      cancelled = true;
    };
  }, [devices, pending]);

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

  const filteredClips = useMemo(() => {
    const now = Date.now();
    const rangeMs = timeOptions.find((t) => t.value === timeFilter)?.ms;
    let list = clips
      .filter((c) => {
        if (rangeMs) return c.timestamp >= now - rangeMs;
        return true;
      })
      .filter((c) => {
        if (sourceFilter === "all") return true;
        if (sourceFilter === "local" && identity) return c.senderId === identity.deviceId;
        if (sourceFilter === "remote" && identity) return c.senderId !== identity.deviceId;
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

    if (filterMode === "pinned") {
      list = list.filter((c) => pinnedSet.has(c.id));
    }

    return list;
  }, [clips, search, timeFilter, sourceFilter, deviceNameMap, filterMode, pinnedSet, identity]);

  function togglePin(id: string) {
    onTogglePin(id);
  }

  function handleDelete(id: string) {
    setRemovingIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    setTimeout(() => {
      Promise.resolve(onDeleteClip(id)).finally(() =>
        setRemovingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        }),
      );
    }, 180);
  }

  function clearFilters() {
    setSearch("");
    setTimeFilter("all");
    setSourceFilter("all");
    setFilterMode("all");
  }

  function clearAllHistory() {
    setRemovingIds(new Set(clips.map((c) => c.id)));
    Promise.resolve(onClearAll()).finally(() => setRemovingIds(new Set()));
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

  function copyClip(text: string) {
    navigator.clipboard.writeText(text).catch(() => {});
  }

  async function handleShowQr() {
    if ((window as any).clipp?.openQrWindow) {
      await (window as any).clipp.openQrWindow();
      return;
    }

    const id = await onRequestQr();
    if (!id) {
      alert("No identity found. Please ensure the app has initialized.");
      return;
    }
    try {
      // Ensure Buffer exists for QR encoding in renderer contexts
      if (!(globalThis as any).Buffer) {
        (globalThis as any).Buffer = Buffer;
      }
      const peerId = await deviceIdToPeerId(id.deviceId);
      const addrs =
        id.multiaddrs && id.multiaddrs.length
          ? id.multiaddrs
          : id.multiaddr
          ? [id.multiaddr]
          : DEFAULT_WEBRTC_STAR_RELAYS.map((addr) => `${addr}/p2p/${peerId}`);
      const safeAddrs = addrs.length ? addrs : [`/p2p/${peerId}`];
      const info = {
        deviceId: id.deviceId,
        deviceName: id.deviceName,
        multiaddrs: safeAddrs,
        publicKey: id.publicKey,
      };
      const img = await encode(info);
      const txt = encodePairing(info);
      setQrImage(img);
      setQrText(txt);
      setQrOpen(true);
    } catch (err: any) {
      console.error("Failed to generate QR", err);
      alert(`Failed to generate QR. ${err?.message || "Please try again."}`);
    }
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
                      <div className="peer-name">{identity.deviceName || "Local device"}</div>
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

        {pending.length > 0 && (
          <>
            <div className="section-divider"></div>
            <div>
              <div className="nav-section-label" style={{ marginTop: 14 }}>
                Pending requests
              </div>
              <div className="pending-list">
                {pending.map((req) => {
                  const peerId = peerIdMap[req.deviceId] || req.deviceId;
                  return (
                    <div key={req.deviceId} className="pending-card">
                      <div className="pending-card-header">
                        <div className="peer-avatar">{req.deviceName?.[0] || "D"}</div>
                        <div className="peer-meta">
                          <div className="peer-name">{req.deviceName}</div>
                          <MiddleEllipsisText
                            className="peer-sub"
                            text={peerId}
                            max={isNarrow ? 22 : 32}
                          />
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
              onClick={() => {
                if (pairText.trim()) onPairText(pairText.trim());
              }}
            >
              Add
            </button>
          </div>
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
            {devices.map((dev) => {
              const peerId = peerIdMap[dev.deviceId] || dev.deviceId;
              return (
                <div
                  key={dev.deviceId}
                  className="peer-item"
                  title={`Paired ${formatTime(dev.createdAt)}`}
                  style={{ border: "1px solid rgba(255,255,255,0.06)" }}
                >
                  <div className="peer-avatar">{dev.deviceName?.[0] || "D"}</div>
                  <div className="peer-meta">
                    <div className="peer-name">{dev.deviceName}</div>
                    <MiddleEllipsisText
                      className="peer-sub"
                      text={peerId}
                      max={isNarrow ? 22 : 32}
                    />
                  </div>
                  <div className="peer-actions">
                    <div className="peer-indicator">
                      <span className="icon" style={{ fontSize: 14 }}>
                        smartphone
                      </span>
                    </div>
                    <button
                      className="icon-button"
                      title="Unpair this device"
                      onClick={() => onUnpair(dev.deviceId)}
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
      </>
    );
  }

  return (
    <div className="app-shell">
      <header className="app-bar">
        <div className="app-bar-left">
          <div
            className="app-logo"
            onClick={() => {
              if (isNarrow) setShowNav(true);
            }}
          >
            <img src={appLogo} alt="Clipp logo" />
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
                  {timeOptions.find((t) => t.value === timeFilter)?.label || "All time"}
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
                        {t.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="source-filter-wrap">
                <button className="text-button" onClick={() => setSourceMenuOpen((v) => !v)}>
                  <span className="icon">filter_alt</span>
                  {sourceFilter === "all"
                    ? "Source: All"
                    : sourceFilter === "local"
                    ? "Source: Local"
                    : sourceFilter === "remote"
                    ? "Source: Remote"
                    : deviceNameMap.get(sourceFilter) || sourceFilter}
                  <span className="icon" style={{ fontSize: 16, marginLeft: 4 }}>
                    expand_more
                  </span>
                </button>
                {sourceMenuOpen && (
                  <div className="time-menu">
                    {sources.map((src) => (
                      <button
                        key={src}
                        className={`time-menu-item ${sourceFilter === src ? "active" : ""}`}
                        onClick={() => {
                          setSourceFilter(src);
                          setSourceMenuOpen(false);
                        }}
                      >
                        {src === "all"
                          ? "All sources"
                          : src === "local"
                          ? "Local"
                          : src === "remote"
                          ? "Remote"
                          : deviceNameMap.get(src) || src}
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
              const label = deviceNameMap.get(clip.senderId) || clip.senderId;
              const timeLabel = formatTime(clip.timestamp);
              const isLocal = clip.senderId === identity?.deviceId;
              const pinned = pinnedSet.has(clip.id);
              const pinIconName = pinned ? "keep" : "push_pin";
              return (
                <article
                  className={`history-card ${removingIds.has(clip.id) ? "leaving" : ""}`}
                  key={clip.id}
                  style={{ position: "relative" }}
                >
                  <div className="history-card-header">
                      <div className="history-chip">
                        <span className="chip-dot"></span>
                        From: {label}
                      </div>
                    <div className="history-actions">
                      <button
                        className="icon-button"
                        title={pinned ? "Unpin" : "Pin"}
                        onClick={() => togglePin(clip.id)}
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
                        <span>{timeLabel}</span>
                      </div>
                      <div className="meta-bottom-line">Text</div>
                    </div>
                    <div className="meta-actions">
                      <button className="mini-button" onClick={() => copyClip(clip.content)}>
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

      {qrOpen && qrImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div
            style={{
              background: "rgba(16,17,20,0.95)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 16,
              padding: 16,
              width: "360px",
            }}
          >
            <div className="flex items-center justify-between mb-2" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div className="text-white font-semibold">Pair this device</div>
              <button className="icon-button" onClick={() => setQrOpen(false)}>
                Close
              </button>
            </div>
            <div className="flex justify-center" style={{ display: "flex", justifyContent: "center" }}>
              <img
                src={qrImage}
                alt="Pairing QR"
                style={{ width: 160, height: 160, borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)" }}
              />
            </div>
            {qrText && (
              <button
                className="primary-button"
                style={{ width: "100%", marginTop: 12, justifyContent: "center" }}
                onClick={() => navigator.clipboard.writeText(qrText)}
              >
                Copy QR text
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
