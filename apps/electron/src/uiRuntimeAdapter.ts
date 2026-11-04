import type { RuntimeNotificationAvailability } from "../../../packages/core/runtime/notifications";
import { createSettingsClient } from "../../../packages/core/runtime/settingsClient";
import {
  createRuntimeUiRecovery,
  initialRuntimeUiRecovery,
} from "../../../packages/core/runtime/uiRecovery.js";
import type {
  UiRuntimeActions,
  UiRuntimeAdapter,
  UiRuntimeSnapshot,
} from "../../../packages/ui/src/runtimeAdapter";
import { createUiRuntimeStore } from "../../../packages/ui/src/runtimeAdapter";
import type { ClipboardAppProps } from "../../../packages/ui/src/ClipboardApp";
import { bindNotificationRequests } from "../../../packages/ui/src/notificationRequests";
import { createNotificationActionLifecycle } from "../../../packages/ui/src/notificationActionLifecycle";
import type { UiSession } from "../../../packages/ui/src/uiSession";
import { bindElectronHostTaskInput } from "./hostTaskInput";

type ElectronBridge = NonNullable<Window["clipp"]> & {
  openNotificationSettings?: () => Promise<void>;
  requestNotificationPermission?: () => Promise<RuntimeNotificationAvailability>;
};
type RuntimeState = Awaited<ReturnType<ElectronBridge["getState"]>>;

const emptyState = {
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
} as RuntimeState;

/** Owns Electron observations and effects for one mounted shared workspace. */
export function createElectronUiRuntimeAdapter(
  bridge: ElectronBridge,
  session: UiSession
): UiRuntimeAdapter {
  let state: RuntimeState = emptyState;
  let recovery = initialRuntimeUiRecovery;
  let notificationState: RuntimeNotificationAvailability | null = null;
  let notificationPending = false;
  let notificationError = false;
  let notificationGeneration = 0;
  let started = false;
  let unsubscribeUpdate: (() => void) | undefined;
  let unsubscribeLog: (() => void) | undefined;
  let unsubscribeNotifications: (() => void) | undefined;
  let unsubscribeVisibility: (() => void) | undefined;
  let unbindTaskInput: (() => void) | undefined;
  let notificationConsumer:
    ReturnType<typeof bindNotificationRequests> | undefined;

  const settings = createSettingsClient({
    send: (message) =>
      message.type === "getSettings"
        ? bridge.getSettings()
        : bridge.setSettings(message.settings),
    subscribe: (listener) =>
      bridge.onSettingsUpdate((snapshot) =>
        listener({ type: "settingsState", snapshot })
      ),
  });
  const recoveryOwner = createRuntimeUiRecovery<RuntimeState>({
    load: () => bridge.getState(),
    initializationError: async () =>
      (await bridge.getInitializationError?.()) ?? null,
    version: (value) => value.pairingState,
    authority: () => bridge.getRuntimeAuthority(),
    confirmed: (value) =>
      !value.historyUnavailable && !value.historyRefreshError,
    onState: (value) => {
      state = value;
      publish();
    },
    onRecovery: (value) => {
      recovery = value;
      publish();
    },
  });

  const refreshNotifications = async () => {
    const requestGeneration = ++notificationGeneration;
    try {
      const next = await bridge.getNotificationAvailability();
      if (started && requestGeneration === notificationGeneration) {
        notificationState = next;
        notificationError = false;
        publish();
      }
    } catch {
      if (started && requestGeneration === notificationGeneration) {
        notificationError = true;
        publish();
      }
    }
  };
  const performNotificationAction = createNotificationActionLifecycle({
    isCurrent: () => started,
    setPending: (pending) => {
      notificationPending = pending;
    },
    setError: (error) => {
      notificationError = error;
    },
    publish,
    refresh: refreshNotifications,
  });

  const actions: UiRuntimeActions = {
    onRetryRequests: () => recoveryOwner.load(),
    onDismissPairingOutcome: (targetPeerId) =>
      state.pairingState
        ? bridge.dismissPairingOutcome(targetPeerId, state.pairingState)
        : Promise.resolve(false),
    onRetryHistoryRefresh: () => recoveryOwner.load(),
    onRetryRuntime: () => recoveryOwner.load(),
    onDeleteClip: (id) => bridge.deleteClip(id),
    onUnpair: (id) => bridge.unpairDevice(id),
    onRenameDevice: (id, name) => bridge.renameDevice(id, name),
    onAccept: (device) => bridge.acceptRequest(device),
    onReject: (device) => bridge.rejectRequest(device),
    onPairText: (text) => bridge.pairFromText(text),
    onRequestPairingCode: () => bridge.openQrWindow(),
    onCopyPairingText: (text) => bridge.copyPairingText(text),
    onReuseClip: async (id) => (await bridge.reuseClip(id)).outcome,
    onShareNow: () => bridge.shareNow(),
    onSetPinned: (id, pinned) => bridge.setPinned(id, pinned),
    onClearAll: async () => {
      await bridge.clearHistory();
      if (!(await recoveryOwner.load()))
        throw new Error("history_refresh_failed");
    },
    onDismissClipboardHistoryError: () => bridge.dismissClipboardHistoryError(),
    onRetryHistoryCleanup: () => bridge.retryHistoryCleanup(),
    onAcknowledgeIdentityRotationNotice: () =>
      bridge.acknowledgeIdentityRotationNotice(),
    onSetLocalRetention: (retentionMs) => bridge.setLocalRetention(retentionMs),
    onSaveAppearanceSettings: async (patch) => {
      await settings.save(patch);
    },
    onRefreshAppearanceSettings: () => settings.refresh(),
    onSetAutoSync: (enabled) => bridge.setAutoSync(enabled),
    onRetryAutoSync: () => bridge.refreshAutoSync(),
    onRenameIdentity: (name, expectedDeviceId) =>
      bridge.renameIdentity(name, expectedDeviceId),
    onRetryInitialization: () =>
      recoveryOwner.load(() => bridge.retryIdentityInitialization()),
    onRefreshManagedRelays: () => bridge.refreshManagedRelays(),
    onMutateManagedRelay: (mutation) => bridge.mutateManagedRelay(mutation),
    onManagedRelayLogin: (key) => bridge.managedRelayLogin(key),
    onManagedRelayAccount: (key) => bridge.managedRelayAccount(key),
    onManagedRelayRetry: (key) => bridge.managedRelayRetry(key),
    onPairAfterIdentityReset: () =>
      session.open({ kind: "pairing", origin: "identity-reset-complete" }),
    onCopyFormerIdentity: async (receipt) => {
      const result = await bridge.identityReset.copyFormerPeerId(
        receipt.receiptId
      );
      if (result.status !== "copied")
        throw new Error("peer_id_copy_unconfirmed");
    },
    identityResetActions: bridge.identityReset,
  };

  const projectSnapshot = (): UiRuntimeSnapshot =>
    ({
      clips: state.clips,
      devices: state.devices,
      pending: state.pending,
      waiting: state.waiting,
      pairingErrors: state.pairingErrors,
      pairingOutcomes: state.pairingState?.outcomes,
      requestsLoading: recovery.loading,
      requestsUnavailable: recovery.unavailable || !state.pairingState,
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
      localRetentionMs: state.localRetentionMs,
      appearanceSettings: settings.getState(),
      autoSync: state.autoSync,
      autoSyncKnown: !recovery.loading && !recovery.unavailable,
      autoSyncLoading: recovery.loading,
      clipboardHistoryError: state.clipboardHistoryError,
      historyPolicyError: state.historyPolicyError,
      relayAddresses: state.relayAddresses || [],
      managedRelayConfigurations: state.managedRelayConfigurations || [],
      managedRelayStates: state.managedRelayStates || [],
      initializationError: recovery.initializationError,
      runtimeError:
        recovery.unavailable && !recovery.initializationError
          ? "Runtime state could not be loaded."
          : null,
      identityRotationRecovery: state.identityRotationRecovery,
      identityRotationNotice: state.identityRotationNotice,
      identityResetState: state.identityResetState,
      manualIdentityResetAvailable: false,
      notificationControls: {
        state: notificationState,
        pending: notificationPending,
        error: notificationError,
        refresh: refreshNotifications,
        openSettings: bridge.openNotificationSettings
          ? () =>
              performNotificationAction(() =>
                bridge.openNotificationSettings!()
              )
          : undefined,
        requestPermission: bridge.requestNotificationPermission
          ? () =>
              performNotificationAction(() =>
                bridge.requestNotificationPermission!()
              )
          : undefined,
      },
    }) as UiRuntimeSnapshot;

  const makeProps = (): ClipboardAppProps =>
    ({
      ...projectSnapshot(),
      ...actions,
      session,
    }) as ClipboardAppProps;
  const store = createUiRuntimeStore(makeProps());

  function publish() {
    store.publish(makeProps());
    if (started) void notificationConsumer?.refresh();
  }

  return {
    getSnapshot: store.getSnapshot,
    subscribe: store.subscribe,
    actions: store.actions,
    capabilities: store.capabilities,
    async start() {
      if (started) return;
      started = true;
      unsubscribeUpdate = bridge.onUpdate((next) => recoveryOwner.live(next));
      unsubscribeLog = bridge.onLog?.((payload) => {
        const { level, message, data } = payload || {};
        const fn =
          level === "warn"
            ? console.warn
            : level === "error"
              ? console.error
              : console.info;
        fn(`[clipp:${level || "info"}] ${message || ""}`, data || "");
      });
      unbindTaskInput = bindElectronHostTaskInput(bridge, session);
      notificationConsumer = bindNotificationRequests(bridge, session, () => ({
        ready:
          !recovery.loading &&
          !recovery.unavailable &&
          !!state.pairingState &&
          !!state.identity &&
          !state.identityRotationRecovery,
        clipIds: state.clips.map((clip) => clip.id),
        requestIds: state.pending.map((request) => request.deviceId),
      }));
      unsubscribeNotifications = bridge.onNotificationAvailabilityChanged?.(
        () => void refreshNotifications()
      );
      const doc = typeof document === "undefined" ? undefined : document;
      const view = typeof window === "undefined" ? undefined : window;
      const returned = () => {
        if (doc?.visibilityState !== "hidden") void refreshNotifications();
      };
      view?.addEventListener("focus", returned);
      doc?.addEventListener("visibilitychange", returned);
      unsubscribeVisibility = () => {
        view?.removeEventListener("focus", returned);
        doc?.removeEventListener("visibilitychange", returned);
      };
      void settings.start(() => publish());
      void refreshNotifications();
      await recoveryOwner.load();
    },
    stop() {
      if (!started) return;
      started = false;
      notificationGeneration++;
      recoveryOwner.cancel();
      settings.stop();
      notificationConsumer?.dispose();
      notificationConsumer = undefined;
      unsubscribeUpdate?.();
      unsubscribeUpdate = undefined;
      unsubscribeLog?.();
      unsubscribeLog = undefined;
      unsubscribeNotifications?.();
      unsubscribeNotifications = undefined;
      unsubscribeVisibility?.();
      unsubscribeVisibility = undefined;
      unbindTaskInput?.();
      unbindTaskInput = undefined;
    },
  };
}
