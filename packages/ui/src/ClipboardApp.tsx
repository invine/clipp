import { shortenPreview, previewGraphemes } from "./previewText";
import { projectConnectionSummary } from "../../core/runtime/connectionSummary";
import { ConnectionStatusButton, ConnectionsPanel } from "./ConnectionSummary";
import { NotificationSettings } from "./NotificationSettings";
import type { NotificationAvailabilityControls } from "./useNotificationAvailability";
import type { HostTaskInput } from "./hostTaskInput";
import {
  pairingScanErrorMessage,
  type PairingScanError,
  type PairingScanOptions,
  type PairingScanResult,
  type PairingCameraPermission,
  type CameraPermissionState,
} from "./pairingScan";
import { ClipDetails } from "./ClipDetails";
import {
  BackgroundContinuityControls,
  BackgroundContinuityHelp,
} from "./BackgroundContinuityControls";
import type { BackgroundContinuityState } from "./types";
import { ClipSettings } from "./ClipSettings";
import { findSessionFocus } from "./sessionFocus";
import { NARROW_CONTENT_WIDTH } from "./workspaceLayout";
import { Appearance, type AppearanceSettings } from "./Appearance";
import { PairingStatus } from "./PairingStatus";
import type { PairingOutcome, PairingOutcomeSnapshot } from "./types";
import { useTaskRecoveryIssues } from "./useTaskRecoveryIssues";
import {
  composeRecoveryIssues,
  type RecoveryIssue,
  type PopupCaptureState,
} from "../../core/runtime/recoveryIssues";
import { RecoveryIssues } from "./RecoveryIssues";
import { Icon, IconButton } from "./controls";
import { HOST_GEOMETRY_EVENT, hostContentSize } from "./hostGeometry";
import { TaskDialog } from "./TaskDialog";
import type { AutoSyncActionResult } from "../../core/runtime/autoSyncAction";
import { createUiSession, type UiSession } from "./uiSession";
import type {
  RelayMutation,
  RelayMutationResult,
} from "../../core/network/relayMutations";
import type { RelayActionResult } from "../../core/network/relayActions";
import { PairingCodeContent } from "./PairingCodeContent";
import { usePairingCodeTask } from "./usePairingCodeTask";
import type { PayloadCopyResult } from "../../core/clipboard/payloadCopy";
import {
  pairingSubmissionMessage,
  pairingApprovalMessage,
} from "./pairingFeedback";
import type {
  PairingSubmissionResult,
  PairingApprovalResult,
} from "../../core/pairing/results";
import { ManagedRelaySettings } from "./ManagedRelaySettings";
import {
  PreferenceRefreshNotice,
  PreferenceSaveFeedback,
} from "./PreferenceSaveFeedback";
import { ClearHistoryReview } from "./ClearHistoryReview";
import {
  ManualIdentityResetSettings,
  type ManualIdentityResetActions,
} from "./ManualIdentityResetSettings";
import type {
  IdentityResetReceipt,
  IdentityResetState,
} from "../../core/trust/manualIdentityReset";
import type {
  RelayConfiguration,
  RelayState,
} from "../../core/network/managedRelays.js";
import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import {
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
  RelayConnectionInfo,
} from "./types";
import { type IdentityRotationNoticeReason } from "./identityRotationNotice";
import {
  normalizeShareNowFailureCode,
  reuseClipFeedback,
  shareNowFailureFeedback,
  type ReuseClipOutcome,
} from "./clipboardActionFeedback";
import clippPurpleIcon from "../../../clipp-electron-icons-bundle/clipp-purple-64.png";
import { nameSaveErrorMessage, saveNonEmptyAlias } from "./nameEditSession";

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

function connectionStatusFor(
  connection: PeerConnectionInfo | undefined,
  online: boolean,
  known: boolean
) {
  if (!known) return { kind: "unknown", title: "Connection status unknown" };
  if (!online) {
    return {
      kind: "offline",
      title: "Offline",
    };
  }
  if (!connection) {
    return {
      kind: "unknown",
      title: "Connected · path unknown",
    };
  }
  if (connection.hasDirect) {
    return {
      kind: "direct",
      title: "Connected · direct",
    };
  }
  if (connection.hasRelay) {
    return {
      kind: "relay",
      title: "Connected · relay",
    };
  }
  return {
    kind: "unknown",
    title: "Connected · path unknown",
  };
}

function relayDisplayName(address: string, index: number): string {
  const parts = address.split("/").filter(Boolean);
  const hostIndex = parts.findIndex((part) =>
    ["dns4", "dns6", "ip4", "ip6"].includes(part)
  );
  const host = hostIndex >= 0 ? parts[hostIndex + 1] : "";
  const tcpIndex = parts.findIndex((part) => part === "tcp");
  const port = tcpIndex >= 0 ? parts[tcpIndex + 1] : "";
  if (host && port) return `${host}:${port}`;
  if (host) return host;

  const p2pIndex = parts.findIndex((part) => part === "p2p");
  const peerId = p2pIndex >= 0 ? parts[p2pIndex + 1] : "";
  if (peerId) return `Relay ${shortenPreview(peerId, 12, "middle")}`;

  return `Relay ${index + 1}`;
}

function parseRelayInput(value: string): string[] {
  return value
    .split(/\r?\n|,/)
    .map((addr) => addr.trim())
    .filter(Boolean);
}

function relayConnectionFor(
  address: string,
  relayConnections: RelayConnectionInfo[]
) {
  return relayConnections.find(
    (conn) => conn.address === address || conn.addrs.includes(address)
  );
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

function MiddleEllipsisText({
  text,
  max,
  className,
  style,
}: MiddleEllipsisTextProps) {
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
      const maxChars = Math.max(
        1,
        Math.min(
          max ?? previewGraphemes(text).length,
          previewGraphemes(text).length
        )
      );
      let low = 1;
      let high = maxChars;
      let best = shortenPreview(text, low, "middle");

      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const candidate = shortenPreview(text, mid, "middle");
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
    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(computeDisplay)
        : null;
    resizeObserver?.observe(container);
    window.addEventListener("resize", computeDisplay);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", computeDisplay);
    };
  }, [text, max]);

  const classes = className
    ? `middle-ellipsis ${className}`
    : "middle-ellipsis";

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
  pairingOutcomes?: PairingOutcome[];
  pairingState?: PairingOutcomeSnapshot;
  requestsLoading?: boolean;
  requestsUnavailable?: boolean;
  onRetryRequests?(): boolean | void | Promise<boolean | void>;
  onDismissPairingOutcome?(targetPeerId: string): Promise<boolean>;
  peers: string[];
  connectionStateKnown?: boolean;
  peerConnections?: PeerConnectionInfo[];
  relayConnections?: RelayConnectionInfo[];
  identity: Identity | null;
  pinnedIds: string[];
  historyLoading?: boolean;
  historyUnavailable?: boolean;
  historyRefreshError?: string | null;
  onRetryHistoryRefresh?(): boolean | Promise<boolean>;
  onInspectClip?(id: string): void;
  localRetentionMs?: number;
  appearanceSettings?: AppearanceSettings;
  autoSync?: boolean;
  autoSyncKnown?: boolean;
  autoSyncLoading?: boolean;
  autoSyncRefreshing?: boolean;
  autoSyncPending?: boolean;
  autoSyncRecoveryRequired?: boolean;
  autoSyncRefreshError?: string | null;
  autoSyncFeedback?: {
    status: "applied" | "partial" | "rejected" | "unconfirmed";
    error?: string;
  } | null;
  popupCapture?: PopupCaptureState;
  onRetryPopupCapture?(): Promise<boolean>;
  clipboardHistoryError?: ClipboardHistoryError | null;
  historyPolicyError?: HistoryPolicyError | null;
  relayAddresses?: string[];
  managedRelayConfigurations?: RelayConfiguration[];
  managedRelayStates?: RelayState[];
  initializationError?: boolean;
  runtimeError?: string | null;
  onRetryRuntime?(): boolean | void | Promise<boolean | void>;
  identityRotationRecovery?: boolean;
  identityRotationNotice?: IdentityRotationNoticeReason | null;
  backgroundContinuity?: BackgroundContinuityState;
  onDeleteClip(id: string): void | Promise<void>;
  onUnpair(id: string): void | Promise<void>;
  onAccept(dev: PendingRequest): Promise<PairingApprovalResult>;
  onReject(dev: PendingRequest): Promise<PairingApprovalResult>;
  onPairText(txt: string): Promise<PairingSubmissionResult>;
  pairingDiagnostics?: React.ReactNode;
  onScanPairingCode?(options: PairingScanOptions): Promise<PairingScanResult>;
  scanCameraPermission?: PairingCameraPermission;
  onRequestPairingCode(): Promise<PairingCode | null>;
  onCopyPairingText(text: string): Promise<PayloadCopyResult>;
  onReuseClip(id: string): ReuseClipOutcome | Promise<ReuseClipOutcome>;
  pairingImport?: React.ReactNode;
  taskInput?: HostTaskInput;
  onShareNow?(): void | Promise<void>;
  onSetPinned(id: string, pinned: boolean): void | Promise<void>;
  onClearAll(): void | Promise<void>;
  onDismissClipboardHistoryError?(): void | Promise<void>;
  onRetryHistoryCleanup?(): void | Promise<void>;
  onSetLocalRetention?(retentionMs: number): void | Promise<void>;
  onSetAutoSync?(enabled: boolean): void | Promise<void | AutoSyncActionResult>;
  onRetryAutoSync?(): boolean | void | Promise<boolean | void>;
  onSetBackgroundContinuity?(enabled: boolean): Promise<void>;
  onRefreshBackgroundContinuity?(): Promise<unknown>;
  onOpenBackgroundNotificationSettings?(): Promise<void>;
  notificationControls?: NotificationAvailabilityControls;
  onExportBackgroundContinuityDiagnostics?(): void | Promise<void>;
  onRenameIdentity?(
    name: string,
    expectedDeviceId: string
  ): Promise<Identity | null>;
  onRenameDevice?(id: string, name: string): Promise<Device | null>;
  onSetRelayAddresses?(
    addrs: string[]
  ): Promise<string[] | void> | string[] | void;
  session?: UiSession;
  onRefreshManagedRelays?(): Promise<RelayConfiguration[]>;
  onMutateManagedRelay?(mutation: RelayMutation): Promise<RelayMutationResult>;
  onManagedRelayLogin?(key: string): Promise<RelayActionResult>;
  onManagedRelayAccount?(key: string): Promise<RelayActionResult>;
  onManagedRelayRetry?(key: string): Promise<RelayActionResult>;
  onRetryInitialization?(): boolean | void | Promise<boolean | void>;
  onAcknowledgeIdentityRotationNotice?(): void | Promise<void>;
  manualIdentityResetAvailable?: boolean;
  identityResetState?: IdentityResetState;
  identityResetActions?: ManualIdentityResetActions;
  onPairAfterIdentityReset?(): void;
  onCopyFormerIdentity?(receipt: IdentityResetReceipt): Promise<void>;
};

export function ClipboardApp({
  clips,
  devices,
  pending,
  waiting = [],
  pairingErrors = [],
  pairingOutcomes = [],
  requestsLoading = false,
  requestsUnavailable = false,
  onRetryRequests,
  onDismissPairingOutcome,
  peers,
  connectionStateKnown = false,
  peerConnections = [],
  relayConnections = [],
  identity,
  pinnedIds,
  historyLoading = false,
  historyUnavailable: sourceHistoryUnavailable = false,
  historyRefreshError = null,
  onRetryHistoryRefresh,
  onInspectClip,
  localRetentionMs = 30 * 24 * 60 * 60 * 1000,
  appearanceSettings,
  autoSync = true,
  autoSyncKnown = true,
  autoSyncLoading = false,
  autoSyncRefreshing = false,
  autoSyncPending = false,
  autoSyncRecoveryRequired = false,
  autoSyncRefreshError = null,
  autoSyncFeedback = null,
  popupCapture,
  onRetryPopupCapture,
  clipboardHistoryError = null,
  historyPolicyError = null,
  relayAddresses = [],
  managedRelayConfigurations = [],
  managedRelayStates = [],
  initializationError = false,
  runtimeError = null,
  onRetryRuntime,
  identityRotationRecovery = false,
  identityRotationNotice = null,
  backgroundContinuity,
  onDeleteClip,
  onUnpair,
  onAccept,
  onReject,
  onPairText,
  pairingDiagnostics,
  pairingImport,
  onScanPairingCode,
  scanCameraPermission,
  onRequestPairingCode,
  onCopyPairingText,
  onReuseClip,
  onShareNow,
  taskInput,
  onSetPinned,
  onClearAll,
  onDismissClipboardHistoryError,
  onRetryHistoryCleanup,
  onSetLocalRetention,
  onSetAutoSync,
  onRetryAutoSync,
  onSetBackgroundContinuity,
  onRefreshBackgroundContinuity,
  onOpenBackgroundNotificationSettings,
  notificationControls,
  onExportBackgroundContinuityDiagnostics,
  onRenameIdentity,
  onRenameDevice,
  onSetRelayAddresses,
  session: providedSession,
  onRefreshManagedRelays,
  onMutateManagedRelay,
  onManagedRelayLogin,
  onManagedRelayAccount,
  onManagedRelayRetry,
  onRetryInitialization,
  onAcknowledgeIdentityRotationNotice,
  manualIdentityResetAvailable = false,
  identityResetState,
  identityResetActions,
  onPairAfterIdentityReset,
  onCopyFormerIdentity,
}: ClipboardAppProps) {
  const [isNarrow, setIsNarrow] = useState(false);
  const [isCramped, setIsCramped] = useState(false);
  const pinnedSet = useMemo(() => new Set(pinnedIds), [pinnedIds]);
  const [session] = useState(() => providedSession ?? createUiSession());
  const sessionState = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot
  );
  const activeTask = sessionState.tasks[sessionState.tasks.length - 1];
  const { search, timeFilter, sourceFilter, filterMode, showNav } =
    sessionState;
  const setSearch = (search: string) => session.update({ search });
  const setTimeFilter = (timeFilter: TimeFilter) =>
    session.update({ timeFilter });
  const setSourceFilter = (sourceFilter: string) =>
    session.update({ sourceFilter });
  const setFilterMode = (filterMode: "all" | "pinned" | "links") =>
    session.update({ filterMode });
  const setShowNav = (value: boolean | ((current: boolean) => boolean)) =>
    session.update({
      showNav:
        typeof value === "function"
          ? value(session.getSnapshot().showNav)
          : value,
    });
  const pairingTask = session.pairing;
  const pair = useSyncExternalStore(
    pairingTask.subscribe,
    pairingTask.getSnapshot,
    pairingTask.getSnapshot
  );
  const approvalBusy = useRef(new Set<string>());
  const [approvalsPending, setApprovalsPending] = useState<string[]>([]);
  const [approvalFeedback, setApprovalFeedback] = useState<
    Record<string, string>
  >({});
  async function decideRequest(request: PendingRequest, accepted: boolean) {
    if (
      !identityReady ||
      requestsLoading ||
      requestsUnavailable ||
      approvalBusy.current.has(request.deviceId)
    )
      return;
    approvalBusy.current.add(request.deviceId);
    setApprovalsPending([...approvalBusy.current]);
    const identityId = identity?.deviceId;
    let result: PairingApprovalResult;
    try {
      result = await (accepted ? onAccept(request) : onReject(request));
    } catch {
      result = { ok: false, error: "outcome_unconfirmed", admitted: null };
    }
    if (!result || typeof result.ok !== "boolean")
      result = { ok: false, error: "outcome_unconfirmed", admitted: null };
    if (currentIdentity.current === identityId)
      setApprovalFeedback((previous) => ({
        ...previous,
        [request.deviceId]: pairingApprovalMessage(result, accepted),
      }));
    approvalBusy.current.delete(request.deviceId);
    setApprovalsPending([...approvalBusy.current]);
  }
  const [isScanningPairing, setIsScanningPairing] = useState(false);
  const [scanError, setScanError] = useState<PairingScanError | null>(null);
  const [cameraPermission, setCameraPermission] =
    useState<CameraPermissionState>("unknown");
  useEffect(() => {
    if (scanError !== "camera_permission_denied" || !scanCameraPermission)
      return;
    let live = true,
      revision = 0;
    const read = () => {
      const current = ++revision;
      void scanCameraPermission
        .read()
        .catch(() => "unknown" as const)
        .then((state) => {
          if (live && revision === current) setCameraPermission(state);
        });
    };
    read();
    const unsubscribe = scanCameraPermission.subscribeReturn(read);
    return () => {
      live = false;
      unsubscribe();
    };
  }, [scanError, scanCameraPermission]);
  const activeScan = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      const capture = activeScan.current;
      activeScan.current = null;
      capture?.abort();
    },
    []
  );
  useEffect(() => () => activeScan.current?.abort(), [identity?.deviceId]);
  const { task: qrTask, state: qrState } = usePairingCodeTask(
    identity ? `${identity.deviceId}:${identity.deviceName}` : null,
    session.qr
  );
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());
  const [timeMenuOpen, setTimeMenuOpen] = useState(false);
  const [sourceMenuOpen, setSourceMenuOpen] = useState(false);
  const [filtersCollapsed, setFiltersCollapsed] = useState(false);
  const [userToggledFilters, setUserToggledFilters] = useState(false);
  const localNameSession = session.name;
  const localNameEdit = useSyncExternalStore(
    localNameSession.subscribe,
    localNameSession.getSnapshot,
    localNameSession.getSnapshot
  );
  const aliasSession = session.alias;
  const aliasEdit = useSyncExternalStore(
    aliasSession.subscribe,
    aliasSession.getSnapshot,
    aliasSession.getSnapshot
  );
  const revocations = useRef(new Map<string, symbol>());
  const [revokingIds, setRevokingIds] = useState<string[]>([]);
  const revocationOwnerAlive = useRef(true);
  const currentIdentity = useRef(identity?.deviceId);
  currentIdentity.current = identity?.deviceId;
  useEffect(() => {
    revocationOwnerAlive.current = true;
    return () => {
      revocationOwnerAlive.current = false;
      for (const id of revocations.current.keys())
        session.setActivity(`revoke:${id}`, false);
      revocations.current.clear();
    };
  }, [session]);
  const [revocationError, setRevocationError] = useState<{
    deviceId: string;
    identityId: string | undefined;
  } | null>(null);
  const [deviceCopyFeedback, setDeviceCopyFeedback] = useState<string | null>(
    null
  );
  const [relaysOpen, setRelaysOpen] = useState(true);
  const [addingRelay, setAddingRelay] = useState(false);
  const [editingRelayIndex, setEditingRelayIndex] = useState<number | null>(
    null
  );
  const [relayDraft, setRelayDraft] = useState("");
  const [relaySaving, setRelaySaving] = useState(false);
  const [relayError, setRelayError] = useState<string | null>(null);
  const [clearReviewOpen, setClearReviewOpen] = useState(false);
  const [clearPending, setClearPending] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);
  const [clearNeedsRefresh, setClearNeedsRefresh] = useState(false);
  const [clearRefreshPending, setClearRefreshPending] = useState(false);
  useEffect(() => {
    const menu = Boolean(timeMenuOpen || sourceMenuOpen);
    const drawer = showNav && sessionState.tasks.length === 0;
    const guardedClear = clearPending && clearReviewOpen;
    if (!taskInput || (!menu && !drawer && !guardedClear)) return;
    if (guardedClear) return taskInput.registerOverlay({});
    return taskInput.registerOverlay({
      dismiss: () => {
        if (menu) {
          setTimeMenuOpen(false);
          setSourceMenuOpen(false);
        } else dismissNav();
      },
    });
  }, [
    taskInput,
    timeMenuOpen,
    sourceMenuOpen,
    showNav,
    sessionState.tasks.length,
    clearPending,
    clearReviewOpen,
  ]);
  useEffect(() => {
    session.setActivity(
      "management-actions",
      clearPending ||
        clearRefreshPending ||
        approvalsPending.length > 0 ||
        isScanningPairing ||
        Boolean(appearanceSettings?.pending)
    );
    return () => session.setActivity("management-actions", false);
  }, [
    session,
    clearPending,
    clearRefreshPending,
    approvalsPending,
    isScanningPairing,
    appearanceSettings?.pending,
  ]);
  const rootRef = useRef<HTMLDivElement>(null);
  const previousIdentity = useRef<string | null>(null);
  useEffect(() => {
    if (
      identity?.deviceId &&
      previousIdentity.current &&
      identity.deviceId !== previousIdentity.current
    ) {
      session.rotateIdentity();
      setApprovalFeedback({});
    }
    if (identity?.deviceId) previousIdentity.current = identity.deviceId;
  }, [identity?.deviceId, session]);
  useEffect(() => {
    const context = session.getSnapshot();
    const root = rootRef.current;
    if (!root) return;
    for (const element of [
      root,
      ...root.querySelectorAll<HTMLElement>("[data-session-scroll]"),
    ]) {
      const key = element.dataset.sessionScroll;
      if (key && element.getClientRects().length)
        element.scrollTop =
          context.scroll[
            element === root ? `${key}:${context.destination}` : key
          ] ??
          context.scroll[key] ??
          0;
    }
    if (context.destination === "history" && context.historyAnchor) {
      const clip = [
        ...root.querySelectorAll<HTMLElement>("[data-clip-id]"),
      ].find(
        (element) => element.dataset.clipId === context.historyAnchor?.clipId
      );
      const scroller = isCramped
        ? root
        : root.querySelector<HTMLElement>('[data-session-scroll="history"]');
      if (clip && scroller)
        scroller.scrollTop +=
          clip.getBoundingClientRect().top -
          scroller.getBoundingClientRect().top -
          context.historyAnchor.offset;
    }
    if (context.tasks.length) return;
    const focus = findSessionFocus(root, context.focusKey, {
      visible: true,
      enabled: true,
    });
    (
      focus ?? root.querySelector<HTMLElement>("[data-session-focus=workspace]")
    )?.focus({ preventScroll: true });
    if (focus?.dataset.sessionFocus?.match(/^(copy|pin|more):/))
      focus.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [
    session,
    isNarrow,
    isCramped,
    showNav,
    sessionState.destination,
    sessionState.navigationVersion,
    sessionState.tasks.length,
  ]);
  useEffect(() => {
    if (sessionState.tasks.length || document.activeElement !== document.body)
      return;
    const focus = findSessionFocus(rootRef.current, sessionState.focusKey, {
      visible: false,
      enabled: true,
    });
    focus?.focus({ preventScroll: true });
  }, [
    sessionState.historyActions,
    sessionState.focusKey,
    sessionState.tasks.length,
  ]);
  const historyUnavailable =
    sourceHistoryUnavailable ||
    (clips.length === 0 && (initializationError || Boolean(runtimeError)));
  const identityReady =
    Boolean(identity) &&
    !initializationError &&
    !identityRotationRecovery &&
    !runtimeError;
  const issues = composeRecoveryIssues({
    initializationError,
    runtimeError,
    identityRotationRecovery,
    identityRotationNotice,
    historyUnavailable: sourceHistoryUnavailable,
    historyRefreshError,
    popupCapture,
    clipboardHistoryError,
    historyPolicyError,
    pairingErrors,
    managedRelayStates,
  });
  for (const [target, action] of Object.entries(sessionState.historyActions)) {
    if (action.feedback && action.feedback.status !== "success")
      issues.push({
        id: `history:${target}:action_failed`,
        scope: "history",
        code: "action_failed",
        target,
        recovering: action.feedback.action === "retry",
        diagnostics: action.feedback.message,
      });
  }
  const clipPreferenceError =
    appearanceSettings?.snapshot?.state.retentionError ||
    (appearanceSettings?.feedback?.fields?.some(
      (field) => field === "localRetentionMs" || field === "sharingLifetimeMs"
    )
      ? appearanceSettings.feedback.error
      : null);
  if (clipPreferenceError)
    issues.push({
      id: "task:preference:clip-settings",
      scope: "task",
      target: "preference",
      code: "clip-settings",
      recovering: true,
      message:
        "Clip settings need recovery. Check the currently applied values in Settings. Any completed cleanup remains in effect.",
      diagnostics: clipPreferenceError,
    });
  if (
    notificationControls?.state?.displayError ||
    notificationControls?.state?.app === "blocked" ||
    notificationControls?.state?.channel === "blocked" ||
    notificationControls?.error
  )
    issues.push({
      id: "task:notifications:availability",
      scope: "task",
      target: "notifications",
      code: "notifications",
      recovering: true,
      message:
        "Pairing notifications need attention. Open notification settings; pending Requests remain available in Clipp.",
    });
  if (backgroundContinuity?.controlError)
    issues.push({
      id: "task:continuity:control",
      scope: "task",
      target: "continuity",
      code: "continuity",
      recovering: true,
      message: backgroundContinuity.controlError,
    });
  const generalPreferenceError =
    appearanceSettings?.refreshError ||
    (appearanceSettings?.feedback?.fields?.some(
      (field) => field === "theme" || field === "logLevel"
    ) && appearanceSettings.feedback.status !== "applied"
      ? appearanceSettings.feedback.error ||
        "Settings Save could not be confirmed."
      : null);
  if (generalPreferenceError)
    issues.push({
      id: "task:preference:settings",
      scope: "task",
      target: "preference",
      code: "settings",
      recovering: true,
      message:
        "Settings need attention. Check the applied values before saving again.",
      diagnostics: generalPreferenceError,
    });
  const taskIssues = useTaskRecoveryIssues(
    session,
    autoSyncRefreshError || autoSyncFeedback?.error
  );
  issues.push(...taskIssues);
  function issueRetry(issue: RecoveryIssue) {
    if (issue.code === "continuity")
      return onRefreshBackgroundContinuity
        ? async () => {
            await onRefreshBackgroundContinuity();
          }
        : undefined;
    if (issue.id === "clipboard:focus:observation") return onRetryPopupCapture;
    if (issue.code === "settings") return appearanceSettings?.refresh;
    if (issue.code === "clip-settings")
      return appearanceSettings?.snapshot?.state.retentionError
        ? onRetryHistoryCleanup
        : appearanceSettings?.refresh;
    if (issue.code === "initialization_failed") return onRetryInitialization;
    if (issue.scope === "runtime" && issue.code === "unavailable")
      return onRetryRuntime;
    if (issue.id === "history:read:unavailable") return onRetryHistoryRefresh;
    if (issue.code === "history_cleanup_failed") return onRetryHistoryCleanup;
    if (
      identityReady &&
      issue.code === "action_failed" &&
      sessionState.historyActions[issue.target!]?.feedback?.action === "retry"
    )
      return () => session.retryHistoryAction(issue.target!);
    return undefined;
  }
  function issueDismiss(issue: RecoveryIssue) {
    if (issue.scope === "clipboard" && issue.target === "capture")
      return onDismissClipboardHistoryError;
    if (issue.code === "action_failed")
      return () => session.dismissHistoryAction(issue.target!);
    if (issue.scope === "runtime") return onAcknowledgeIdentityRotationNotice;
    return undefined;
  }
  const connectionSummary = projectConnectionSummary({
    devices,
    peers,
    peerConnections,
    connectionStateKnown,
    managedRelayConfigurations,
    managedRelayStates,
  });

  useEffect(() => {
    function handleDocClick(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (
        target?.closest(".time-filter-wrap") ||
        target?.closest(".source-filter-wrap")
      )
        return;
      setTimeMenuOpen(false);
      setSourceMenuOpen(false);
    }
    document.addEventListener("mousedown", handleDocClick);
    return () => document.removeEventListener("mousedown", handleDocClick);
  }, []);

  useEffect(() => {
    function handleResize() {
      const size = hostContentSize(window, document);
      setIsNarrow(size.width <= NARROW_CONTENT_WIDTH);
      const controls = rootRef.current?.querySelectorAll<HTMLElement>(
        ".workspace-topbar, .workspace-controls, .app-notices"
      );
      const controlsHeight = [...(controls ?? [])].reduce(
        (height, element) => height + element.getBoundingClientRect().height,
        0
      );
      setIsCramped(size.height <= Math.max(500, controlsHeight + 160));
    }
    handleResize();
    const observer = new ResizeObserver(handleResize);
    rootRef.current
      ?.querySelectorAll(".workspace-topbar, .workspace-controls, .app-notices")
      .forEach((element) => observer.observe(element));
    window.addEventListener("resize", handleResize);
    window.addEventListener(HOST_GEOMETRY_EVENT, handleResize);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", handleResize);
      window.removeEventListener(HOST_GEOMETRY_EVENT, handleResize);
    };
  }, []);

  useEffect(() => {
    function handleHeight() {
      const shouldCollapse = hostContentSize(window, document).height < 760;
      if (!userToggledFilters) {
        setFiltersCollapsed(shouldCollapse);
      }
    }
    handleHeight();
    window.addEventListener("resize", handleHeight);
    window.addEventListener(HOST_GEOMETRY_EVENT, handleHeight);
    return () => {
      window.removeEventListener("resize", handleHeight);
      window.removeEventListener(HOST_GEOMETRY_EVENT, handleHeight);
    };
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
        (address) =>
          relayConnectionFor(address, relayConnections)?.status === "connected"
      ).length,
    [relayAddresses, relayConnections]
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
        if (sourceFilter === "local" && identity)
          return c.originPeerId === identity.deviceId;
        if (sourceFilter === "remote" && identity)
          return c.originPeerId !== identity.deviceId;
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
    } else if (filterMode === "links") {
      list = list.filter((clip) => clip.type === "url");
    }

    return list;
  }, [
    clips,
    search,
    timeFilter,
    sourceFilter,
    deviceNameMap,
    filterMode,
    pinnedSet,
    identity,
  ]);

  function setPinned(id: string, pinned: boolean) {
    void session.runHistoryAction(`pin:${id}`, async () => {
      try {
        await onSetPinned(id, pinned);
        return null;
      } catch {
        return {
          message:
            "Could not confirm this Clip's pin state. Retry to apply it again.",
          action: "retry",
        };
      }
    });
  }

  function handleDelete(id: string) {
    void session.runHistoryAction(`delete:${id}`, async () => {
      setRemovingIds((previous) => new Set(previous).add(id));
      try {
        await onDeleteClip(id);
        return null;
      } catch {
        return {
          message: "Could not delete this Clip. It is still in your history.",
          action: "retry",
        };
      } finally {
        setRemovingIds((previous) => {
          const next = new Set(previous);
          next.delete(id);
          return next;
        });
      }
    });
  }

  function clearAllHistory() {
    if (
      clearPending ||
      clearRefreshPending ||
      clearNeedsRefresh ||
      historyLoading ||
      historyUnavailable ||
      historyRefreshError
    )
      return;
    setClearPending(true);
    setClearError(null);
    void Promise.resolve()
      .then(() => onClearAll())
      .then(() => {
        setClearNeedsRefresh(false);
        setClearReviewOpen(false);
        session.complete("clear");
      })
      .catch(() => {
        setClearNeedsRefresh(true);
        setClearError(
          "Clear could not be confirmed. History may have changed. Refresh History before trying again."
        );
      })
      .finally(() => setClearPending(false));
  }

  function refreshClearHistory() {
    if (!onRetryHistoryRefresh || clearRefreshPending || clearPending) return;
    setClearRefreshPending(true);
    void Promise.resolve()
      .then(() => onRetryHistoryRefresh())
      .then((confirmed) => {
        if (confirmed) {
          setClearNeedsRefresh(false);
          setClearError(null);
        } else {
          setClearNeedsRefresh(true);
        }
      })
      .catch(() => setClearNeedsRefresh(true))
      .finally(() => setClearRefreshPending(false));
  }

  function toggleFilters() {
    if (session.getSnapshot().destination !== "history") {
      session.update({ destination: "history", focusKey: "history-filters" });
      setFiltersCollapsed(false);
    } else setFiltersCollapsed((v) => !v);
    setUserToggledFilters(true);
  }

  function beginEditLocalName() {
    if (!identityReady || !identity) return;
    session.open({
      kind: "device-name",
      entity: identity.deviceId,
      origin: "rename-local",
    });
    localNameSession.begin(identity.deviceId, identity.deviceName || "");
  }

  useEffect(() => {
    const targetId = localNameSession.getSnapshot().targetId;
    if (!targetId) return;
    if (identity?.deviceId !== targetId)
      localNameSession.removeTarget(targetId);
    else
      localNameSession.authoritativeValue(targetId, identity.deviceName || "");
  }, [identity, localNameSession]);

  useEffect(() => {
    const targetId = aliasSession.getSnapshot().targetId;
    if (!targetId) return;
    const device = devices.find((candidate) => candidate.deviceId === targetId);
    if (!device) {
      aliasSession.removeTarget(targetId);
      session.update({
        taskNotice:
          "This device was removed. Its alias edit cannot be saved. Return to the device list.",
      });
      session.complete("alias", targetId);
    } else
      aliasSession.authoritativeValue(
        targetId,
        device.localAlias || device.deviceName || ""
      );
    aliasSession.retainTargets(devices.map((device) => device.deviceId));
  }, [devices, aliasSession, session]);

  useEffect(() => {
    if (
      editingRelayIndex !== null &&
      editingRelayIndex >= relayAddresses.length
    ) {
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
    const submittedTarget = localNameSession.getSnapshot().targetId;
    void localNameSession
      .save(async (targetId, raw) => {
        if (!identity || identity.deviceId !== targetId || !onRenameIdentity) {
          throw new Error("device_unavailable");
        }
        return onRenameIdentity(raw, targetId);
      })
      .then(() => {
        if (!localNameSession.getSnapshot().targetId)
          session.complete("device-name", submittedTarget ?? undefined);
      });
  }

  function beginEditDeviceName(device: Device) {
    setDeviceCopyFeedback(null);
    session.open({
      kind: "alias",
      entity: device.deviceId,
      origin: `rename:${device.deviceId}`,
    });
    aliasSession.begin(
      device.deviceId,
      device.localAlias || device.deviceName || ""
    );
  }

  function saveDeviceName() {
    if (!identityReady) return;
    const submittedTarget = aliasSession.getSnapshot().targetId;
    void saveNonEmptyAlias(aliasSession, async (targetId, raw) => {
      if (
        !onRenameDevice ||
        !devices.some((candidate) => candidate.deviceId === targetId)
      ) {
        throw new Error("device_unavailable");
      }
      return onRenameDevice(targetId, raw);
    }).then(() => {
      if (!aliasSession.getSnapshot().targetId)
        session.complete("alias", submittedTarget ?? undefined);
    });
  }

  function useReportedDeviceName() {
    if (!identityReady) return;
    const submittedTarget = aliasSession.getSnapshot().targetId;
    void aliasSession
      .save(async (targetId) => {
        if (
          !onRenameDevice ||
          !devices.some((candidate) => candidate.deviceId === targetId)
        ) {
          throw new Error("device_unavailable");
        }
        // An empty value is the existing runtime contract for deleting only
        // this installation's Local Device Alias.
        return onRenameDevice(targetId, "");
      })
      .then(() => {
        if (!aliasSession.getSnapshot().targetId)
          session.complete("alias", submittedTarget ?? undefined);
      });
  }

  async function copyDeviceValue(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setDeviceCopyFeedback(`${label} copied.`);
    } catch {
      setDeviceCopyFeedback(
        `Could not copy ${label.toLowerCase()}. Select and copy it manually.`
      );
    }
  }

  async function revokeDevice(device: Device): Promise<void> {
    if (!identityReady || revocations.current.has(device.deviceId)) return;
    const confirmed = globalThis.confirm(
      `Permanently revoke ${device.displayName || device.deviceName || device.deviceId}? This cannot be undone.`
    );
    if (!confirmed) return;
    const id = device.deviceId,
      token = Symbol(id),
      expectedIdentity = identity?.deviceId;
    revocations.current.set(id, token);
    session.setActivity(`revoke:${id}`, true);
    setRevokingIds([...revocations.current.keys()]);
    const ownsFeedback = () =>
      revocationOwnerAlive.current &&
      revocations.current.get(id) === token &&
      currentIdentity.current === expectedIdentity;
    try {
      await onUnpair(id);
      if (ownsFeedback()) setRevocationError(null);
    } catch {
      if (ownsFeedback())
        setRevocationError({ deviceId: id, identityId: expectedIdentity });
    } finally {
      if (revocations.current.get(id) === token) {
        revocations.current.delete(id);
        session.setActivity(`revoke:${id}`, false);
        if (revocationOwnerAlive.current)
          setRevokingIds([...revocations.current.keys()]);
      }
    }
  }

  function reuseClip(id: string) {
    if (!identityReady) return;
    void session.runHistoryAction(`copy:${id}`, async () => {
      try {
        const outcome = await onReuseClip(id);
        return reuseClipFeedback(
          outcome === "complete" || outcome === "copied-without-clip"
            ? outcome
            : "unconfirmed"
        );
      } catch {
        return reuseClipFeedback("unconfirmed");
      }
    });
  }

  function shareNow() {
    if (!identityReady) return;
    void session.runHistoryAction("send:current", async () => {
      try {
        await onShareNow?.();
        return null;
      } catch (error) {
        return shareNowFailureFeedback(normalizeShareNowFailureCode(error));
      }
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
    const next = relayAddresses.map((address, i) =>
      i === index ? entries[0] : address
    );
    await updateRelayAddresses(next);
  }

  async function removeRelay(index: number) {
    const next = relayAddresses.filter((_, i) => i !== index);
    await updateRelayAddresses(next);
  }

  async function updateLocalRetention(retentionMs: number) {
    if (!onSetLocalRetention) return;
    await session.runHistoryAction("retention:local", async () => {
      try {
        await onSetLocalRetention(retentionMs);
        return null;
      } catch {
        return {
          message: "Could not save the history retention setting.",
          action: "retry",
        };
      }
    });
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

  function handleShowQr() {
    if (!identityReady) return;
    session.open({ kind: "pairing", origin: "pairing-qr" });
    session.open({ kind: "qr", origin: "pairing-qr" });
    setShowNav(false);
    void qrTask.generate(onRequestPairingCode);
  }

  function closeQr() {
    qrTask.close();
    session.complete("qr");
    if (isNarrow) setShowNav(true);
  }
  function dismissNav() {
    session.close();
    setShowNav(false);
  }

  async function submitPairText() {
    if (!identityReady) return;
    await pairingTask.submit(onPairText);
  }

  async function scanPairingCode() {
    if (
      !identityReady ||
      !onScanPairingCode ||
      activeScan.current ||
      pair.pending
    )
      return;
    const task =
      session.getSnapshot().tasks[session.getSnapshot().tasks.length - 1];
    if (task?.kind !== "pairing") return;
    const identityId = currentIdentity.current;
    const capture = new AbortController();
    activeScan.current = capture;
    const unsubscribe = session.subscribe(() => {
      const tasks = session.getSnapshot().tasks;
      if (tasks[tasks.length - 1] !== task) capture.abort();
    });
    setScanError(null);
    setCameraPermission("unknown");
    setIsScanningPairing(true);
    try {
      const scanned = await onScanPairingCode({ signal: capture.signal });
      if (capture.signal.aborted || currentIdentity.current !== identityId)
        return;
      if (scanned.status === "cancelled") return;
      if (scanned.status === "failed") {
        setScanError(scanned.error);
        return;
      }
      const trimmed = scanned.text.trim();
      if (trimmed) {
        pairingTask.change(trimmed);
        await pairingTask.submit(onPairText);
      }
    } catch {
      if (!capture.signal.aborted && currentIdentity.current === identityId)
        setScanError("camera_unavailable");
    } finally {
      unsubscribe();
      if (activeScan.current === capture) {
        activeScan.current = null;
        setIsScanningPairing(false);
      }
    }
  }

  function relaySummaryLabel() {
    if (relayAddresses.length === 0) return "No relays";
    if (connectedRelayCount > 0) {
      return `${connectedRelayCount}/${relayAddresses.length} connected`;
    }
    return relayAddresses.length === 1
      ? "1 configured"
      : `${relayAddresses.length} configured`;
  }

  function renderRelayDraftCard() {
    return (
      <div className="relay-card relay-card-editing">
        <div className="peer-avatar relay-avatar unknown">
          <Icon name="network" />
        </div>
        <div className="peer-meta">
          <input
            className="relay-address-input"
            aria-label="New relay address"
            value={relayDraft}
            onChange={(e) => setRelayDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void saveNewRelay();
              if (e.key === "Escape") cancelRelayEdit();
            }}
            placeholder="/dns4/relay.example.com/tcp/443/wss/p2p/..."
            autoFocus
          />
          {relayError && addingRelay && (
            <div className="relay-error">{relayError}</div>
          )}
        </div>
        <div className="peer-actions">
          <button
            className="text-button"
            title="Add relay"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => void saveNewRelay()}
            disabled={relaySaving}
          >
            Add relay
          </button>
          <button
            className="icon-button"
            aria-label="Cancel"
            title="Cancel"
            onMouseDown={(e) => e.preventDefault()}
            onClick={cancelRelayEdit}
            disabled={relaySaving}
          >
            <Icon name="close" />
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
          <Icon name="network" />
        </div>
        <div className="peer-meta">
          {editingThisRelay ? (
            <>
              <input
                className="relay-address-input"
                aria-label="Relay address"
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
              <MiddleEllipsisText
                className="peer-name"
                text={relayDisplayName(address, index)}
              />
              <MiddleEllipsisText
                className="peer-sub"
                text={address}
                max={isNarrow ? 24 : 34}
              />
              <div
                className={`relay-status ${status.kind}`}
                title={status.title}
              >
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
                className="text-button"
                title="Save relay address"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void saveRelayRename(index)}
                disabled={relaySaving}
              >
                Save
              </button>
              <button
                className="icon-button"
                aria-label="Cancel"
                title="Cancel"
                onMouseDown={(e) => e.preventDefault()}
                onClick={cancelRelayEdit}
                disabled={relaySaving}
              >
                <Icon name="close" />
              </button>
            </>
          ) : (
            <>
              <button
                className="icon-button"
                aria-label="Rename relay"
                title="Rename relay"
                onClick={() => beginRenameRelay(index, address)}
                disabled={relaySaving}
              >
                <Icon name="edit" />
              </button>
              <button
                className="text-button"
                title="Remove relay"
                onClick={() => void removeRelay(index)}
                disabled={relaySaving}
              >
                Remove relay
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  function renderRelaysSection() {
    if (onMutateManagedRelay)
      return (
        <ManagedRelaySettings
          configurations={managedRelayConfigurations}
          states={managedRelayStates}
          session={session}
          taskPresentation
          onMutate={onMutateManagedRelay}
          onRefresh={onRefreshManagedRelays}
          onLogin={onManagedRelayLogin}
          onManageAccount={onManagedRelayAccount}
          onRetry={onManagedRelayRetry}
        />
      );
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
              <Icon
                name="chevron"
                style={{ transform: relaysOpen ? "rotate(180deg)" : undefined }}
              />
              <span className="relay-accordion-title">Relays</span>
              <span className="relay-summary-text">{relaySummaryLabel()}</span>
            </button>
            <button
              className="text-button"
              title="Add relay"
              onClick={beginAddRelay}
              disabled={relaySaving}
            >
              Add relay
            </button>
          </div>
          {relaysOpen && (
            <div className="relay-list">
              {relayAddresses.length === 0 && !addingRelay && (
                <div className="relay-empty">No relays configured.</div>
              )}
              {relayError && !addingRelay && editingRelayIndex === null && (
                <div className="relay-error relay-section-error">
                  {relayError}
                </div>
              )}
              {relayAddresses.map((address, index) =>
                renderRelayCard(address, index)
              )}
              {addingRelay && renderRelayDraftCard()}
            </div>
          )}
        </div>
      </>
    );
  }

  function renderDestination() {
    return (
      <>
        {sessionState.taskNotice && (
          <p role="alert">
            {sessionState.taskNotice}
            <button
              type="button"
              onClick={() => session.update({ taskNotice: null })}
            >
              Dismiss
            </button>
          </p>
        )}
        {sessionState.destination === "devices" && (
          <>
            <div className="peer-list">
              {identity && (
                <>
                  <div className="nav-section-label">This device</div>
                  <div className="peer-item active">
                    <div className="peer-avatar" style={{ minWidth: 32 }}>
                      L
                    </div>
                    <div className="peer-meta">
                      <div className="peer-name-row">
                        <MiddleEllipsisText
                          className="peer-name"
                          text={identity.deviceName || "Local device"}
                        />
                        <button
                          className="icon-button"
                          data-session-focus="rename-local"
                          aria-label="Rename this device"
                          disabled={!identityReady}
                          onClick={beginEditLocalName}
                        >
                          <Icon name="edit" />
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
                        <Icon name="computer" />
                      </div>
                    </div>
                  </div>
                  <button
                    className="text-button"
                    style={{
                      marginTop: 4,
                      marginLeft: 6,
                      alignSelf: "flex-start",
                    }}
                    data-session-focus="pairing-qr"
                    onClick={handleShowQr}
                  >
                    <Icon name="qr" />
                    Show my QR
                  </button>
                </>
              )}
            </div>
          </>
        )}
        {sessionState.destination === "requests" && (
          <>
            <div className="section-divider"></div>
            <div>
              <div className="nav-section-label" style={{ marginTop: 14 }}>
                Pending requests
              </div>
              <PairingStatus
                outcomes={pairingOutcomes}
                waiting={waiting}
                errors={pairingErrors}
                devices={devices}
                onDismiss={onDismissPairingOutcome}
              />
              {Object.entries(approvalFeedback).map(([id, message]) => (
                <p key={id} role="status" style={{ overflowWrap: "anywhere" }}>
                  {message}
                </p>
              ))}
              {requestsLoading && <p role="status">Loading Requests…</p>}
              {!requestsLoading && (requestsUnavailable || !identityReady) && (
                <>
                  <p role="alert">
                    {requestsUnavailable
                      ? "Requests are unavailable. Retry to refresh the current list."
                      : "Requests are unavailable until this installation is ready."}
                  </p>
                  {(onRetryRequests ||
                    onRetryInitialization ||
                    onRetryRuntime) && (
                    <button
                      type="button"
                      disabled={
                        sessionState.recoveryAttempts["requests:read"]?.pending
                      }
                      onClick={() =>
                        void session.retryRecovery(
                          "requests:read",
                          (onRetryRequests ||
                            onRetryInitialization ||
                            onRetryRuntime)!
                        )
                      }
                    >
                      Retry Requests
                    </button>
                  )}
                  {sessionState.recoveryAttempts["requests:read"]?.error && (
                    <p role="status">
                      Requests refresh could not be confirmed. Retry again.
                    </p>
                  )}
                </>
              )}
              {!requestsLoading &&
                !requestsUnavailable &&
                identityReady &&
                pending.length === 0 && <p>No pending requests.</p>}
              <div className="pending-list">
                {pending.map((req) => {
                  return (
                    <div
                      key={req.deviceId}
                      className="pending-card"
                      tabIndex={-1}
                      data-session-focus={`request:${req.deviceId}`}
                    >
                      <div className="pending-card-header">
                        <div className="peer-avatar">
                          {req.deviceName?.[0] || "D"}
                        </div>
                        <div className="peer-meta">
                          <MiddleEllipsisText
                            className="peer-name"
                            text={req.deviceName}
                          />
                          <span className="peer-sub" title={req.deviceId}>
                            {req.deviceId}
                          </span>
                        </div>
                      </div>
                      <div className="pending-actions">
                        <button
                          className="primary-button compact-button"
                          disabled={
                            !identityReady ||
                            requestsLoading ||
                            requestsUnavailable ||
                            approvalsPending.includes(req.deviceId)
                          }
                          onClick={() => void decideRequest(req, true)}
                        >
                          Accept
                        </button>
                        <button
                          className="text-button"
                          disabled={
                            !identityReady ||
                            requestsLoading ||
                            requestsUnavailable ||
                            approvalsPending.includes(req.deviceId)
                          }
                          onClick={() => void decideRequest(req, false)}
                        >
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

        {sessionState.destination === "devices" && (
          <>
            <button
              type="button"
              className="primary-button"
              disabled={!identityReady}
              data-session-focus="pairing-start"
              onClick={() =>
                session.open({ kind: "pairing", origin: "pairing-start" })
              }
            >
              Pair this device
            </button>

            <div>
              <div className="nav-section-label" style={{ marginTop: 14 }}>
                Trusted Devices
              </div>
              <div
                style={{
                  marginTop: 8,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                {devices.length === 0 && (
                  <div className="content-subtitle">No devices yet.</div>
                )}
                {revocationError &&
                  revocationError.identityId === identity?.deviceId && (
                    <div className="content-subtitle" role="alert">
                      Device revocation could not be confirmed. Check the
                      current device list.
                      <button
                        className="text-button"
                        disabled={
                          !identityReady ||
                          revokingIds.includes(revocationError.deviceId) ||
                          !devices.some(
                            (device) =>
                              device.deviceId === revocationError.deviceId
                          )
                        }
                        onClick={() => {
                          const device = devices.find(
                            (candidate) =>
                              candidate.deviceId === revocationError.deviceId
                          );
                          if (device) void revokeDevice(device);
                        }}
                      >
                        Retry
                      </button>
                    </div>
                  )}
                {devices.map((dev) => {
                  const connectionInfo = peerConnectionMap.get(dev.deviceId);
                  const isOnline =
                    connectionStateKnown && connectedPeerSet.has(dev.deviceId);
                  const connectionStatus = connectionStatusFor(
                    connectionInfo,
                    isOnline,
                    connectionStateKnown
                  );
                  return (
                    <div
                      key={dev.deviceId}
                      className="peer-item"
                      title={connectionStatus.title}
                      style={{ border: "1px solid rgba(255,255,255,0.06)" }}
                    >
                      <div
                        className={`peer-avatar ${isOnline ? "online" : "offline"} ${connectionStatus.kind}`}
                      >
                        {(dev.displayName || dev.deviceName)?.[0] || "D"}
                      </div>
                      <div className="peer-meta">
                        <MiddleEllipsisText
                          className="peer-name"
                          text={dev.displayName || dev.deviceName}
                        />
                        <MiddleEllipsisText
                          className="peer-sub"
                          text={dev.deviceId}
                          max={isNarrow ? 22 : 32}
                        />
                        <span className="peer-sub">
                          {connectionStatus.title}
                        </span>
                      </div>
                      <div className="peer-actions">
                        <div className="peer-indicator">
                          <Icon name="device" />
                        </div>
                        {onRenameDevice && (
                          <button
                            className="icon-button"
                            data-session-focus={`rename:${dev.deviceId}`}
                            aria-label="Edit Local Device Alias"
                            disabled={!identityReady}
                            onClick={() => beginEditDeviceName(dev)}
                          >
                            <Icon name="edit" />
                          </button>
                        )}
                        <button
                          className="text-button"
                          title="Revoke this device"
                          disabled={
                            !identityReady || revokingIds.includes(dev.deviceId)
                          }
                          onClick={() => void revokeDevice(dev)}
                        >
                          Revoke device
                        </button>
                        {revokingIds.includes(dev.deviceId) && (
                          <span role="status">Revoking this device…</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
        {sessionState.destination === "settings" &&
          (() => {
            const category =
              sessionState.settingsCategory === "relays" ||
              sessionState.settingsCategory === "connections"
                ? "connections"
                : sessionState.settingsCategory === "advanced"
                  ? "advanced"
                  : "general";
            return (
              <>
                <nav
                  className="settings-categories"
                  aria-label="Settings categories"
                >
                  {(["general", "connections", "advanced"] as const).map(
                    (item) => (
                      <button
                        key={item}
                        type="button"
                        aria-current={category === item ? "page" : undefined}
                        data-session-focus={`settings-category:${item}`}
                        onClick={() =>
                          session.update({ settingsCategory: item })
                        }
                      >
                        {item[0].toUpperCase() + item.slice(1)}
                      </button>
                    )
                  )}
                </nav>
                <section
                  data-settings-panel="general"
                  hidden={category !== "general"}
                  aria-label="General settings"
                >
                  <h3 tabIndex={-1} data-session-focus="settings:general">
                    General
                  </h3>
                  {appearanceSettings && (
                    <div tabIndex={-1} data-session-focus="settings:appearance">
                      <h3>Appearance</h3>
                      <Appearance settings={appearanceSettings} />
                    </div>
                  )}
                  {onSetAutoSync && (
                    <div className="relay-settings">
                      <label className="peer-sub" htmlFor="auto-sync">
                        Auto Sync
                      </label>
                      <select
                        id="auto-sync"
                        value={
                          autoSyncKnown
                            ? autoSync
                              ? "enabled"
                              : "disabled"
                            : ""
                        }
                        disabled={
                          !autoSyncKnown ||
                          autoSyncLoading ||
                          autoSyncRecoveryRequired ||
                          sessionState.autoSync.recoveryRequired
                        }
                        aria-disabled={
                          autoSyncPending ||
                          sessionState.autoSync.pending ||
                          undefined
                        }
                        aria-busy={
                          autoSyncPending ||
                          sessionState.autoSync.pending ||
                          undefined
                        }
                        onChange={(event) => {
                          if (
                            autoSyncPending ||
                            sessionState.autoSync.pending
                          ) {
                            event.currentTarget.value = autoSyncKnown
                              ? autoSync
                                ? "enabled"
                                : "disabled"
                              : "";
                            return;
                          }
                          void session.saveAutoSync(() =>
                            onSetAutoSync(event.target.value === "enabled")
                          );
                        }}
                      >
                        {!autoSyncKnown && <option value="">Unknown</option>}
                        <option value="enabled">Enabled</option>
                        <option value="disabled">
                          Disabled — keep Clips local
                        </option>
                      </select>
                      {autoSyncLoading && (
                        <p role="status">Loading Auto Sync…</p>
                      )}
                      {(autoSyncPending || sessionState.autoSync.pending) && (
                        <p role="status">Saving Auto Sync…</p>
                      )}
                      <PreferenceRefreshNotice
                        subject="Auto Sync"
                        error={autoSyncRefreshError}
                        onRetry={
                          onRetryAutoSync
                            ? async () => {
                                await onRetryAutoSync();
                              }
                            : undefined
                        }
                      />
                      {sessionState.autoSync.feedback && (
                        <p
                          role={
                            sessionState.autoSync.feedback.status === "applied"
                              ? "status"
                              : "alert"
                          }
                        >
                          {sessionState.autoSync.feedback.status === "applied"
                            ? "Auto Sync saved."
                            : sessionState.autoSync.feedback.status ===
                                "rejected"
                              ? "Auto Sync was not saved."
                              : sessionState.autoSync.feedback.status ===
                                  "partial"
                                ? "Auto Sync was applied, but current state refresh was not confirmed."
                                : "Auto Sync Save could not be confirmed."}
                          {sessionState.autoSync.feedback.error &&
                            ` ${sessionState.autoSync.feedback.error}`}
                          {sessionState.autoSync.refreshed
                            ? " Current setting refreshed."
                            : sessionState.autoSync.recoveryRequired
                              ? " Refresh the current setting before trying again."
                              : ""}
                        </p>
                      )}
                      {sessionState.autoSync.recoveryRequired &&
                        onRetryAutoSync && (
                          <button
                            type="button"
                            disabled={sessionState.autoSync.pending}
                            onClick={() =>
                              void session.refreshAutoSync(onRetryAutoSync)
                            }
                          >
                            Refresh Auto Sync
                          </button>
                        )}
                      <PreferenceSaveFeedback
                        feedback={autoSyncFeedback}
                        subject="Auto Sync"
                        refreshError={autoSyncRefreshError}
                        refreshing={autoSyncRefreshing}
                      />
                    </div>
                  )}

                  {appearanceSettings && (
                    <div tabIndex={-1} data-session-focus="settings:clips">
                      <ClipSettings
                        section="retention"
                        settings={appearanceSettings}
                        onRetryRetention={
                          onRetryHistoryCleanup
                            ? async () => {
                                await onRetryHistoryCleanup();
                              }
                            : undefined
                        }
                      />
                    </div>
                  )}
                  {!appearanceSettings && onSetLocalRetention && (
                    <div className="relay-settings">
                      <label className="peer-sub" htmlFor="history-retention">
                        Keep unpinned history
                      </label>
                      <select
                        id="history-retention"
                        value={localRetentionMs}
                        onChange={(event) =>
                          void updateLocalRetention(Number(event.target.value))
                        }
                      >
                        {![0, 7, 30, 90, 365]
                          .map((days) => days * 86400000)
                          .includes(localRetentionMs) && (
                          <option value={localRetentionMs}>
                            Custom ({localRetentionMs} ms)
                          </option>
                        )}
                        <option value={0}>
                          Remove unpinned history immediately
                        </option>
                        <option value={7 * 24 * 60 * 60 * 1000}>7 days</option>
                        <option value={30 * 24 * 60 * 60 * 1000}>
                          30 days
                        </option>
                        <option value={90 * 24 * 60 * 60 * 1000}>
                          90 days
                        </option>
                        <option value={365 * 24 * 60 * 60 * 1000}>
                          1 year
                        </option>
                      </select>
                    </div>
                  )}
                </section>
                <section
                  data-settings-panel="connections"
                  hidden={category !== "connections"}
                  aria-label="Connections settings"
                >
                  <h3>Connections</h3>
                  <div tabIndex={-1} data-session-focus="settings:relays">
                    <h3>Relays</h3>
                    {renderRelaysSection()}
                  </div>
                  {backgroundContinuity && onSetBackgroundContinuity && (
                    <BackgroundContinuityControls
                      state={backgroundContinuity}
                      setEnabled={onSetBackgroundContinuity}
                      setAutoSync={(enabled) =>
                        session.saveAutoSync(() => onSetAutoSync?.(enabled))
                      }
                      autoSyncPending={
                        autoSyncPending || sessionState.autoSync.pending
                      }
                      autoSyncRecoveryRequired={
                        sessionState.autoSync.recoveryRequired
                      }
                      refresh={onRefreshBackgroundContinuity}
                      refreshAutoSync={
                        onRetryAutoSync
                          ? () => session.refreshAutoSync(onRetryAutoSync)
                          : undefined
                      }
                      openNotificationSettings={
                        onOpenBackgroundNotificationSettings
                      }
                      help={() =>
                        session.open({
                          kind: "issues",
                          entity: "continuity",
                          origin: "continuity-help",
                        })
                      }
                    />
                  )}{" "}
                  {notificationControls && (
                    <NotificationSettings controls={notificationControls} />
                  )}
                </section>
                <section
                  data-settings-panel="advanced"
                  hidden={category !== "advanced"}
                  aria-label="Advanced settings"
                >
                  <h3>Advanced</h3>
                  {appearanceSettings && (
                    <ClipSettings
                      section="lifetime"
                      settings={appearanceSettings}
                    />
                  )}
                  <div className="relay-settings">
                    <h3>Local history</h3>
                    <button
                      type="button"
                      className="text-button labelled-control"
                      data-session-focus="settings-clear"
                      onClick={() => {
                        setClearError(null);
                        setClearReviewOpen(true);
                        session.open({
                          kind: "clear",
                          origin: "settings-clear",
                        });
                      }}
                      disabled={
                        historyLoading ||
                        historyUnavailable ||
                        Boolean(historyRefreshError)
                      }
                    >
                      Clear all local history
                    </button>
                  </div>
                  <ManualIdentityResetSettings
                    peerId={identity?.deviceId}
                    state={identityResetState}
                    available={manualIdentityResetAvailable}
                    actions={identityResetActions}
                    onPair={
                      identityReady ? onPairAfterIdentityReset : undefined
                    }
                    onCopyFormerPeerId={onCopyFormerIdentity}
                    onAccepted={() => session.rotateIdentity()}
                  />
                  {appearanceSettings && (
                    <div className="relay-settings">
                      <label>
                        Log level
                        <select
                          aria-label="Log level"
                          value={
                            appearanceSettings.snapshot?.state.logLevel ?? ""
                          }
                          disabled={
                            !appearanceSettings.snapshot ||
                            appearanceSettings.recoveryRequired
                          }
                          aria-disabled={
                            appearanceSettings.pending || undefined
                          }
                          aria-busy={appearanceSettings.pending || undefined}
                          onChange={(event) => {
                            if (appearanceSettings.pending) {
                              event.currentTarget.value =
                                appearanceSettings.snapshot?.state.logLevel ??
                                "";
                              return;
                            }
                            void appearanceSettings.save({
                              logLevel: event.target.value as
                                "debug" | "info" | "warn" | "error",
                            });
                          }}
                        >
                          {!appearanceSettings.snapshot && (
                            <option value="">Unknown</option>
                          )}
                          {(["debug", "info", "warn", "error"] as const).map(
                            (level) => (
                              <option key={level} value={level}>
                                {level}
                              </option>
                            )
                          )}
                        </select>
                      </label>
                      <PreferenceRefreshNotice
                        subject="General settings"
                        error={appearanceSettings.refreshError}
                        onRetry={appearanceSettings.refresh}
                      />
                      <PreferenceSaveFeedback
                        subject="Log level"
                        feedback={
                          appearanceSettings.feedback?.fields?.includes(
                            "logLevel"
                          )
                            ? appearanceSettings.feedback
                            : null
                        }
                        refreshError={appearanceSettings.refreshError}
                        refreshing={appearanceSettings.refreshing}
                      />
                      {appearanceSettings.recoveryRequired && (
                        <button
                          type="button"
                          onClick={() => void appearanceSettings.refresh()}
                        >
                          Refresh General settings
                        </button>
                      )}
                    </div>
                  )}
                </section>
              </>
            );
          })()}
      </>
    );
  }

  function renderNavigation() {
    const openDestination = (
      destination: "history" | "devices" | "requests" | "settings",
      filterMode: "all" | "pinned" | "links" = "all"
    ) => {
      session.close();
      session.update({
        destination,
        filterMode,
        showNav: false,
        focusKey: isNarrow
          ? "nav-toggle"
          : filterMode === "all"
            ? `destination:${destination}`
            : `destination:${destination}:${filterMode}`,
      });
    };
    return (
      <nav
        className="workspace-navigation"
        id="workspace-navigation"
        aria-label="Clipp destinations"
      >
        {(
          [
            { key: "history", label: "History", icon: "clipboard" },
            { key: "pinned", label: "Pinned", icon: "pin" },
            { key: "links", label: "Links", icon: "links" },
            { key: "devices", label: "Devices", icon: "computer" },
            { key: "requests", label: "Requests", icon: "requests" },
            { key: "settings", label: "Settings", icon: "settings" },
          ] as const
        ).map(({ key, label, icon }) => {
          const active =
            (key === "history" &&
              sessionState.destination === "history" &&
              filterMode === "all") ||
            (key === "pinned" &&
              sessionState.destination === "history" &&
              filterMode === "pinned") ||
            (key === "links" &&
              sessionState.destination === "history" &&
              filterMode === "links") ||
            (key === "devices" && sessionState.destination === "devices") ||
            (key === "requests" && sessionState.destination === "requests") ||
            (key === "settings" && sessionState.destination === "settings");
          return (
            <button
              type="button"
              key={key}
              aria-current={active ? "page" : undefined}
              data-session-focus={
                key === "history"
                  ? "destination:history"
                  : key === "pinned" || key === "links"
                    ? `destination:history:${key}`
                    : `destination:${key}`
              }
              onClick={() => {
                if (key === "pinned" || key === "links") {
                  openDestination("history", key);
                } else {
                  openDestination(key);
                }
              }}
            >
              <Icon name={icon} />
              <span>{label}</span>
              {key === "requests" &&
                (requestsLoading ? (
                  " (loading)"
                ) : requestsUnavailable ? (
                  " (unavailable)"
                ) : pending.length + waiting.length > 0 ? (
                  <span aria-label="active requests">
                    {" "}
                    ({pending.length + waiting.length})
                  </span>
                ) : null)}
            </button>
          );
        })}
      </nav>
    );
  }

  const detailsClip =
    activeTask?.kind === "clip-details"
      ? clips.find((clip) => clip.id === activeTask.entity)
      : undefined;

  return (
    <div
      ref={rootRef}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || event.defaultPrevented) return;
        if (event.repeat) {
          event.preventDefault();
          return;
        }
        if (timeMenuOpen || sourceMenuOpen) {
          event.preventDefault();
          setTimeMenuOpen(false);
          setSourceMenuOpen(false);
          return;
        }
        if (
          session.getSnapshot().tasks.length ||
          session.getSnapshot().notificationReturn
        ) {
          event.preventDefault();
          session.back();
        } else if (showNav) {
          event.preventDefault();
          dismissNav();
        }
      }}
      onFocusCapture={(event) => {
        const key = (event.target as HTMLElement).dataset.sessionFocus;
        if (key) session.update({ focusKey: key });
      }}
      onScrollCapture={(event) => {
        const target = event.target as HTMLElement;
        const key = target.dataset.sessionScroll;
        if (key) {
          const context = session.getSnapshot();
          let historyAnchor = context.historyAnchor;
          if (
            context.destination === "history" &&
            !context.tasks.length &&
            (key === "workspace" || key === "history")
          ) {
            const top = target.getBoundingClientRect().top;
            const clip = [
              ...(rootRef.current?.querySelectorAll<HTMLElement>(
                "[data-clip-id]"
              ) ?? []),
            ].find((element) => element.getBoundingClientRect().bottom > top);
            if (clip)
              historyAnchor = {
                clipId: clip.dataset.clipId!,
                offset: clip.getBoundingClientRect().top - top,
              };
          }
          session.update({
            scroll: {
              ...context.scroll,
              [target === rootRef.current
                ? `${key}:${context.destination}`
                : key]: target.scrollTop,
            },
            historyAnchor,
          });
        }
      }}
      data-session-scroll="workspace"
      className={`app-shell ${isNarrow ? "workspace-narrow" : "workspace-wide"} ${isCramped ? "workspace-cramped" : ""} ${showNav ? "nav-open" : ""} ${initializationError ? "app-shell-with-initialization-error" : ""}`}
    >
      <aside
        className="workspace-sidebar"
        inert={isNarrow && !showNav}
        aria-hidden={isNarrow && !showNav}
      >
        <div className="workspace-brand">
          <span className="app-logo">
            <img src={clippPurpleIcon} alt="" draggable={false} />
          </span>
          <span>Clipp</span>
        </div>
        {renderNavigation()}
        <div className="workspace-sidebar-footer">
          <button
            className="text-button auto-sync-link"
            type="button"
            onClick={() => {
              session.close();
              session.update({
                destination: "settings",
                settingsCategory: "general",
                showNav: false,
              });
            }}
          >
            <span>Auto Sync</span>
            <span className="auto-sync-value">
              {autoSyncKnown ? (autoSync ? "On" : "Off") : "Unknown"}
            </span>
          </button>
        </div>
      </aside>
      {isNarrow && showNav && (
        <button
          type="button"
          className="workspace-navigation-scrim"
          aria-label="Close navigation"
          onClick={() =>
            session.update({ showNav: false, focusKey: "nav-toggle" })
          }
        />
      )}
      <div className="workspace-content">
        <header className="workspace-topbar">
          <button
            type="button"
            className="icon-button navigation-toggle"
            aria-label={showNav ? "Close navigation" : "Open navigation"}
            aria-controls="workspace-navigation"
            aria-expanded={showNav}
            data-session-focus="nav-toggle"
            onClick={() =>
              session.update({
                showNav: !showNav,
                focusKey: "nav-toggle",
              })
            }
          >
            <Icon name={showNav ? "close" : "menu"} />
          </button>
          <div className="workspace-current-title">
            {sessionState.destination === "history"
              ? filterMode === "pinned"
                ? "Pinned"
                : filterMode === "links"
                  ? "Links"
                  : "History"
              : sessionState.destination[0].toUpperCase() +
                sessionState.destination.slice(1)}
          </div>
          <ConnectionStatusButton
            summary={connectionSummary}
            session={session}
          />
        </header>
        <div className="workspace-controls">
          <div className="search-field">
            <Icon name="search" />
            <input
              aria-label="Search history"
              data-session-focus="history-query"
              placeholder="Search history: text, URL, device…"
              value={search}
              onChange={(e) =>
                session.update({
                  search: e.target.value,
                  destination: "history",
                })
              }
            />
            {search && (
              <button
                type="button"
                className="icon-button"
                aria-label="Clear search"
                onClick={() => setSearch("")}
              >
                <Icon name="close" />
              </button>
            )}
          </div>

          <button
            type="button"
            className="text-button"
            aria-expanded={!filtersCollapsed}
            data-session-focus="history-filters"
            onClick={toggleFilters}
          >
            <Icon name="filters" />
            Filters
          </button>
          {onShareNow && (
            <div className="send-control">
              <IconButton
                icon="send"
                label="Share current clipboard now"
                onClick={shareNow}
                disabled={
                  !identityReady ||
                  sessionState.historyActions["send:current"]?.pending
                }
                aria-describedby="send-clipboard-hint"
              />
              <span id="send-clipboard-hint" className="control-hint">
                Sends your current system clipboard
              </span>
            </div>
          )}
        </div>

        <div className="app-notices" role="status">
          {issues.length > 0 && (
            <>
              <button
                type="button"
                className="issue-summary"
                data-session-focus="issues-summary"
                onClick={() =>
                  session.open({ kind: "issues", origin: "issues-summary" })
                }
              >
                {issues.length}{" "}
                {issues.length === 1 ? "issue needs" : "issues need"} attention
              </button>
            </>
          )}
        </div>
        {activeTask?.kind === "connections" && (
          <ConnectionsPanel
            summary={connectionSummary}
            session={session}
            autoSync={autoSyncKnown ? autoSync : null}
          />
        )}
        {activeTask?.kind === "issues" && (
          <RecoveryIssues
            issues={issues}
            session={session}
            title={
              activeTask?.entity === "continuity"
                ? "Background help and recovery"
                : undefined
            }
            details={
              activeTask?.entity === "continuity" && backgroundContinuity ? (
                <BackgroundContinuityHelp
                  state={backgroundContinuity}
                  exportDiagnostics={onExportBackgroundContinuityDiagnostics}
                />
              ) : undefined
            }
            retry={issueRetry}
            dismiss={issueDismiss}
            route={(issue) => {
              session.close();
              if (issue.scope === "task") {
                if (issue.code === "device-name") beginEditLocalName();
                if (issue.code === "alias") {
                  const device = devices.find(
                    (device) => device.deviceId === issue.target
                  );
                  if (device) beginEditDeviceName(device);
                }
                if (issue.code === "pairing")
                  session.open({ kind: "pairing", origin: "pairing-paste" });
                if (
                  issue.code === "relay-edit" ||
                  issue.code === "relay-action"
                ) {
                  const config = managedRelayConfigurations.find(
                    (config) => config.key === issue.target
                  );
                  if (config || issue.target === "new") {
                    session.open({
                      kind: "relay",
                      entity: issue.target,
                      origin: `relay:${issue.target}`,
                    });
                    session.relay.begin(config);
                  }
                }
              }
              session.update({
                destination:
                  issue.scope === "pairing"
                    ? "requests"
                    : issue.scope === "relay" ||
                        (issue.scope === "task" &&
                          [
                            "relay-edit",
                            "relay-action",
                            "relay",
                            "auto-sync",
                            "clip-settings",
                            "settings",
                            "continuity",
                            "notifications",
                          ].includes(issue.code))
                      ? "settings"
                      : issue.scope === "task" &&
                          ["alias", "device-name", "pairing"].includes(
                            issue.code
                          )
                        ? "devices"
                        : "history",
                ...(issue.scope === "relay" ||
                (issue.scope === "task" &&
                  [
                    "relay-edit",
                    "relay-action",
                    "relay",
                    "continuity",
                    "notifications",
                  ].includes(issue.code))
                  ? { settingsCategory: "connections" as const }
                  : issue.scope === "task" &&
                      ["auto-sync", "clip-settings", "settings"].includes(
                        issue.code
                      )
                    ? {
                        settingsCategory:
                          issue.code === "clip-settings" &&
                          !appearanceSettings?.snapshot?.state.retentionError &&
                          appearanceSettings?.feedback?.fields?.includes(
                            "sharingLifetimeMs"
                          ) &&
                          !appearanceSettings.feedback.fields.includes(
                            "localRetentionMs"
                          )
                            ? ("advanced" as const)
                            : issue.code === "settings" &&
                                !appearanceSettings?.refreshError &&
                                appearanceSettings?.feedback?.fields?.includes(
                                  "logLevel"
                                ) &&
                                !appearanceSettings.feedback.fields.includes(
                                  "theme"
                                )
                              ? ("advanced" as const)
                              : ("general" as const),
                      }
                    : {}),
                showNav: issue.scope !== "history",
              });
            }}
          />
        )}
        {sessionState.notificationReturn && !sessionState.tasks.length && (
          <button
            className="text-button"
            type="button"
            onClick={() => session.back()}
          >
            Back to previous task
          </button>
        )}
        <main
          className="app-main"
          tabIndex={-1}
          data-session-focus="workspace"
          style={{ gridTemplateColumns: isNarrow ? "1fr" : undefined }}
        >
          {sessionState.destination !== "history" && (
            <section
              className={`surface destination-pane ${sessionState.destination === "settings" ? "settings-pane" : ""}`}
              data-session-scroll={sessionState.destination}
            >
              <h1>
                {sessionState.destination[0].toUpperCase() +
                  sessionState.destination.slice(1)}
              </h1>
              {renderDestination()}
            </section>
          )}
          <section
            className="surface content-pane"
            data-session-scroll="history"
            hidden={sessionState.destination !== "history"}
          >
            <header className="content-header">
              <div className="content-title-block">
                <div className="content-title">History</div>
              </div>
            </header>

            {!filtersCollapsed && (
              <div
                className="content-filters"
                role="group"
                aria-label="History filters"
              >
                <div className="segmented">
                  <button
                    className={filterMode === "all" ? "active" : ""}
                    aria-pressed={filterMode === "all"}
                    onClick={() => setFilterMode("all")}
                  >
                    All
                  </button>
                  <button
                    className={filterMode === "pinned" ? "active" : ""}
                    aria-pressed={filterMode === "pinned"}
                    onClick={() => setFilterMode("pinned")}
                  >
                    Pinned
                  </button>
                  <button
                    className={filterMode === "links" ? "active" : ""}
                    aria-pressed={filterMode === "links"}
                    onClick={() => setFilterMode("links")}
                  >
                    Links
                  </button>
                </div>

                <div className="time-filter-wrap">
                  <button
                    className="text-button"
                    onClick={() => setTimeMenuOpen((v) => !v)}
                  >
                    <Icon name="clock" />
                    <span className="filter-button-label">
                      {timeOptions.find((t) => t.value === timeFilter)?.label ||
                        "All time"}
                    </span>
                    <Icon name="chevron" />
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
                  <button
                    className="text-button"
                    onClick={() => setSourceMenuOpen((v) => !v)}
                  >
                    <Icon name="filters" />
                    <span className="filter-button-label">
                      {sourceFilterLabel(sourceFilter)}
                    </span>
                    <Icon name="chevron" />
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
                          <span className="filter-menu-label">
                            {sourceOptionLabel(src)}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {historyLoading && <p role="status">Loading History…</p>}
            {(historyUnavailable || historyRefreshError) && (
              <div className="initialization-error" role="alert">
                <span>
                  {historyUnavailable
                    ? "History unavailable."
                    : "History refresh failed. Showing last known Clips."}
                </span>
                {onRetryHistoryRefresh && (
                  <button
                    type="button"
                    onClick={() =>
                      void session.retryRecovery(
                        "history:read:unavailable",
                        onRetryHistoryRefresh
                      )
                    }
                  >
                    Retry
                  </button>
                )}
              </div>
            )}
            {Object.entries(sessionState.historyActions).map(
              ([target, action]) =>
                action.feedback && (
                  <div
                    key={target}
                    className="history-action-error"
                    role="status"
                  >
                    <span>{action.feedback.message}</span>
                    <button
                      type="button"
                      disabled={
                        action.pending ||
                        (!identityReady && action.feedback.action === "retry")
                      }
                      onClick={() =>
                        action.feedback?.action === "retry"
                          ? void session.retryHistoryAction(target)
                          : session.dismissHistoryAction(target)
                      }
                    >
                      {action.pending
                        ? "Retrying…"
                        : action.feedback.action === "retry"
                          ? "Retry"
                          : "Dismiss"}
                    </button>
                  </div>
                )
            )}
            <div className="history-grid" data-session-scroll="history-clips">
              {!historyLoading &&
                !historyUnavailable &&
                filteredClips.length === 0 && (
                  <article className="history-card history-empty">
                    <div className="history-body">
                      <div className="history-text">
                        {clips.length === 0
                          ? "No history yet."
                          : search
                            ? `No Clips match “${search}” in ${filterMode === "pinned" ? "Pinned" : filterMode === "links" ? "Links" : "All"}.`
                            : filterMode === "pinned" && pinnedIds.length === 0
                              ? "No pinned Clips."
                              : filterMode === "links"
                                ? "No links in history."
                                : "No Clips match these filters."}
                      </div>
                    </div>
                    {clips.length > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          session.update({
                            filterMode: "all",
                            timeFilter: "all",
                            sourceFilter: "all",
                          })
                        }
                      >
                        Reset filters
                      </button>
                    )}
                  </article>
                )}
              {filteredClips.map((clip) => {
                const label =
                  deviceNameMap.get(clip.originPeerId) || clip.originPeerId;
                const timeLabel = formatTime(clip.capturedAt);
                const isLocal = clip.originPeerId === identity?.deviceId;
                const pinned = pinnedSet.has(clip.id);
                return (
                  <article
                    className={`history-card ${removingIds.has(clip.id) ? "leaving" : ""}`}
                    key={clip.id}
                    data-clip-id={clip.id}
                    aria-labelledby={`clip-preview:${clip.id}`}
                    style={{ position: "relative" }}
                  >
                    <div className="history-card-header">
                      <div className="history-chip" title={`From: ${label}`}>
                        <span className="chip-dot"></span>
                        <span className="history-chip-prefix">From:</span>
                        <MiddleEllipsisText
                          className="history-chip-label"
                          text={label}
                        />
                      </div>
                    </div>

                    <button
                      type="button"
                      className="history-body history-select"
                      aria-label="View Clip details"
                      data-session-focus={`details:${clip.id}`}
                      onClick={() =>
                        onInspectClip
                          ? onInspectClip(clip.id)
                          : session.open({
                              kind: "clip-details",
                              entity: clip.id,
                              origin: `details:${clip.id}`,
                            })
                      }
                    >
                      <span
                        id={`clip-preview:${clip.id}`}
                        className="history-text"
                      >
                        {shortenPreview(clip.content, 220)}
                      </span>
                    </button>

                    <div className="history-meta">
                      <div className="meta-left">
                        <div className="meta-top-line">
                          <span className="pill-source">
                            <Icon name={isLocal ? "computer" : "device"} />
                            {isLocal ? "Local" : "Remote"}
                          </span>
                          <span className="meta-time">{timeLabel}</span>
                        </div>
                        <div className="meta-bottom-line">
                          {clip.type === "url" ? "URL" : "Text"}
                        </div>
                      </div>
                    </div>
                    <div className="history-actions">
                      <IconButton
                        icon="pin"
                        label="Pin Clip"
                        data-session-focus={`pin:${clip.id}`}
                        aria-describedby={`clip-preview:${clip.id}`}
                        aria-pressed={pinned}
                        hint={pinned ? "Unpin Clip" : "Pin Clip"}
                        disabled={
                          !identityReady ||
                          historyLoading ||
                          historyUnavailable ||
                          Boolean(historyRefreshError) ||
                          sessionState.historyActions[`pin:${clip.id}`]?.pending
                        }
                        onClick={() => setPinned(clip.id, !pinned)}
                      />
                      <IconButton
                        icon="copy"
                        label="Copy Clip"
                        data-session-focus={`copy:${clip.id}`}
                        aria-describedby={`clip-preview:${clip.id}`}
                        disabled={
                          !identityReady ||
                          sessionState.historyActions[`copy:${clip.id}`]
                            ?.pending ||
                          sessionState.historyActions[`copy:${clip.id}`]
                            ?.feedback?.requiresAcknowledgement
                        }
                        onClick={() => reuseClip(clip.id)}
                      />
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </main>
      </div>

      {activeTask?.kind === "clip-details" &&
        createPortal(
          <TaskDialog
            title="Clip details"
            focusVersion={sessionState.navigationVersion}
            pending={false}
            originKey={activeTask?.origin}
            returnLabel="Back to History"
            onDismiss={() => session.back()}
            cancelLabel="Close details"
            onCancel={() => session.back()}
          >
            <ClipDetails
              clip={detailsClip}
              sourceName={deviceNameMap.get(detailsClip?.originPeerId ?? "")}
              pinned={pinnedSet.has(activeTask?.entity ?? "")}
              disabled={
                !identityReady ||
                historyLoading ||
                historyUnavailable ||
                Boolean(historyRefreshError)
              }
              actions={sessionState.historyActions}
              onCopy={() => reuseClip(activeTask!.entity!)}
              onPin={() => {
                const id = activeTask!.entity!;
                setPinned(id, !pinnedSet.has(id));
              }}
              onDelete={() => handleDelete(activeTask!.entity!)}
              onRetry={(id) => void session.retryHistoryAction(id)}
              onDismiss={(id) => session.dismissHistoryAction(id)}
              onHistory={() => {
                session.back();
                session.update({ destination: "history" });
              }}
            />
          </TaskDialog>,
          document.body
        )}
      {activeTask?.kind === "pairing" &&
        createPortal(
          <TaskDialog
            title="Pairing"
            focusVersion={sessionState.navigationVersion}
            initialFocusKey={activeTask?.initialFocusKey}
            pending={pair.pending || sessionState.pairingImport.pending}
            originKey={activeTask?.origin}
            returnLabel="Close Pairing"
            onDismiss={() => session.close()}
            cancelLabel="Discard pairing input"
            onCancel={() => session.discard()}
          >
            <p>
              Choose how to pair. Closing this view retains unsaved text for
              this session; submitted requests continue.
            </p>
            <button
              type="button"
              data-session-focus="pairing-paste"
              onClick={() =>
                session.open({ kind: "paste", origin: "pairing-paste" })
              }
            >
              Paste pairing text
            </button>
            <button
              type="button"
              data-session-focus="pairing-qr"
              disabled={!identityReady}
              onClick={handleShowQr}
            >
              Show my QR
            </button>
            {onScanPairingCode && (
              <button
                type="button"
                data-session-focus="pairing-scan"
                disabled={!identityReady || isScanningPairing || pair.pending}
                onClick={scanPairingCode}
              >
                {isScanningPairing ? "Scanning…" : "Scan QR"}
              </button>
            )}
            {scanError && (
              <p role="alert">
                {scanError === "camera_permission_denied" &&
                cameraPermission === "granted"
                  ? "Camera permission is now allowed. Choose Scan QR to try again, or paste pairing text."
                  : scanError === "camera_permission_denied" &&
                      scanCameraPermission &&
                      cameraPermission === "unknown"
                    ? "Camera permission could not be confirmed. Check Camera in Android Settings, then choose Scan QR to try again, or paste pairing text."
                    : pairingScanErrorMessage(scanError)}
              </p>
            )}
            {pairingImport}
            {pair.result && (
              <p role="status">{pairingSubmissionMessage(pair.result)}</p>
            )}
            {pairingDiagnostics && (
              <details className="pairing-diagnostics">
                <summary>Pairing diagnostics</summary>
                {pairingDiagnostics}
              </details>
            )}
          </TaskDialog>,
          document.body
        )}
      {activeTask?.kind === "paste" &&
        createPortal(
          <TaskDialog
            title="Paste pairing text"
            focusVersion={sessionState.navigationVersion}
            pending={pair.pending}
            initialFocusKey="pairing-text"
            originKey="pairing-paste"
            returnLabel="Back to Pairing"
            onDismiss={() => session.back()}
            cancelLabel="Discard pairing input"
            onCancel={() => session.discard()}
          >
            <label>
              Pairing text
              <textarea
                aria-label="Pairing text"
                data-session-focus="pairing-text"
                value={pair.raw}
                onChange={(event) => pairingTask.change(event.target.value)}
              />
            </label>
            {pair.result && (
              <p role="status">{pairingSubmissionMessage(pair.result)}</p>
            )}
            {pair.pending && <p role="status">Submitting pairing text…</p>}
            <button
              type="button"
              disabled={!identityReady || pair.pending || isScanningPairing}
              onClick={() => void submitPairText()}
            >
              Submit pairing text
            </button>
          </TaskDialog>,
          document.body
        )}

      {(activeTask?.kind === "device-name" || activeTask?.kind === "alias") &&
        createPortal(
          (() => {
            const alias = activeTask?.kind === "alias";
            const owner = alias ? aliasSession : localNameSession;
            const edit = alias ? aliasEdit : localNameEdit;
            const target = devices.find(
              (device) => device.deviceId === edit.targetId
            );
            const title = alias ? "Local Device Alias" : "Device Name";
            const close = () => {
              owner.dismiss();
              session.back();
            };
            return (
              <TaskDialog
                title={title}
                pending={edit.pending}
                initialFocusKey={
                  activeTask?.initialFocusKey ??
                  (alias ? `alias:${edit.targetId}` : "device-name")
                }
                originKey={activeTask?.origin}
                returnLabel={alias ? "Close alias editor" : "Close name editor"}
                cancelLabel={alias ? "Cancel alias edit" : "Cancel name edit"}
                onDismiss={close}
                onCancel={() => {
                  owner.cancel();
                  session.back();
                }}
              >
                {alias && (
                  <div className="peer-full-value">
                    <div>
                      <span>
                        Device Name: {target?.deviceName || "Unknown"}
                      </span>
                      <button
                        type="button"
                        disabled={!target?.deviceName}
                        onClick={() =>
                          void copyDeviceValue(
                            "Device Name",
                            target?.deviceName || ""
                          )
                        }
                      >
                        Copy Device Name
                      </button>
                    </div>
                    <div>
                      <span>Peer ID: {edit.targetId}</span>
                      <button
                        type="button"
                        onClick={() =>
                          void copyDeviceValue("Peer ID", edit.targetId || "")
                        }
                      >
                        Copy Peer ID
                      </button>
                    </div>
                  </div>
                )}
                {alias && deviceCopyFeedback && (
                  <p role="status">{deviceCopyFeedback}</p>
                )}
                <label>
                  {title}
                  <input
                    aria-label={title}
                    data-session-focus={
                      activeTask?.initialFocusKey ??
                      (alias ? `alias:${edit.targetId}` : "device-name")
                    }
                    value={edit.raw}
                    onChange={(event) => owner.change(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        if (!edit.pending)
                          (alias ? saveDeviceName : saveLocalName)();
                      }
                    }}
                  />
                </label>
                {edit.error && (
                  <p role="alert">{nameSaveErrorMessage(edit.error, alias)}</p>
                )}
                {edit.pending && <p role="status">Saving {title}…</p>}
                <button
                  type="button"
                  disabled={edit.pending || !identityReady}
                  onClick={alias ? saveDeviceName : saveLocalName}
                >
                  Save {title}
                </button>
                {alias && (
                  <button
                    type="button"
                    disabled={edit.pending || !identityReady || !target}
                    onClick={useReportedDeviceName}
                  >
                    Use device name
                  </button>
                )}
              </TaskDialog>
            );
          })(),
          document.body
        )}

      {qrState.open &&
        activeTask?.kind === "qr" &&
        createPortal(
          <TaskDialog
            title="Pair this device"
            focusVersion={sessionState.navigationVersion}
            pending={false}
            cancelLabel="Close QR dialog"
            onCancel={closeQr}
            onDismiss={closeQr}
            originKey="pairing-qr"
            className="qr-modal"
          >
            <PairingCodeContent
              state={qrState}
              onRetry={() => {
                void qrTask.generate(onRequestPairingCode);
              }}
              onCopy={() => {
                void qrTask.copy(onCopyPairingText);
              }}
            />
          </TaskDialog>,
          document.body
        )}

      {clearReviewOpen &&
        activeTask?.kind === "clear" &&
        createPortal(
          <ClearHistoryReview
            totalCount={clips.length}
            pinnedCount={clips.filter((clip) => pinnedSet.has(clip.id)).length}
            filteredOutCount={Math.max(0, clips.length - filteredClips.length)}
            pending={clearPending}
            error={clearError}
            historyReady={
              !clearNeedsRefresh &&
              !historyLoading &&
              !historyUnavailable &&
              !historyRefreshError
            }
            refreshPending={clearRefreshPending}
            onRefresh={refreshClearHistory}
            onCancel={() => {
              if (clearPending) return;
              setClearReviewOpen(false);
              session.complete("clear");
              setClearError(null);
            }}
            onConfirm={clearAllHistory}
          />,
          document.body
        )}
    </div>
  );
}
