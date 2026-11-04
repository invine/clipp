import { createRuntimeUiRecovery } from "../../../packages/core/runtime/uiRecovery";
import type { RuntimeUiRecoveryState } from "../../../packages/core/runtime/uiRecovery";
import { createSettingsClient } from "../../../packages/core/runtime/settingsClient";
import { bindNotificationRequests } from "../../../packages/ui/src/notificationRequests";
import { createNotificationActionLifecycle } from "../../../packages/ui/src/notificationActionLifecycle";
import { createUiRuntimeStore } from "../../../packages/ui/src/runtimeAdapter";
import type { ClipboardAppProps } from "../../../packages/ui/src/ClipboardApp";
import type { UiSession } from "../../../packages/ui/src/uiSession";
import type { HostTaskInput } from "../../../packages/ui/src/hostTaskInput";
import type { AndroidAppState, createAndroidRuntime } from "./client";
import type { createAndroidPairingScanner } from "./pairingScannerHost";
import type { PairingScanOptions } from "../../../packages/ui/src/pairingScan";
import type { RuntimeNotificationAvailability } from "../../../packages/core/runtime/notifications";

export type AndroidRuntimeUiState = {
  pairingState?: { sessionId: string; revision: number };
  historyUnavailable?: boolean;
  historyRefreshError?: boolean;
};

export type AndroidRuntimeUiClient<State extends AndroidRuntimeUiState> = {
  getState(): Promise<State>;
  getInitializationError(): Promise<{ code: string } | null | undefined>;
  getRuntimeAuthority(): Promise<string>;
  onUpdate(listener: (state: State) => void): () => void;
};

/** Owns one Android UI document's startup, authoritative reads and live updates. */
export function createAndroidRuntimeUiOwner<
  State extends AndroidRuntimeUiState,
>(
  runtime: {
    start(): Promise<unknown> | unknown;
    stop(): Promise<unknown> | unknown;
  },
  client: AndroidRuntimeUiClient<State>,
  onState: (state: State) => void,
  onRecovery: (state: RuntimeUiRecoveryState) => void = () => undefined
) {
  let active = false;
  let generation = 0;
  let startup: Promise<unknown> | undefined;
  let initialLoad: Promise<boolean> | undefined;
  let shutdown: Promise<void> | undefined;
  let unsubscribe: (() => void) | undefined;
  let consumer: ReturnType<typeof createRuntimeUiRecovery<State>> | undefined;

  function owns(expected: number) {
    return active && generation === expected;
  }

  function start(): Promise<boolean> {
    if (active && consumer) return initialLoad ?? consumer.load();
    if (shutdown)
      return shutdown.then(() => {
        if (active && consumer) return initialLoad ?? consumer.load();
        return begin();
      });
    return begin();
  }

  function begin(): Promise<boolean> {
    active = true;
    const expected = ++generation;
    consumer = createRuntimeUiRecovery<State>({
      load: async () => {
        const starting = Promise.resolve(runtime.start());
        startup = starting;
        try {
          await starting;
        } finally {
          if (startup === starting) startup = undefined;
        }
        if (!owns(expected)) throw new Error("android_runtime_owner_retired");
        return client.getState();
      },
      initializationError: async () =>
        (await client.getInitializationError()) ?? null,
      version: (state) => state.pairingState,
      authority: () => client.getRuntimeAuthority(),
      confirmed: (state) =>
        !state.historyUnavailable && !state.historyRefreshError,
      onState: (state) => {
        if (owns(expected)) onState(state);
      },
      onRecovery: (state) => {
        if (owns(expected)) onRecovery(state);
      },
    });
    const current = consumer;
    unsubscribe = client.onUpdate((state) => {
      if (owns(expected)) void current.live(state);
    });
    initialLoad = current.load();
    return initialLoad;
  }

  function stop(): Promise<void> {
    if (!active && shutdown) return shutdown;
    active = false;
    generation++;
    consumer?.cancel();
    consumer = undefined;
    initialLoad = undefined;
    unsubscribe?.();
    unsubscribe = undefined;
    const waitForStartup = startup?.catch(() => undefined);
    shutdown = (async () => {
      await waitForStartup;
      await runtime.stop();
    })().finally(() => {
      shutdown = undefined;
    });
    return shutdown;
  }

  return {
    start,
    stop,
    retry: (retry?: () => Promise<void> | void) =>
      active && consumer ? consumer.load(retry) : Promise.resolve(false),
  };
}

type AndroidRuntime = Pick<
  ReturnType<typeof createAndroidRuntime>,
  "client" | "start" | "stop" | "identityReset"
>;
type AndroidScanner = ReturnType<typeof createAndroidPairingScanner>;

const initialAndroidState: AndroidAppState = {
  clips: [],
  devices: [],
  pending: [],
  waiting: [],
  pairingErrors: [],
  peers: [],
  peerConnections: [],
  relayConnections: [],
  identity: null,
  pinnedIds: [],
  relayAddresses: [],
  managedRelayConfigurations: [],
  managedRelayStates: [],
  diagnostics: { lastPairingAttempt: null },
};

const initialRecovery: RuntimeUiRecoveryState = {
  loading: true,
  unavailable: false,
  initializationError: false,
};

type AndroidNotificationControls = NonNullable<
  ClipboardAppProps["notificationControls"]
>;

export function createAndroidUiRuntimeAdapter(
  runtime: AndroidRuntime,
  session: UiSession,
  taskInput: HostTaskInput,
  pairingScanner: AndroidScanner
) {
  const client = runtime.client;
  let state = initialAndroidState;
  let recovery = initialRecovery;
  let settingsState = {
    snapshot: null,
    loading: true,
    refreshing: false,
    refreshError: null,
    recoveryRequired: false,
    pending: false,
    feedback: null,
  } as NonNullable<ClipboardAppProps["appearanceSettings"]>;
  let notificationState: RuntimeNotificationAvailability | null = null;
  let notificationPending = false;
  let notificationError = false;
  let notificationGeneration = 0;
  let removeNotificationEvents: (() => void) | undefined;
  let availabilityUnsubscribe: (() => void) | undefined;
  let requestBinding: ReturnType<typeof bindNotificationRequests> | undefined;
  let active = false;

  const settings = createSettingsClient({
    send: (message) =>
      message.type === "getSettings"
        ? client.getSettings()
        : client.setSettings(message.settings ?? {}),
    subscribe: (listener) =>
      client.onSettingsUpdate((snapshot) =>
        listener({ type: "settingsState", snapshot })
      ),
  });

  const owner = createAndroidRuntimeUiOwner(
    runtime,
    client,
    (next) => {
      state = next;
      publish();
      void requestBinding?.refresh();
    },
    (next) => {
      recovery = next;
      publish();
      void requestBinding?.refresh();
    }
  );

  const availabilityControls: AndroidNotificationControls = {
    get state() {
      return notificationState;
    },
    get pending() {
      return notificationPending;
    },
    get error() {
      return notificationError;
    },
    refresh: refreshNotificationAvailability,
    openSettings: client.openNotificationSettings
      ? () => runNotificationAction(() => client.openNotificationSettings())
      : undefined,
    requestPermission: client.requestNotificationPermission
      ? () =>
          runNotificationAction(() => client.requestNotificationPermission())
      : undefined,
  };

  const makeProps = (): ClipboardAppProps => ({
    clips: state.clips,
    devices: state.devices,
    pending: state.pending,
    waiting: state.waiting || [],
    pairingErrors: state.pairingErrors || [],
    pairingOutcomes: state.pairingState?.outcomes,
    requestsLoading: recovery.loading,
    requestsUnavailable: recovery.unavailable || !state.pairingState,
    onRetryRequests: () => owner.retry(),
    onDismissPairingOutcome: (target) =>
      state.pairingState
        ? client.dismissPairingOutcome(target, state.pairingState)
        : Promise.resolve(false),
    peers: state.peers,
    connectionStateKnown:
      state.connectionStateKnown === true && !recovery.unavailable,
    peerConnections: state.peerConnections || [],
    relayConnections: state.relayConnections || [],
    identity: state.identity,
    pinnedIds: state.pinnedIds || [],
    historyLoading: recovery.loading,
    historyUnavailable:
      !recovery.loading && (state.historyUnavailable || false),
    historyRefreshError: state.historyRefreshError
      ? "history_unavailable"
      : null,
    onRetryHistoryRefresh: () => owner.retry(),
    localRetentionMs: state.localRetentionMs,
    appearanceSettings: {
      ...settingsState,
      save: settings.save,
      refresh: settings.refresh,
    },
    autoSync: state.autoSync,
    autoSyncKnown: !recovery.loading && !recovery.unavailable,
    autoSyncLoading: recovery.loading,
    clipboardHistoryError: state.clipboardHistoryError,
    historyPolicyError: state.historyPolicyError,
    relayAddresses: state.relayAddresses || [],
    managedRelayConfigurations: state.managedRelayConfigurations || [],
    managedRelayStates: state.managedRelayStates || [],
    onRefreshManagedRelays: () => client.refreshManagedRelays(),
    onMutateManagedRelay: (mutation) => client.mutateManagedRelay(mutation),
    onManagedRelayLogin: (key) => client.loginManagedRelay(key),
    onManagedRelayAccount: (key) => client.openManagedRelayAccount(key),
    onManagedRelayRetry: (key) => client.retryManagedRelay(key),
    notificationControls: availabilityControls,
    initializationError: recovery.initializationError,
    runtimeError:
      recovery.unavailable && !recovery.initializationError
        ? "Android services could not be started or loaded."
        : null,
    onRetryRuntime: () => owner.retry(),
    identityRotationRecovery: state.identityRotationRecovery,
    identityResetState: state.identityResetState,
    manualIdentityResetAvailable: false,
    identityResetActions: runtime.identityReset,
    onPairAfterIdentityReset: () =>
      session.open({ kind: "pairing", origin: "identity-reset-complete" }),
    onCopyFormerIdentity: async (receipt) => {
      const result = await client.copyFormerIdentityPeerId(receipt.receiptId);
      if (result.status !== "copied")
        throw new Error("peer_id_copy_unconfirmed");
    },
    identityRotationNotice: state.identityRotationNotice,
    onDeleteClip: (id) => client.deleteClip(id),
    onUnpair: (id) => client.unpairDevice(id),
    onRenameDevice: (id, name) => client.renameDevice(id, name),
    onRenameIdentity: (name, expectedDeviceId) =>
      client.renameIdentity(name, expectedDeviceId),
    onAccept: (device) => client.acceptRequest(device),
    onReject: (device) => client.rejectRequest(device),
    onPairText: (text) => client.pairFromText(text),
    onScanPairingCode: (options: PairingScanOptions) =>
      pairingScanner.scan(options),
    scanCameraPermission: pairingScanner.permission,
    onRequestPairingCode: () => client.getPairingCode(),
    onCopyPairingText: (text) => client.copyPairingText(text),
    onReuseClip: (id) => client.reuseClip(id),
    onShareNow: () => client.shareCurrentClipboard(),
    onSetPinned: async (id, pinned) => {
      await client.setPinned(id, pinned);
    },
    onClearAll: async () => {
      await client.clearHistory();
      if (!(await owner.retry())) throw new Error("history_refresh_failed");
    },
    onDismissClipboardHistoryError: () => client.dismissClipboardHistoryError(),
    onRetryHistoryCleanup: () => client.retryHistoryCleanup(),
    onAcknowledgeIdentityRotationNotice: () =>
      client.acknowledgeIdentityRotationNotice(),
    onSetLocalRetention: async (retentionMs) => {
      await client.setLocalRetention(retentionMs);
    },
    onSetAutoSync: (enabled) => client.setAutoSync(enabled),
    onRetryAutoSync: () => client.refreshAutoSync(),
    backgroundContinuity: state.backgroundContinuity,
    onSetBackgroundContinuity: async (enabled) => {
      await client.setBackgroundContinuity(enabled);
    },
    onRefreshBackgroundContinuity: () => client.refreshBackgroundContinuity(),
    onOpenBackgroundNotificationSettings: () =>
      client.openBackgroundNotificationSettings(),
    onExportBackgroundContinuityDiagnostics: () =>
      client.exportBackgroundContinuityDiagnostics(),
    onRetryInitialization: () =>
      owner.retry(async () => {
        await client.retryIdentityInitialization();
      }),
    taskInput,
    session,
  });

  const uiStore = createUiRuntimeStore(makeProps());

  function publish() {
    if (active) uiStore.publish(makeProps());
  }

  async function refreshNotificationAvailability() {
    const expected = ++notificationGeneration;
    try {
      const next = await client.getNotificationAvailability();
      if (active && expected === notificationGeneration) {
        notificationState = next;
        notificationError = false;
        publish();
      }
    } catch {
      if (active && expected === notificationGeneration) {
        notificationError = true;
        publish();
      }
    }
  }

  const runNotificationAction = createNotificationActionLifecycle({
    isCurrent: () => active,
    setPending: (pending) => {
      if (active) notificationPending = pending;
    },
    setError: (error) => {
      notificationError = error;
    },
    publish,
    refresh: refreshNotificationAvailability,
  });

  function onAvailabilityChange() {
    void refreshNotificationAvailability();
  }

  function start() {
    if (active) return owner.start();
    active = true;
    availabilityUnsubscribe =
      client.onNotificationAvailabilityChanged(onAvailabilityChange);
    const returned = () => {
      if (document.visibilityState !== "hidden")
        void refreshNotificationAvailability();
    };
    window.addEventListener("focus", returned);
    document.addEventListener("visibilitychange", returned);
    removeNotificationEvents = () => {
      window.removeEventListener("focus", returned);
      document.removeEventListener("visibilitychange", returned);
    };
    requestBinding = bindNotificationRequests(client, session, () => ({
      ready:
        !recovery.loading &&
        !recovery.unavailable &&
        !!state.pairingState &&
        !!state.identity &&
        !state.identityRotationRecovery,
      clipIds: state.clips.map((clip) => clip.id),
      requestIds: state.pending.map((request) => request.deviceId),
    }));
    void settings.start((next) => {
      settingsState = next as typeof settingsState;
      publish();
    });
    void refreshNotificationAvailability();
    return owner.start();
  }

  async function stop() {
    if (!active) return;
    active = false;
    notificationGeneration++;
    removeNotificationEvents?.();
    removeNotificationEvents = undefined;
    availabilityUnsubscribe?.();
    availabilityUnsubscribe = undefined;
    requestBinding?.dispose();
    requestBinding = undefined;
    settings.stop();
    await owner.stop();
  }

  return {
    ...uiStore,
    start: async () => {
      await start();
    },
    stop,
    getAndroidState: () => state,
    retry: owner.retry,
  };
}
