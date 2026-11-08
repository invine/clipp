import { shortenPreview, previewGraphemes } from "./previewText";
import { projectConnectionSummary } from "../../core/runtime/connectionSummary";
import { ConnectionStatusButton } from "./ConnectionSummary";
import { NotificationSettings } from "./NotificationSettings";
import type { NotificationAvailabilityControls } from "./useNotificationAvailability";
import type { HostTaskInput } from "./hostTaskInput";
import {
  pairingScanErrorMessage,
  type PairingScanOptions,
  type PairingScanResult,
  type PairingCameraPermission,
} from "./pairingScan";
import { usePairingScanBehavior } from "./pairingScanBehavior";
import { ClipDetails } from "./ClipDetails";
import {
  BackgroundContinuityControls,
  BackgroundContinuityHelp,
} from "./BackgroundContinuityControls";
import { useBackgroundContinuityBehavior } from "./backgroundContinuityBehavior";
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
import type { RuntimeSettings } from "../../core/runtime/settingsAuthority";
import type { RelayActionResult } from "../../core/network/relayActions";
import { PairingCodeContent } from "./PairingCodeContent";
import { usePairingCodeTask } from "./usePairingCodeTask";
import type { PayloadCopyResult } from "../../core/clipboard/payloadCopy";
import { pairingSubmissionMessage } from "./pairingFeedback";
import { useTrustRequestBehavior } from "./trustRequestBehavior";
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
import { browserUiHost, type UiHostEffects } from "./runtimeAdapter";
import { useDeviceBehavior } from "./deviceBehavior";
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
  useLayoutEffect,
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
import { nameSaveErrorMessage } from "./nameEditSession";

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
  const date = new Date(ts);
  const now = new Date();
  const localDay = (value: Date) =>
    new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const age = Math.round((localDay(now) - localDay(date)) / 86_400_000);
  const time = date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  if (age === 0) return `Today, ${time}`;
  if (age === 1) return `Yesterday, ${time}`;
  if (age < 7)
    return `${date.toLocaleDateString(undefined, { weekday: "long" })}, ${time}`;
  return date.toLocaleString();
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
  /** Runtime composition lifetime. Replacing it retires obsolete UI work. */
  runtimeOwner?: object;
  /** Host effects are injected so scripted UI sessions never touch native APIs. */
  host?: UiHostEffects;
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
  onSaveAppearanceSettings?(patch: Partial<RuntimeSettings>): Promise<void>;
  onRefreshAppearanceSettings?(): Promise<void>;
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
  pairingTaskDiagnostics?: React.ReactNode;
  headerActions?: React.ReactNode;
  /** Test-only scenario controls rendered beside the active continuity surface. */
  backgroundContinuityDiagnostics?: React.ReactNode;
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
  /** Test-only controls rendered inside the History review dialog. */
  historyDiagnostics?: React.ReactNode;
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
  host = browserUiHost,
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
  onSaveAppearanceSettings,
  onRefreshAppearanceSettings,
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
  pairingTaskDiagnostics,
  headerActions,
  backgroundContinuityDiagnostics,
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
  historyDiagnostics,
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
  runtimeOwner,
}: ClipboardAppProps) {
  const [isNarrow, setIsNarrow] = useState(false);
  const [isCramped, setIsCramped] = useState(false);
  const pinnedSet = useMemo(() => new Set(pinnedIds), [pinnedIds]);
  const [session] = useState(() => providedSession ?? createUiSession());
  const identityReady =
    Boolean(identity) &&
    !initializationError &&
    !identityRotationRecovery &&
    !runtimeError;
  const trustRequestBehavior = useTrustRequestBehavior({
    owner: runtimeOwner ?? session,
    identityId: identity?.deviceId,
    ready: identityReady,
    loading: requestsLoading,
    unavailable: requestsUnavailable,
    pending,
    onAccept,
    onReject,
  });
  const approvalsPending = trustRequestBehavior.state.pendingKeys;
  const backgroundContinuityBehavior = useBackgroundContinuityBehavior(
    runtimeOwner ?? session,
    host.confirm
  );
  const sessionState = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot
  );
  const currentIdentity = useRef(identity?.deviceId);
  currentIdentity.current = identity?.deviceId;
  useEffect(
    () => () => session.retireHistoryActions(),
    [runtimeOwner, session]
  );
  const activeTask = sessionState.tasks[sessionState.tasks.length - 1];
  const { search, sourceFilter, filterMode, showNav } = sessionState;
  const setSearch = (search: string) => session.update({ search });
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
  const pairingScan = usePairingScanBehavior({
    session,
    identityId: identity?.deviceId,
    runtimeOwner: runtimeOwner ?? session,
    ready: identityReady,
    scan: onScanPairingCode,
    submit: onPairText,
    permission: scanCameraPermission,
  });
  const {
    isScanning: isScanningPairing,
    error: scanError,
    cameraPermission,
  } = pairingScan;
  const { task: qrTask, state: qrState } = usePairingCodeTask(
    identity ? `${identity.deviceId}:${identity.deviceName}` : null,
    session.qr
  );
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());
  const [sourceMenuOpen, setSourceMenuOpen] = useState(false);
  const [deviceMenuOpen, setDeviceMenuOpen] = useState<string | null>(null);
  useEffect(() => {
    if (
      deviceMenuOpen &&
      (sessionState.destination !== "devices" ||
        !devices.some((device) => device.deviceId === deviceMenuOpen))
    )
      setDeviceMenuOpen(null);
  }, [deviceMenuOpen, devices, sessionState.destination]);
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
  const deviceBehavior = useDeviceBehavior({
    session,
    identity,
    identityReady,
    devices,
    runtimeOwner: runtimeOwner ?? session,
    host,
    onRenameIdentity,
    onRenameDevice,
    onUnpair,
  });
  const { confirmingIds, revokingIds, revocationError, deviceCopyFeedback } =
    deviceBehavior;
  useEffect(() => {
    if (
      activeTask?.kind !== "peer-id" ||
      !activeTask.entity ||
      activeTask.entity === identity?.deviceId ||
      devices.some((device) => device.deviceId === activeTask.entity)
    )
      return;
    session.back();
    session.update({
      taskNotice: "This device is no longer available. Its peer ID was closed.",
    });
  }, [
    activeTask?.kind,
    activeTask?.entity,
    identity?.deviceId,
    devices,
    session,
  ]);
  const [relaysOpen, setRelaysOpen] = useState(true);
  const relayAddressBehavior = session.relayAddresses;
  useLayoutEffect(() => {
    relayAddressBehavior.bind(runtimeOwner ?? session, onSetRelayAddresses);
  }, [relayAddressBehavior, runtimeOwner, session, onSetRelayAddresses]);
  const relayEditor = useSyncExternalStore(
    relayAddressBehavior.subscribe,
    relayAddressBehavior.getSnapshot,
    relayAddressBehavior.getSnapshot
  );
  const {
    adding: addingRelay,
    editingIndex: editingRelayIndex,
    draft: relayDraft,
    saving: relaySaving,
    error: relayError,
  } = relayEditor;
  const [clearReviewOpen, setClearReviewOpen] = useState(false);
  const clearAction = sessionState.historyActions.clear;
  const clearRefreshAction = sessionState.historyActions["clear:refresh"];
  const clearPending = Boolean(clearAction?.pending);
  const clearError = clearAction?.feedback?.message ?? null;
  const clearNeedsRefresh = Boolean(
    clearAction?.feedback?.requiresAcknowledgement
  );
  const clearRefreshPending = Boolean(clearRefreshAction?.pending);
  const clearRefreshError = clearRefreshAction?.feedback?.message ?? null;
  useEffect(() => {
    const menu = Boolean(sourceMenuOpen || deviceMenuOpen);
    const drawer = showNav && sessionState.tasks.length === 0;
    const guardedClear =
      (clearPending || clearRefreshPending) && clearReviewOpen;
    if (!taskInput || (!menu && !drawer && !guardedClear)) return;
    if (guardedClear) return taskInput.registerOverlay({});
    return taskInput.registerOverlay({
      dismiss: () => {
        if (menu) {
          setSourceMenuOpen(false);
          const deviceMenu = rootRef.current?.querySelector<HTMLDetailsElement>(
            ".device-action-menu[open]"
          );
          if (deviceMenu) {
            deviceMenu.open = false;
            deviceMenu.querySelector("summary")?.focus();
          }
        } else dismissNav();
      },
    });
  }, [
    taskInput,
    sourceMenuOpen,
    deviceMenuOpen,
    showNav,
    sessionState.tasks.length,
    clearPending,
    clearRefreshPending,
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
      sessionState.destination !== "settings" ||
      !sessionState.settingsCategory
    )
      return;
    const category = sessionState.settingsCategory;
    const target =
      rootRef.current?.querySelector<HTMLElement>(
        `[data-session-focus="settings:${category}"]`
      ) ??
      rootRef.current?.querySelector<HTMLElement>(
        `[data-settings-panel="${category}"]`
      );
    target?.scrollIntoView({ block: "start", inline: "nearest" });
  }, [sessionState.destination, sessionState.settingsCategory]);
  useEffect(() => {
    if (
      identity?.deviceId &&
      previousIdentity.current &&
      identity.deviceId !== previousIdentity.current
    ) {
      session.rotateIdentity();
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
  const issueIds = JSON.stringify(issues.map((issue) => issue.id).sort());
  const previousIssueIds = useRef<Set<string>>(new Set());
  const [showIssueNotice, setShowIssueNotice] = useState(false);
  const [issueNoticePaused, setIssueNoticePaused] = useState(false);
  useEffect(() => {
    const current = new Set<string>(JSON.parse(issueIds));
    if ([...current].some((id) => !previousIssueIds.current.has(id)))
      setShowIssueNotice(true);
    if (!current.size) {
      setShowIssueNotice(false);
      setIssueNoticePaused(false);
    }
    previousIssueIds.current = current;
  }, [issueIds]);
  useEffect(() => {
    if (sessionState.tasks.length) setIssueNoticePaused(false);
  }, [sessionState.tasks.length]);
  useEffect(() => {
    if (!showIssueNotice || issueNoticePaused || sessionState.tasks.length)
      return;
    const timer = window.setTimeout(() => setShowIssueNotice(false), 8000);
    return () => window.clearTimeout(timer);
  }, [showIssueNotice, issueNoticePaused, sessionState.tasks.length, issueIds]);
  function issueRetry(issue: RecoveryIssue) {
    if (issue.code === "continuity")
      return onRefreshBackgroundContinuity
        ? async () => {
            return backgroundContinuityBehavior.perform(
              "Refreshing background state",
              onRefreshBackgroundContinuity
            );
          }
        : undefined;
    if (issue.id === "clipboard:focus:observation") return onRetryPopupCapture;
    if (issue.code === "settings") return onRefreshAppearanceSettings;
    if (issue.code === "clip-settings")
      return appearanceSettings?.snapshot?.state.retentionError
        ? onRetryHistoryCleanup
        : onRefreshAppearanceSettings;
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
        target?.closest(".source-filter-wrap") ||
        target?.closest(".device-action-menu")
      )
        return;
      setSourceMenuOpen(false);
      rootRef.current
        ?.querySelectorAll<HTMLDetailsElement>(".device-action-menu[open]")
        .forEach((element) => (element.open = false));
    }
    document.addEventListener("mousedown", handleDocClick);
    return () => document.removeEventListener("mousedown", handleDocClick);
  }, []);

  useEffect(() => {
    function handleResize() {
      const size = hostContentSize(window, document);
      setIsNarrow(
        size.width <=
          (sessionState.destination === "devices" ? 640 : NARROW_CONTENT_WIDTH)
      );
      const controls =
        rootRef.current?.querySelectorAll<HTMLElement>(".workspace-topbar");
      const controlsHeight = [...(controls ?? [])].reduce(
        (height, element) => height + element.getBoundingClientRect().height,
        0
      );
      setIsCramped(size.height <= Math.max(500, controlsHeight + 160));
    }
    handleResize();
    const observer = new ResizeObserver(handleResize);
    rootRef.current
      ?.querySelectorAll(".workspace-topbar")
      .forEach((element) => observer.observe(element));
    window.addEventListener("resize", handleResize);
    window.addEventListener(HOST_GEOMETRY_EVENT, handleResize);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", handleResize);
      window.removeEventListener(HOST_GEOMETRY_EVENT, handleResize);
    };
  }, [sessionState.destination]);

  const deviceNameMap = useMemo(() => {
    const map = new Map<string, string>();
    if (identity) map.set(identity.deviceId, identity.deviceName);
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
    set.add("local");
    set.add("remote");
    clips.forEach((c) => set.add(c.originPeerId));
    if (identity) set.add(identity.deviceId);
    devices.forEach((d) => set.add(d.deviceId));
    return ["all", ...Array.from(set)];
  }, [clips, devices, identity]);

  const filteredClips = useMemo(() => {
    let list = clips
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
    void session.runHistoryAction("clear", async () => {
      try {
        await onClearAll();
        setClearReviewOpen(false);
        session.complete("clear");
        return null;
      } catch {
        return {
          message:
            "Clear could not be confirmed. History may have changed. Refresh History before trying again.",
          action: "dismiss",
          requiresAcknowledgement: true,
        };
      }
    });
  }

  function refreshClearHistory() {
    if (!onRetryHistoryRefresh || clearRefreshPending || clearPending) return;
    void session.runHistoryAction("clear:refresh", async () => {
      try {
        const confirmed = await onRetryHistoryRefresh();
        if (confirmed) {
          session.reconcileHistoryAction("clear");
          return null;
        }
        return {
          message:
            "History refresh could not be confirmed. Clear remains blocked until History is refreshed.",
          action: "retry",
        };
      } catch {
        return {
          message:
            "History refresh failed. Clear remains blocked until History is refreshed.",
          action: "retry",
        };
      }
    });
  }

  useEffect(() => {
    if (
      editingRelayIndex !== null &&
      editingRelayIndex >= relayAddresses.length
    ) {
      relayAddressBehavior.cancel();
    }
  }, [relayAddresses, addingRelay, editingRelayIndex]);

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
        return {
          message: "Shared current clipboard.",
          action: "dismiss",
          status: "success",
        };
      } catch (error) {
        return shareNowFailureFeedback(normalizeShareNowFailureCode(error));
      }
    });
  }

  function beginAddRelay() {
    setRelaysOpen(true);
    relayAddressBehavior.beginAdd();
  }

  function beginRenameRelay(index: number, address: string) {
    setRelaysOpen(true);
    relayAddressBehavior.beginEdit(index, address);
  }

  function cancelRelayEdit() {
    relayAddressBehavior.cancel();
  }

  async function saveNewRelay() {
    const entries = parseRelayInput(relayDraft);
    if (entries.length === 0) {
      relayAddressBehavior.failValidation("Enter a relay address.");
      return;
    }
    await relayAddressBehavior.save([...relayAddresses, ...entries]);
  }

  async function saveRelayRename(index: number) {
    const entries = parseRelayInput(relayDraft);
    if (entries.length !== 1) {
      relayAddressBehavior.failValidation("Enter one relay address.");
      return;
    }
    const next = relayAddresses.map((address, i) =>
      i === index ? entries[0] : address
    );
    await relayAddressBehavior.save(next);
  }

  async function removeRelay(index: number) {
    const next = relayAddresses.filter((_, i) => i !== index);
    await relayAddressBehavior.save(next);
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

  const scanPairingCode = pairingScan.start;

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
            onChange={(e) => relayAddressBehavior.change(e.target.value)}
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
                onChange={(e) => relayAddressBehavior.change(e.target.value)}
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

  function openPeerId(deviceId: string, origin: string) {
    deviceBehavior.resetDeviceCopyFeedback();
    session.open({ kind: "peer-id", entity: deviceId, origin });
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
            <section className="device-section" aria-label="This device">
              {identity && (
                <>
                  <div className="device-card device-card-local">
                    <div className="peer-meta">
                      <h2 className="device-local-name">
                        <MiddleEllipsisText
                          className="peer-name"
                          text={identity.deviceName || "Local device"}
                        />
                      </h2>
                      <MiddleEllipsisText
                        className="peer-sub"
                        text={identity.deviceId}
                        max={isNarrow ? 22 : 30}
                      />
                    </div>
                    <div className="local-device-actions">
                      <button
                        type="button"
                        className="icon-button"
                        aria-label="Show and copy this device's peer ID"
                        data-session-focus="peer-id-local"
                        onClick={() =>
                          openPeerId(identity.deviceId, "peer-id-local")
                        }
                      >
                        <Icon name="copy" />
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        data-session-focus="rename-local"
                        aria-label="Rename this device"
                        disabled={!identityReady}
                        onClick={deviceBehavior.beginEditLocalName}
                      >
                        <Icon name="edit" />
                      </button>
                    </div>
                  </div>
                </>
              )}
            </section>
          </>
        )}
        {sessionState.destination === "requests" && (
          <>
            <div className="section-divider"></div>
            <div>
              <h2 className="device-section-title" style={{ marginTop: 14 }}>
                Pending requests
              </h2>
              <PairingStatus
                outcomes={pairingOutcomes}
                waiting={waiting}
                errors={pairingErrors}
                devices={devices}
                onDismiss={onDismissPairingOutcome}
              />
              {trustRequestBehavior.visibleFeedback.map((item) => (
                <p
                  key={`${item.deviceId}:${item.requestVersion}`}
                  role="status"
                  style={{ overflowWrap: "anywhere" }}
                >
                  {item.message}
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
                            trustRequestBehavior.isPending(req)
                          }
                          onClick={() =>
                            void trustRequestBehavior.decide(req, true)
                          }
                        >
                          Accept
                        </button>
                        <button
                          className="text-button"
                          disabled={
                            !identityReady ||
                            requestsLoading ||
                            requestsUnavailable ||
                            trustRequestBehavior.isPending(req)
                          }
                          onClick={() =>
                            void trustRequestBehavior.decide(req, false)
                          }
                        >
                          Reject
                        </button>
                      </div>
                      {trustRequestBehavior.isPending(req) && (
                        <p role="status">Deciding Trust Request…</p>
                      )}
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
            <section
              className="device-section trusted-device-section"
              aria-labelledby="trusted-devices-heading"
            >
              <div className="device-section-heading">
                <h2
                  className="device-section-title"
                  id="trusted-devices-heading"
                >
                  Trusted devices
                </h2>
                <span className="device-count">
                  {devices.length} {devices.length === 1 ? "device" : "devices"}
                </span>
              </div>
              <div className="device-list">
                {devices.length === 0 && (
                  <div className="device-empty-state">
                    No Trusted Devices yet. Pair another device to add it to
                    your Device Network.
                  </div>
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
                          confirmingIds.includes(revocationError.deviceId) ||
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
                          if (device) void deviceBehavior.revokeDevice(device);
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
                      className={`device-card device-card-trusted ${isOnline ? "is-online" : "is-offline"}`}
                      title={connectionStatus.title}
                    >
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
                        <span className="device-membership-status">
                          <span
                            className={`device-status-dot ${isOnline ? "is-online" : connectionStateKnown ? "is-offline" : "is-unknown"}`}
                            aria-hidden="true"
                          />
                          {connectionStatus.title}
                        </span>
                        {revokingIds.includes(dev.deviceId) && (
                          <span role="status">Revoking this device…</span>
                        )}
                        {confirmingIds.includes(dev.deviceId) && (
                          <span role="status">
                            Confirming device revocation…
                          </span>
                        )}
                      </div>
                      <div className="peer-actions">
                        <details
                          className="device-action-menu"
                          onToggle={(event) => {
                            const menu = event.currentTarget;
                            if (menu.open) {
                              rootRef.current
                                ?.querySelectorAll<HTMLDetailsElement>(
                                  ".device-action-menu[open]"
                                )
                                .forEach((other) => {
                                  if (other !== menu) other.open = false;
                                });
                              setDeviceMenuOpen(dev.deviceId);
                            } else {
                              setDeviceMenuOpen((current) =>
                                current === dev.deviceId ? null : current
                              );
                            }
                          }}
                          onKeyDown={(event) => {
                            if (event.key !== "Escape") return;
                            event.preventDefault();
                            event.stopPropagation();
                            event.currentTarget.open = false;
                            event.currentTarget
                              .querySelector("summary")
                              ?.focus();
                          }}
                        >
                          <summary
                            role="button"
                            aria-expanded={deviceMenuOpen === dev.deviceId}
                            aria-label={`${dev.displayName || dev.deviceName || "Device"} actions`}
                            data-session-focus={`rename:${dev.deviceId}`}
                          >
                            <Icon name="more" />
                          </summary>
                          <div className="device-action-popover">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.currentTarget.closest("details")!.open =
                                  false;
                                openPeerId(
                                  dev.deviceId,
                                  `rename:${dev.deviceId}`
                                );
                              }}
                            >
                              View peer ID
                            </button>
                            {onRenameDevice && (
                              <button
                                type="button"
                                aria-label="Edit Local Device Alias"
                                disabled={!identityReady}
                                onClick={(event) => {
                                  event.currentTarget.closest("details")!.open =
                                    false;
                                  deviceBehavior.beginEditDeviceName(dev);
                                }}
                              >
                                Edit alias
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={
                                !identityReady ||
                                confirmingIds.includes(dev.deviceId) ||
                                revokingIds.includes(dev.deviceId)
                              }
                              onClick={() =>
                                void deviceBehavior.revokeDevice(dev)
                              }
                            >
                              Revoke device
                            </button>
                          </div>
                        </details>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </>
        )}
        {sessionState.destination === "settings" &&
          (() => {
            const category =
              sessionState.settingsCategory === "relays"
                ? "connections"
                : (sessionState.settingsCategory ?? "general");
            return (
              <>
                <nav
                  className="settings-categories"
                  aria-label="Settings categories"
                >
                  {(
                    [
                      ["general", "General"],
                      ["appearance", "Appearance"],
                      ["clips", "Clipboard History"],
                      ["connections", "Connections"],
                      ["advanced", "Advanced"],
                    ] as const
                  ).map(([item, label]) => (
                    <button
                      key={item}
                      type="button"
                      aria-current={category === item ? "location" : undefined}
                      data-session-focus={`settings-category:${item}`}
                      onClick={() => {
                        session.update({ settingsCategory: item });
                        const target =
                          rootRef.current?.querySelector<HTMLElement>(
                            `[data-session-focus="settings:${item}"]`
                          ) ??
                          rootRef.current?.querySelector<HTMLElement>(
                            `[data-settings-panel="${item}"]`
                          ) ??
                          rootRef.current?.querySelector<HTMLElement>(
                            '[data-settings-panel="general"]'
                          );
                        target?.scrollIntoView({
                          block: "start",
                          inline: "nearest",
                        });
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </nav>
                <div className="settings-sections">
                  <section
                    data-settings-panel="general"
                    aria-label="General settings"
                  >
                    <h3 tabIndex={-1} data-session-focus="settings:general">
                      General
                    </h3>
                    <p className="settings-intro">
                      Choose how this device works with Clipp.
                    </p>
                    {appearanceSettings && (
                      <section
                        className="settings-group"
                        aria-labelledby="settings-appearance-heading"
                        tabIndex={-1}
                        data-session-focus="settings:appearance"
                      >
                        <h4 id="settings-appearance-heading">Appearance</h4>
                        <p>Choose a theme for this device.</p>
                        <Appearance
                          settings={appearanceSettings}
                          onSave={onSaveAppearanceSettings}
                          onRefresh={onRefreshAppearanceSettings}
                        />
                      </section>
                    )}
                    {onSetAutoSync && (
                      <section
                        className="settings-group relay-settings"
                        aria-labelledby="settings-sync-heading"
                      >
                        <h4 id="settings-sync-heading">Sync</h4>
                        <p>
                          Send and receive Clips with Trusted Devices. Disabling
                          Auto Sync keeps local capture and Clipboard History.
                        </p>
                        <label className="peer-sub" htmlFor="auto-sync">
                          Auto Sync
                        </label>
                        <button
                          id="auto-sync"
                          type="button"
                          className="setting-switch"
                          role="switch"
                          aria-checked={autoSyncKnown ? autoSync : false}
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
                          onClick={() => {
                            if (
                              autoSyncPending ||
                              sessionState.autoSync.pending
                            )
                              return;
                            void session.saveAutoSync(() =>
                              onSetAutoSync(!autoSync)
                            );
                          }}
                        >
                          <span aria-hidden="true" />
                        </button>
                        {!autoSyncKnown && (
                          <p role="status">Auto Sync: Unknown</p>
                        )}
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
                              sessionState.autoSync.feedback.status ===
                              "applied"
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
                      </section>
                    )}

                    {appearanceSettings && (
                      <section
                        className="settings-group"
                        aria-labelledby="settings-history-heading"
                        tabIndex={-1}
                        data-session-focus="settings:clips"
                      >
                        <h4 id="settings-history-heading">Clipboard History</h4>
                        <p>
                          Manage how long unpinned Clips stay on this device.
                        </p>
                        <ClipSettings
                          section="retention"
                          settings={appearanceSettings}
                          owner={runtimeOwner ?? session}
                          onSave={onSaveAppearanceSettings}
                          onRefresh={onRefreshAppearanceSettings}
                          onRetryRetention={
                            onRetryHistoryCleanup
                              ? async () => {
                                  await onRetryHistoryCleanup();
                                }
                              : undefined
                          }
                        />
                      </section>
                    )}
                    {!appearanceSettings && onSetLocalRetention && (
                      <section
                        className="settings-group relay-settings"
                        aria-labelledby="settings-history-heading"
                        tabIndex={-1}
                        data-session-focus="settings:clips"
                      >
                        <h4 id="settings-history-heading">Clipboard History</h4>
                        <p>
                          Manage how long unpinned Clips stay on this device.
                        </p>
                        <label className="peer-sub" htmlFor="history-retention">
                          Keep unpinned history
                        </label>
                        <select
                          id="history-retention"
                          value={localRetentionMs}
                          onChange={(event) =>
                            void updateLocalRetention(
                              Number(event.target.value)
                            )
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
                          <option value={7 * 24 * 60 * 60 * 1000}>
                            7 days
                          </option>
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
                      </section>
                    )}
                  </section>
                  <section
                    data-settings-panel="connections"
                    aria-label="Connections settings"
                  >
                    <h3 tabIndex={-1} data-session-focus="settings:connections">
                      Connections
                    </h3>
                    <p className="settings-intro">
                      Configure how Clipp reaches your Trusted Devices.
                    </p>
                    <section
                      className="settings-group"
                      aria-labelledby="settings-relays-heading"
                      tabIndex={-1}
                      data-session-focus="settings:relays"
                    >
                      <h4 id="settings-relays-heading">Managed relays</h4>
                      {renderRelaysSection()}
                    </section>
                    {backgroundContinuity && onSetBackgroundContinuity && (
                      <section
                        className="settings-group"
                        aria-labelledby="settings-background-heading"
                      >
                        <h4 id="settings-background-heading">
                          Background continuity
                        </h4>
                        <BackgroundContinuityControls
                          state={backgroundContinuity}
                          behavior={backgroundContinuityBehavior}
                          scenarioControls={backgroundContinuityDiagnostics}
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
                      </section>
                    )}{" "}
                    {notificationControls && (
                      <NotificationSettings controls={notificationControls} />
                    )}
                  </section>
                  <section
                    data-settings-panel="advanced"
                    aria-label="Advanced settings"
                  >
                    <section
                      className="settings-group"
                      aria-label="Issues and recovery"
                    >
                      <h4>Issues and recovery</h4>
                      <p>Review current problems and recovery actions.</p>
                      <button
                        type="button"
                        className="text-button"
                        data-session-focus="settings:issues"
                        onClick={() =>
                          session.open({
                            kind: "issues",
                            origin: "settings:issues",
                          })
                        }
                      >
                        Review issues
                      </button>
                    </section>
                    <h3 tabIndex={-1} data-session-focus="settings:advanced">
                      Advanced
                    </h3>
                    <p className="settings-intro">
                      Review sharing, local data and device recovery controls.
                    </p>
                    {appearanceSettings && (
                      <section
                        className="settings-group"
                        aria-labelledby="settings-sharing-heading"
                      >
                        <h4 id="settings-sharing-heading">Clip Sharing</h4>
                        <p>
                          Set how long new Clips remain eligible for sharing.
                        </p>
                        <ClipSettings
                          section="lifetime"
                          settings={appearanceSettings}
                          owner={runtimeOwner ?? session}
                          onSave={onSaveAppearanceSettings}
                          onRefresh={onRefreshAppearanceSettings}
                        />
                      </section>
                    )}
                    <section
                      className="settings-group relay-settings"
                      aria-labelledby="settings-local-history-heading"
                    >
                      <h4 id="settings-local-history-heading">Local history</h4>
                      <p>Remove saved Clips from this device.</p>
                      <button
                        type="button"
                        className="text-button labelled-control"
                        data-session-focus="settings-clear"
                        onClick={() => {
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
                    </section>
                    <section
                      className="settings-group"
                      aria-labelledby="settings-identity-heading"
                    >
                      <h4 id="settings-identity-heading">
                        Identity and recovery
                      </h4>
                      <ManualIdentityResetSettings
                        peerId={identity?.deviceId}
                        owner={runtimeOwner ?? session}
                        state={identityResetState}
                        available={manualIdentityResetAvailable}
                        actions={identityResetActions}
                        onPair={
                          identityReady ? onPairAfterIdentityReset : undefined
                        }
                        onCopyFormerPeerId={onCopyFormerIdentity}
                        onAccepted={() => session.rotateIdentity()}
                      />
                    </section>
                    {appearanceSettings && (
                      <section
                        className="settings-group relay-settings"
                        aria-labelledby="settings-diagnostics-heading"
                      >
                        <h4 id="settings-diagnostics-heading">Diagnostics</h4>
                        <label>
                          Log level
                          <select
                            aria-label="Log level"
                            value={
                              appearanceSettings.snapshot?.state.logLevel ?? ""
                            }
                            disabled={
                              !appearanceSettings.snapshot ||
                              appearanceSettings.recoveryRequired ||
                              !onSaveAppearanceSettings
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
                              void onSaveAppearanceSettings?.({
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
                          onRetry={onRefreshAppearanceSettings}
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
                            disabled={!onRefreshAppearanceSettings}
                            onClick={() => void onRefreshAppearanceSettings?.()}
                          >
                            Refresh General settings
                          </button>
                        )}
                      </section>
                    )}
                  </section>
                </div>
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
        focusKey:
          isNarrow || showNav
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
        if (
          !event.defaultPrevented &&
          (event.metaKey || event.ctrlKey) &&
          !event.altKey &&
          event.key.toLowerCase() === "k" &&
          session.getSnapshot().tasks.length === 0
        ) {
          event.preventDefault();
          const current = session.getSnapshot();
          session.update({
            destination: "history",
            filterMode:
              current.destination === "history" ? current.filterMode : "all",
            showNav: false,
            focusKey: "history-query",
          });
          requestAnimationFrame(() =>
            rootRef.current
              ?.querySelector<HTMLInputElement>(
                '[data-session-focus="history-query"]'
              )
              ?.focus()
          );
          return;
        }
        if (event.key !== "Escape" || event.defaultPrevented) return;
        if (event.repeat) {
          event.preventDefault();
          return;
        }
        if (sourceMenuOpen) {
          event.preventDefault();
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
        inert={!showNav}
        aria-hidden={!showNav}
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
      {showNav && (
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
        <header
          className={`workspace-topbar ${sessionState.destination === "devices" ? "devices-topbar" : ""} ${sessionState.destination === "history" ? "history-topbar" : ""}`}
        >
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
            {showNav ? (
              <Icon name="close" />
            ) : (
              <img src={clippPurpleIcon} alt="" draggable={false} />
            )}
          </button>
          {sessionState.destination !== "history" && (
            <h1 className="workspace-current-title">
              {sessionState.destination[0].toUpperCase() +
                sessionState.destination.slice(1)}
            </h1>
          )}
          {sessionState.destination === "history" && (
            <div className="search-field">
              <Icon name="search" />
              <input
                aria-label="Search history"
                data-session-focus="history-query"
                placeholder="Search history"
                value={search}
                onChange={(e) => session.update({ search: e.target.value })}
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
          )}
          {sessionState.destination === "devices" && (
            <div className="device-header-actions">
              <button
                type="button"
                className="primary-button"
                aria-label="Pair this device"
                disabled={!identityReady}
                data-session-focus="pairing-start"
                onClick={() =>
                  session.open({ kind: "pairing", origin: "pairing-start" })
                }
              >
                Pair
              </button>
              <button
                type="button"
                className="icon-button device-qr-button"
                aria-label="Show my QR"
                disabled={!identityReady}
                data-session-focus="pairing-qr"
                onClick={handleShowQr}
              >
                <Icon name="qr" />
              </button>
            </div>
          )}
          {sessionState.destination !== "devices" && (
            <ConnectionStatusButton
              summary={connectionSummary}
              session={session}
            />
          )}
          {sessionState.destination === "history" && onShareNow && (
            <div className="workspace-controls history-share-controls">
              <div className="send-control">
                <IconButton
                  icon="send"
                  label="Share current clipboard now"
                  hint="Share current system clipboard now"
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
              {sessionState.historyActions["send:current"]?.pending && (
                <span role="status">Sharing current clipboard…</span>
              )}
            </div>
          )}
          {headerActions}
        </header>

        {showIssueNotice && issues.length > 0 && !activeTask && (
          <div
            className="issue-notice"
            role="status"
            onMouseEnter={() => setIssueNoticePaused(true)}
            onMouseLeave={() => setIssueNoticePaused(false)}
            onFocusCapture={() => setIssueNoticePaused(true)}
            onBlurCapture={(event) => {
              if (
                !event.currentTarget.contains(
                  event.relatedTarget as Node | null
                )
              )
                setIssueNoticePaused(false);
            }}
          >
            <span>
              {issues.length === 1
                ? "Clipp needs attention"
                : `${issues.length} issues need attention`}
            </span>
            <button
              type="button"
              className="text-button"
              data-session-focus="issues-summary"
              onClick={() =>
                session.open({ kind: "issues", origin: "issues-summary" })
              }
            >
              Review
            </button>
            <IconButton
              icon="close"
              label="Dismiss notification"
              onClick={() => {
                setShowIssueNotice(false);
                setIssueNoticePaused(false);
              }}
            />
          </div>
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
                  behavior={backgroundContinuityBehavior}
                  exportDiagnostics={onExportBackgroundContinuityDiagnostics}
                  scenarioControls={backgroundContinuityDiagnostics}
                />
              ) : undefined
            }
            retry={issueRetry}
            dismiss={issueDismiss}
            route={(issue) => {
              session.close();
              if (issue.scope === "task") {
                if (issue.code === "device-name")
                  deviceBehavior.beginEditLocalName();
                if (issue.code === "alias") {
                  const device = devices.find(
                    (device) => device.deviceId === issue.target
                  );
                  if (device) deviceBehavior.beginEditDeviceName(device);
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
          {sessionState.destination !== "devices" &&
            sessionState.destination !== "history" && (
              <div className="workspace-page-head" aria-hidden="true">
                <div>
                  <div className="workspace-page-title">
                    {sessionState.destination[0].toUpperCase() +
                      sessionState.destination.slice(1)}
                  </div>
                  <p>
                    {sessionState.destination === "settings"
                      ? "Make Clipp work the way you do."
                      : "Review your device requests."}
                  </p>
                </div>
              </div>
            )}
          {sessionState.destination !== "history" && (
            <section
              className={`surface destination-pane ${sessionState.destination === "settings" ? "settings-pane" : sessionState.destination === "devices" ? "devices-pane" : ""}`}
              data-session-scroll={sessionState.destination}
            >
              {renderDestination()}
            </section>
          )}
          <section
            className="surface content-pane"
            data-session-scroll="history"
            hidden={sessionState.destination !== "history"}
          >
            <div className="history-toolbar">
              <div
                className="content-filters"
                id="history-filters"
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

                <div className="source-filter-wrap">
                  <button
                    className="text-button"
                    aria-expanded={sourceMenuOpen}
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
            </div>
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
            {Object.entries(sessionState.historyActions)
              .filter(
                ([target]) => target !== "clear" && target !== "clear:refresh"
              )
              .map(
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
                const pinned = pinnedSet.has(clip.id);
                return (
                  <article
                    className={`history-card ${removingIds.has(clip.id) ? "leaving" : ""}`}
                    key={clip.id}
                    data-clip-id={clip.id}
                    aria-labelledby={`clip-preview:${clip.id}`}
                    style={{ position: "relative" }}
                  >
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
                      {clip.type === "url" && (
                        <Icon name="links" className="history-link-icon" />
                      )}
                      <span
                        id={`clip-preview:${clip.id}`}
                        className="history-text"
                      >
                        {shortenPreview(clip.content, 220)}
                      </span>
                      {pinned && (
                        <span
                          className="history-pin-marker"
                          role="img"
                          aria-label="Pinned Clip"
                        >
                          <Icon name="pin" />
                        </span>
                      )}
                    </button>

                    <div className="history-meta" title={`From: ${label}`}>
                      <MiddleEllipsisText
                        className="history-source-label"
                        text={label}
                      />
                      <span aria-hidden="true"> · </span>
                      <time
                        className="meta-time"
                        dateTime={new Date(clip.capturedAt).toISOString()}
                      >
                        {timeLabel}
                      </time>
                    </div>
                    <div className="history-actions">
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
                      <IconButton
                        icon="delete"
                        label="Delete Clip"
                        data-session-focus={`delete:${clip.id}`}
                        aria-describedby={`clip-preview:${clip.id}`}
                        disabled={
                          !identityReady ||
                          historyLoading ||
                          historyUnavailable ||
                          Boolean(historyRefreshError) ||
                          sessionState.historyActions[`delete:${clip.id}`]
                            ?.pending
                        }
                        onClick={() => handleDelete(clip.id)}
                      />
                      {sessionState.historyActions[`delete:${clip.id}`]
                        ?.pending && <span role="status">Deleting Clip…</span>}
                      {sessionState.historyActions[`copy:${clip.id}`]
                        ?.pending && <span role="status">Copying Clip…</span>}
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
            className="clip-details-dialog"
            fullOnNarrow={false}
            headerDismiss
            showCancel={false}
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
              sourceName={
                detailsClip
                  ? deviceNameMap.get(detailsClip.originPeerId) ||
                    detailsClip.originPeerId
                  : undefined
              }
              capturedAtLabel={
                detailsClip ? formatTime(detailsClip.capturedAt) : undefined
              }
              isLocal={
                identity
                  ? detailsClip?.originPeerId === identity.deviceId
                  : undefined
              }
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
              onShareNow={onShareNow ? shareNow : undefined}
              shareNowAction={sessionState.historyActions["send:current"]}
              historyDiagnostics={historyDiagnostics}
              onHistory={() => {
                session.back();
                session.update({ destination: "history" });
              }}
            />
          </TaskDialog>,
          document.body
        )}
      {pairingDiagnostics &&
        createPortal(
          <details
            className="pairing-diagnostics ui-scenario-controls"
            data-task-scenario-controls
          >
            <summary aria-label="Open navigation scenario controls">
              Pairing diagnostics
            </summary>
            {pairingDiagnostics}
          </details>,
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
            {pairingTaskDiagnostics}
            {pair.pending && <p role="status">Submitting pairing text…</p>}
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

      {activeTask?.kind === "peer-id" &&
        activeTask.entity &&
        createPortal(
          <TaskDialog
            title="Peer ID"
            pending={false}
            originKey={activeTask.origin}
            cancelLabel="Close"
            onCancel={() => {
              deviceBehavior.resetDeviceCopyFeedback();
              session.back();
            }}
          >
            <p className="peer-id-full">{activeTask.entity}</p>
            {deviceCopyFeedback && <p role="alert">{deviceCopyFeedback}</p>}
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                const id = activeTask.entity!;
                void deviceBehavior
                  .copyDeviceValue("Peer ID", id, true)
                  .then((copied) => {
                    const current = session.getSnapshot().tasks.at(-1);
                    if (
                      copied &&
                      current?.kind === "peer-id" &&
                      current.entity === id
                    )
                      session.back();
                  });
              }}
            >
              Copy peer ID
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
                          void deviceBehavior.copyDeviceValue(
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
                          void deviceBehavior.copyDeviceValue(
                            "Peer ID",
                            edit.targetId || ""
                          )
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
                          (alias
                            ? deviceBehavior.saveDeviceName
                            : deviceBehavior.saveLocalName)();
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
                  onClick={
                    alias
                      ? deviceBehavior.saveDeviceName
                      : deviceBehavior.saveLocalName
                  }
                >
                  Save {title}
                </button>
                {alias && (
                  <button
                    type="button"
                    disabled={edit.pending || !identityReady || !target}
                    onClick={deviceBehavior.restoreReportedDeviceName}
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
            {pairingTaskDiagnostics}
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
            recoveryError={clearRefreshError}
            historyReady={
              !clearNeedsRefresh &&
              !historyLoading &&
              !historyUnavailable &&
              !historyRefreshError
            }
            refreshPending={clearRefreshPending}
            onRefresh={refreshClearHistory}
            diagnostics={historyDiagnostics}
            onCancel={() => {
              if (clearPending || clearRefreshPending) return;
              setClearReviewOpen(false);
              session.complete("clear");
            }}
            onConfirm={clearAllHistory}
          />,
          document.body
        )}
    </div>
  );
}
