/// <reference types="chrome" />
import type {
  UiRuntimeAdapter,
  UiRuntimeSnapshot,
  UiRuntimeActions,
  UiHostEffects,
} from "../../../packages/ui/src/runtimeAdapter";
import { browserUiHost } from "../../../packages/ui/src/runtimeAdapter";
import { createExtensionUiControls } from "./extensionUiControls";
import type { UiSession } from "../../../packages/ui/src/uiSession";
import {
  createRuntimeUiRecovery,
  initialRuntimeUiRecovery,
} from "../../../packages/core/runtime/uiRecovery";
import {
  readExtensionRecoveryState,
  readExtensionRuntimeAuthority,
  probeExtensionInitialization,
  retryExtensionInitialization,
  type ExtensionRecoveryState,
} from "./runtimeRecovery";
import {
  bindManagementPage,
  connectManagementPage,
  type ManagementAuthority,
} from "./managementPage";
import { createManagementNavigationConsumer } from "./managementNavigationConsumer";
import { createPopupCapture, type PopupCaptureState } from "./popupCapture";
import { createHistoryClient } from "./historyClient";
import { createPopupNameState } from "./popupNameState";
import {
  renameExtensionDevice,
  renameExtensionIdentity,
} from "./renameActions";
import {
  submitExtensionPairing,
  dismissExtensionPairingOutcome,
  decideExtensionPairing,
} from "./pairingActions";
import { createPairingCode } from "../../../packages/core/pairing/qrCode";
import { copyPayloadText } from "../../../packages/core/clipboard/payloadCopy";
import { reuseExtensionClip } from "./reuseActions";
import { shareCurrentPopupClipboard } from "./popupClipboardActions";
import type {
  Device,
  Identity,
  PendingRequest,
  PairingWaiting,
  PairingError,
  PeerConnectionInfo,
  ClipboardHistoryError,
  HistoryPolicyError,
  PairingCode,
} from "../../../packages/ui/src/types";
import type { IdentityRotationNoticeReason } from "../../../packages/ui/src/identityRotationNotice";
import type {
  RelayConfiguration,
  RelayState,
} from "../../../packages/core/network/managedRelays";
import type { RelayMutationResult } from "../../../packages/core/network/relayMutations";
import type { RelayActionResult } from "../../../packages/core/network/relayActions";
import type {
  IdentityResetResult,
  IdentityResetState,
} from "../../../packages/core/trust/manualIdentityReset";
import type { ManualIdentityResetActions } from "../../../packages/ui/src/ManualIdentityResetSettings";

export type ExtensionUiOptions = {
  runtime: typeof chrome.runtime;
  surface: "popup" | "page";
  session: UiSession;
  clipboard: {
    readText(): Promise<string>;
    writeText(text: string): Promise<void>;
  };
  host?: UiHostEffects;
  focus: { hasFocus(): boolean; subscribe(listener: () => void): () => void };
  subscribeReturn?: (listener: () => void) => () => void;
  poll?: (listener: () => void) => () => void;
};
function pollRuntime(listener: () => void) {
  const timer = setInterval(listener, 5000);
  return () => clearInterval(timer);
}
function subscribeBrowserReturn(listener: () => void) {
  const returned = () => {
    if (document.visibilityState !== "hidden") listener();
  };
  window.addEventListener("focus", returned);
  document.addEventListener("visibilitychange", returned);
  return () => {
    window.removeEventListener("focus", returned);
    document.removeEventListener("visibilitychange", returned);
  };
}
export function createExtensionUiAdapter(
  options: ExtensionUiOptions
): UiRuntimeAdapter & {
  readonly navigation: ReturnType<typeof createManagementNavigationConsumer>;
  importPairing(text: string): Promise<void>;
} {
  const { runtime, surface, session, clipboard } = options;
  let active = false;
  let generation = 0;
  let cleanup: (() => void)[] = [];
  const listeners = new Set<() => void>();
  const authorityListeners = new Set<() => void>();
  let devices: Device[] = [],
    pending: PendingRequest[] = [],
    waiting: PairingWaiting[] = [];
  let pairingState: ExtensionRecoveryState["pairingState"];
  let pairingErrors: PairingError[] = [],
    peers: string[] = [];
  let connectionStateKnown = false;
  let peerConnections: PeerConnectionInfo[] = [];
  let identity: Identity | null = null;
  let clipboardHistoryError: ClipboardHistoryError | null = null;
  let historyPolicyError: HistoryPolicyError | null = null;
  let recovery = initialRuntimeUiRecovery;
  let identityRotationRecovery = false;
  let identityRotationNotice: IdentityRotationNoticeReason | null = null;
  let identityResetState: IdentityResetState | undefined;
  let managedRelayConfigurations: RelayConfiguration[] = [];
  let managedRelayStates: RelayState[] = [];
  let popupCapture: PopupCaptureState = { pending: false, error: null };
  let capture: ReturnType<typeof createPopupCapture> | undefined;
  let consumer:
    | ReturnType<typeof createRuntimeUiRecovery<ExtensionRecoveryState>>
    | undefined;
  let managementNavigation = createManagementNavigationConsumer(
    runtime,
    session
  );
  let stopNavigation: (() => void) | undefined;
  const load = (retry?: () => Promise<void> | void) =>
    consumer?.load(retry) ?? Promise.resolve(false);
  const nameState = createPopupNameState<Identity, Device>(
    (value) => {
      identity = value;
    },
    (value) => {
      devices = value;
    }
  );
  function request<Result>(message: unknown): Promise<Result> {
    return new Promise((resolve, reject) => {
      try {
        runtime.sendMessage(message, (response) => {
          const error = runtime.lastError;
          if (error) reject(new Error(error.message ?? "runtime_unavailable"));
          else resolve(response as Result);
        });
      } catch (error) {
        reject(error);
      }
    });
  }
  const messagePort = {
    send: (message: unknown) => request(message),
    subscribe: (listener: (message: unknown) => void) => {
      runtime.onMessage.addListener(listener);
      return () => runtime.onMessage.removeListener(listener);
    },
  };
  const historyClient = createHistoryClient(messagePort);
  let history = { ...historyClient.getState(), refresh: historyClient.refresh };
  const controls = createExtensionUiControls({
    settings: messagePort,
    notifications: {
      async getNotificationAvailability() {
        const response = await request<{
          ok: boolean;
          state?: import("../../../packages/core/runtime/notifications").RuntimeNotificationAvailability;
        }>({ type: "getNotificationAvailability" });
        if (!response?.ok || !response.state)
          throw new Error("notification_availability_unavailable");
        return response.state;
      },
      async openNotificationSettings() {
        const response = await request<{ ok: boolean }>({
          type: "openNotificationSettings",
        });
        if (!response?.ok) throw new Error("notification_settings_unavailable");
      },
    },
    subscribeReturn: options.subscribeReturn ?? subscribeBrowserReturn,
    changed: () => publish(),
  });
  function authority(): ManagementAuthority {
    const settings = controls.getAppearance();
    return {
      identityId: identity?.deviceId,
      ready:
        !!identity &&
        !!pairingState &&
        !recovery.loading &&
        !recovery.unavailable &&
        !recovery.initializationError &&
        !identityRotationRecovery &&
        !history.refreshError &&
        !settings.refreshError &&
        history.snapshot !== null &&
        !history.loading &&
        settings.snapshot !== null,
      clipIds: history.snapshot?.clips.map((clip) => clip.id) ?? [],
      requestIds: pending.map((entry) => entry.deviceId),
    };
  }
  function project(): UiRuntimeSnapshot {
    return {
      identityResetState: identityResetState,
      manualIdentityResetAvailable: false,
      notificationControls: controls.getNotifications(),
      clips: history.snapshot?.clips ?? [],
      devices: devices,
      pending: pending,
      requestsLoading: recovery.loading,
      requestsUnavailable: recovery.unavailable || !pairingState,
      waiting: waiting,
      pairingErrors: pairingErrors,
      pairingOutcomes: pairingState?.outcomes,
      peers: peers,
      connectionStateKnown: connectionStateKnown && !recovery.unavailable,
      peerConnections: peerConnections,
      identity: identity,
      pinnedIds: history.snapshot?.pinnedIds ?? [],
      historyLoading: history.loading,
      historyUnavailable: history.snapshot === null && !history.loading,
      historyRefreshError: history.refreshError,
      localRetentionMs:
        controls.getAppearance().snapshot?.state.localRetentionMs,
      appearanceSettings: controls.getAppearance(),
      autoSync: controls.getAppearance().snapshot?.state.autoSync,
      autoSyncKnown: controls.getAppearance().snapshot !== null,
      autoSyncLoading: controls.getAppearance().loading,
      autoSyncRefreshing: controls.getAppearance().refreshing,
      autoSyncPending: controls.getAppearance().pending,
      autoSyncRecoveryRequired: controls.getAppearance().recoveryRequired,
      autoSyncRefreshError: controls.getAppearance().refreshError,
      autoSyncFeedback: controls
        .getAppearance()
        .feedback?.fields?.includes("autoSync")
        ? controls.getAppearance().feedback
        : null,
      popupCapture: surface === "popup" ? popupCapture : undefined,
      clipboardHistoryError: clipboardHistoryError,
      historyPolicyError: historyPolicyError,
      initializationError: recovery.initializationError,
      runtimeError:
        recovery.unavailable && !recovery.initializationError
          ? "The extension runtime could not be loaded."
          : null,
      identityRotationRecovery: identityRotationRecovery,
      identityRotationNotice: identityRotationNotice,
      managedRelayConfigurations: managedRelayConfigurations,
      managedRelayStates: managedRelayStates,
    };
  }
  let snapshot = project();
  function publish() {
    if (!active) return;
    snapshot = project();
    listeners.forEach((listener) => listener());
    authorityListeners.forEach((listener) => listener());
  }
  function applyRuntime(state: ExtensionRecoveryState) {
    const previousIdentity = identity?.deviceId;
    nameState.publish(state);
    pending = state.pending ?? [];
    waiting = state.waiting ?? [];
    pairingErrors = state.pairingErrors ?? [];
    pairingState = state.pairingState;
    connectionStateKnown = state.connectionStateKnown === true;
    peers = state.peers ?? [];
    peerConnections = state.peerConnections ?? [];
    clipboardHistoryError = state.clipboardHistoryError ?? null;
    historyPolicyError = state.historyPolicyError ?? null;
    identityRotationRecovery = state.identityRotationRecovery === true;
    identityRotationNotice =
      state.identityRotationNotice === "revoked" ||
      state.identityRotationNotice === "identity-loss"
        ? state.identityRotationNotice
        : null;
    managedRelayConfigurations = state.managedRelayConfigurations ?? [];
    managedRelayStates = state.managedRelayStates ?? [];
    if (previousIdentity !== identity?.deviceId) {
      stopNavigation?.();
      managementNavigation = createManagementNavigationConsumer(
        runtime,
        session
      );
      stopNavigation = managementNavigation.start();
    }
    publish();
  }
  async function identityResetRequest(message: Record<string, unknown>) {
    const expected = generation;
    const response = await request<{
      ok: boolean;
      error?: string;
      text?: string;
      state?: IdentityResetState;
      result?: IdentityResetResult;
    }>(message);
    if (!response?.ok)
      throw new Error(response?.error ?? "identity_reset_unavailable");
    if (active && generation === expected) {
      if (response.state) identityResetState = response.state;
      if (
        response.result &&
        "state" in response.result &&
        response.result.state
      )
        identityResetState = response.result.state;
      publish();
    }
    return response;
  }
  const identityResetActions: ManualIdentityResetActions | undefined =
    surface === "page"
      ? {
          begin: async (value) =>
            (
              await identityResetRequest({
                type: "identityResetBegin",
                ...value,
              })
            ).result!,
          reconcile: async () =>
            (await identityResetRequest({ type: "identityResetReconcile" }))
              .state!,
          resume: async (value) =>
            (
              await identityResetRequest({
                type: "identityResetResume",
                ...value,
              })
            ).result!,
          dismiss: async (receiptId) =>
            (
              await identityResetRequest({
                type: "identityResetDismiss",
                receiptId,
              })
            ).state!,
        }
      : undefined;
  async function runHistoryOperation<
    Result extends { ok: true } = { ok: true },
  >(message: Record<string, unknown>): Promise<Result> {
    const response = await request<Result & { error?: string }>(message);
    if (!response?.ok)
      throw new Error(response?.error ?? "history_operation_failed");
    return response;
  }
  async function relayAction<Result extends { ok: true } = { ok: true }>(
    message: Record<string, unknown>
  ): Promise<Result> {
    const response = await request<Result & { error?: string }>(message);
    if (!response?.ok)
      throw new Error(response?.error ?? "relay_action_failed");
    return response;
  }
  async function handleDeleteClip(id: string) {
    await runHistoryOperation({ type: "deleteClip", id });
    await history.refresh();
  }
  async function handleUnpair(id: string) {
    const expected = generation,
      revision = nameState.revision();
    await runHistoryOperation({ type: "revokeDevice", id });
    if (
      active &&
      generation === expected &&
      revision === nameState.revision()
    ) {
      devices = devices.filter((device) => device.deviceId !== id);
      publish();
    }
  }
  async function handleRenameDevice(
    id: string,
    name: string
  ): Promise<Device | null> {
    const expected = generation,
      revision = nameState.revision();
    const device = await renameExtensionDevice(runtime, id, name);
    if (
      active &&
      generation === expected &&
      revision === nameState.revision()
    ) {
      devices = devices.map((candidate) =>
        candidate.deviceId === id ? device : candidate
      );
      publish();
    }
    return device;
  }
  async function handleRenameIdentity(
    name: string,
    expectedDeviceId: string
  ): Promise<Identity | null> {
    const expected = generation,
      revision = nameState.revision();
    const updated = await renameExtensionIdentity(
      runtime,
      name,
      expectedDeviceId
    );
    if (active && generation === expected) {
      nameState.readIdentity(revision, updated);
      publish();
    }
    return updated;
  }
  async function handlePairingText(text: string) {
    const expected = generation;
    const result = await submitExtensionPairing(runtime, text);
    if (active && expected === generation) void load();
    return result;
  }
  async function handleDecision(device: PendingRequest, accepted: boolean) {
    const expected = generation;
    const result = await decideExtensionPairing(runtime, device, accepted);
    if (active && expected === generation) void load();
    return result;
  }
  async function handleRequestPairingCode(): Promise<PairingCode | null> {
    const response = await request<{ text?: string }>({
      type: "getPairingTarget",
    });
    return response?.text ? createPairingCode(response.text) : null;
  }
  const actions: UiRuntimeActions = {
    identityResetActions: identityResetActions,
    onPairAfterIdentityReset: () =>
      session.open({ kind: "pairing", origin: "identity-reset-complete" }),
    onCopyFormerIdentity: async (receipt) => {
      const authorized = await identityResetRequest({
        type: "identityResetCopyFormerPeerId",
        receiptId: receipt.receiptId,
      });
      if (authorized.text !== receipt.formerPeerId)
        throw new Error("identity_reset_receipt_changed");
      const result = await copyPayloadText(authorized.text, (text) =>
        clipboard.writeText(text)
      );
      if (result.status !== "copied")
        throw new Error("peer_id_copy_unconfirmed");
    },
    onInspectClip:
      surface === "popup"
        ? (id) =>
            managementNavigation.open({ kind: "clip-details", entity: id })
        : undefined,
    onRetryRequests: () => load(),
    onDismissPairingOutcome: (target) =>
      pairingState
        ? dismissExtensionPairingOutcome(runtime, target, pairingState)
        : Promise.resolve(false),
    onRetryHistoryRefresh: history.refresh,
    onRetryAutoSync: controls.settings.refresh,
    onRetryPopupCapture:
      surface === "popup"
        ? () => capture?.retry() ?? Promise.resolve(false)
        : undefined,
    onRetryRuntime: () => load(),
    onRefreshManagedRelays: async () =>
      (
        await relayAction<{
          ok: true;
          configurations: RelayConfiguration[];
        }>({ type: "managedRelayRefresh" })
      ).configurations,
    onMutateManagedRelay: async (mutation) => {
      const response = await relayAction<{
        ok: true;
        result: RelayMutationResult;
      }>({ type: "managedRelayMutate", mutation });
      return response.result;
    },
    onManagedRelayLogin: async (key) =>
      (
        await relayAction<{ ok: true; result: RelayActionResult }>({
          type: "managedRelayLogin",
          key,
        })
      ).result,
    onManagedRelayAccount: async (key) =>
      (
        await relayAction<{ ok: true; result: RelayActionResult }>({
          type: "managedRelayAccount",
          key,
        })
      ).result,
    onManagedRelayRetry: async (key) =>
      (
        await relayAction<{ ok: true; result: RelayActionResult }>({
          type: "managedRelayRetry",
          key,
        })
      ).result,
    onDeleteClip: handleDeleteClip,
    onUnpair: handleUnpair,
    onRenameDevice: handleRenameDevice,
    onAccept: (dev) => handleDecision(dev, true),
    onReject: (dev) => handleDecision(dev, false),
    onPairText: handlePairingText,
    onRequestPairingCode: handleRequestPairingCode,
    onCopyPairingText: (text) =>
      copyPayloadText(text, (value) => clipboard.writeText(value)),
    onReuseClip: (id) => reuseExtensionClip(runtime, id),
    onShareNow:
      surface === "popup"
        ? async () => {
            await shareCurrentPopupClipboard(
              () => clipboard.readText(),
              async (text) => {
                await runHistoryOperation({ type: "shareNow", text });
              }
            );
          }
        : undefined,
    onSetPinned: async (id, pinned) => {
      await runHistoryOperation({
        type: "setPin",
        id,
        pinned,
      });
      await history.refresh();
    },
    onClearAll: async () => {
      let clearError: unknown;
      try {
        await runHistoryOperation({ type: "clearHistory" });
      } catch (error) {
        clearError = error;
      }
      const refreshed = await history.refresh();
      if (clearError) throw clearError;
      if (!refreshed) throw new Error("history_refresh_failed");
    },
    onSetLocalRetention: async (retentionMs) => {
      await controls.settings.save({ localRetentionMs: retentionMs });
    },
    onSetAutoSync: async (enabled) => {
      await controls.settings.save({ autoSync: enabled });
    },
    onDismissClipboardHistoryError: async () => {
      await runHistoryOperation({ type: "dismissClipboardHistoryError" });
      await load();
    },
    onRetryHistoryCleanup: async () => {
      await runHistoryOperation({ type: "retryHistoryCleanup" });
    },
    onAcknowledgeIdentityRotationNotice: async () => {
      await runHistoryOperation({
        type: "acknowledgeIdentityRotationNotice",
      });
      await load();
    },
    onRenameIdentity: handleRenameIdentity,
    onRetryInitialization: () =>
      load(() => retryExtensionInitialization(runtime)),
  };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    actions,
    host: options.host ?? {
      ...browserUiHost,
      copyText: (text) => clipboard.writeText(text),
    },
    get navigation() {
      return managementNavigation;
    },
    async importPairing(text) {
      if (!authority().ready)
        throw new Error(
          "Pairing is unavailable until Clipp has refreshed its current state. Retry the import after recovery."
        );
      session.pairing.change(text);
      await session.pairing.submit(handlePairingText);
    },
    start() {
      if (active) return;
      active = true;
      const expected = ++generation;
      recovery = initialRuntimeUiRecovery;
      const owner = createRuntimeUiRecovery<ExtensionRecoveryState>({
        load: () => readExtensionRecoveryState(runtime),
        initializationError: () => probeExtensionInitialization(runtime),
        version: (value) => value.pairingState,
        authority: () => readExtensionRuntimeAuthority(runtime),
        onState: applyRuntime,
        onRecovery: (value) => {
          recovery = value;
          publish();
        },
      });
      consumer = owner;
      const handler = (message: {
        type?: string;
        device?: PendingRequest;
        state?: unknown;
      }) => {
        if (!active || expected !== generation) return;
        if (
          message.type === "trustRequest" &&
          message.device &&
          !pending.some((value) => value.deviceId === message.device!.deviceId)
        ) {
          pending = [...pending, message.device];
          publish();
        }
        if (message.type === "runtimeState" && message.state)
          owner.live(message.state as ExtensionRecoveryState);
        if (message.type === "identityResetStateChanged" && message.state) {
          identityResetState = message.state as IdentityResetState;
          publish();
        }
      };
      runtime.onMessage.addListener(handler);
      cleanup.push(() => runtime.onMessage.removeListener(handler));
      cleanup.push((options.poll ?? pollRuntime)(() => void owner.load()));
      stopNavigation = managementNavigation.start();
      controls.start();
      void historyClient.start((value) => {
        if (!active || expected !== generation) return;
        history = { ...value, refresh: historyClient.refresh };
        publish();
      });
      if (surface === "page") {
        cleanup.push(
          bindManagementPage({
            connect: () => connectManagementPage(runtime),
            session,
            authority,
            subscribeAuthority: (listener) => {
              authorityListeners.add(listener);
              return () => {
                authorityListeners.delete(listener);
              };
            },
          })
        );
        void identityResetRequest({ type: "identityResetRead" }).catch(
          () => {}
        );
      } else {
        capture = createPopupCapture({
          hasFocus: options.focus.hasFocus,
          subscribeFocus: options.focus.subscribe,
          readText: () => clipboard.readText(),
          runtime,
          onState: (value) => {
            if (active && expected === generation) {
              popupCapture = value;
              publish();
            }
          },
        });
        capture.start();
      }
      publish();
      void owner.load();
    },
    stop() {
      if (!active) return;
      active = false;
      generation++;
      consumer?.cancel();
      consumer = undefined;
      capture?.dispose();
      capture = undefined;
      stopNavigation?.();
      stopNavigation = undefined;
      historyClient.stop();
      controls.stop();
      for (const remove of cleanup.splice(0).reverse()) remove();
    },
  };
}

/** Browser-only composition; tests and scenarios supply explicit host effects. */
export function createExtensionBrowserUiAdapter(
  surface: "popup" | "page",
  session: UiSession
) {
  return createExtensionUiAdapter({
    runtime: chrome.runtime,
    surface,
    session,
    clipboard: {
      readText: () => navigator.clipboard.readText(),
      writeText: (text) => navigator.clipboard.writeText(text),
    },
    focus: {
      hasFocus: () => document.hasFocus(),
      subscribe: (listener) => {
        window.addEventListener("focus", listener);
        return () => window.removeEventListener("focus", listener);
      },
    },
  });
}
