import { useNotificationAvailability } from "../../../packages/ui/src/useNotificationAvailability";
import type { RuntimeNotificationAvailability } from "../../../packages/core/runtime/notifications";
import { reuseExtensionClip } from "./reuseActions";
/// <reference types="chrome" />
import { QRScanner } from "./components/QRScanner";
import { createUiSession } from "../../../packages/ui/src/uiSession";
import {
  bindManagementPage,
  connectManagementPage,
  type ManagementAuthority,
} from "./managementPage";
import { ManagementNavigationView } from "./ManagementNavigation";
import { createManagementNavigationConsumer } from "./managementNavigationConsumer";
import { createPopupCapture, type PopupCaptureState } from "./popupCapture";
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
import type { RelayMutationResult } from "../../../packages/core/network/relayMutations";
import type { RelayActionResult } from "../../../packages/core/network/relayActions";
import { copyPayloadText } from "../../../packages/core/clipboard/payloadCopy";
import {
  submitExtensionPairing,
  dismissExtensionPairingOutcome,
  decideExtensionPairing,
} from "./pairingActions";
/* global chrome */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPairingCode } from "../../../packages/core/pairing/qrCode";
import {
  ClipboardHistoryError,
  Device,
  HistoryPolicyError,
  Identity,
  IdentityRotationNoticeReason,
  PairingCode,
  PairingError,
  PairingWaiting,
  PeerConnectionInfo,
  PendingRequest,
} from "../../../packages/ui";
import { ClipboardApp } from "../../../packages/ui/src/ClipboardApp";

import { shareCurrentPopupClipboard } from "./popupClipboardActions";
import type {
  RelayConfiguration,
  RelayState,
} from "../../../packages/core/network/managedRelays";
import { useSettings } from "./useSettings";
import {
  renameExtensionDevice,
  renameExtensionIdentity,
} from "./renameActions";
import { useHistory } from "./useHistory";
import { createPopupNameState } from "./popupNameState";
import type { IdentityResetResult, IdentityResetState } from "../../../packages/core/trust/manualIdentityReset";
import type { ManualIdentityResetActions } from "../../../packages/ui/src/ManualIdentityResetSettings";

function identityRotationNoticeReason(
  value: unknown
): IdentityRotationNoticeReason | null {
  return value === "revoked" || value === "identity-loss" ? value : null;
}

export const ExtensionApp = ({ surface }: { surface: "popup" | "page" }) => {
  const [session] = useState(createUiSession);
  const [notificationBridge] = useState(() => ({
    async getNotificationAvailability(): Promise<RuntimeNotificationAvailability> {
      const response = await chrome.runtime.sendMessage({
        type: "getNotificationAvailability",
      });
      if (!response?.ok || !response.state)
        throw new Error("notification_availability_unavailable");
      return response.state;
    },
    async openNotificationSettings() {
      const response = await chrome.runtime.sendMessage({
        type: "openNotificationSettings",
      });
      if (!response?.ok) throw new Error("notification_settings_unavailable");
    },
  }));
  const notificationControls = useNotificationAvailability(notificationBridge);
  const ownerAlive = useRef(true);
  useEffect(() => {
    ownerAlive.current = true;
    return () => {
      ownerAlive.current = false;
    };
  }, []);
  const authority = useRef<ManagementAuthority>({
    ready: false,
    clipIds: [],
    requestIds: [],
  });
  const authorityListeners = useRef(new Set<() => void>());
  const history = useHistory();
  const [devices, setDevices] = useState<Device[]>([]);
  const [pending, setPending] = useState<PendingRequest[]>([]);
  const [waiting, setWaiting] = useState<PairingWaiting[]>([]);
  const [pairingState, setPairingState] =
    useState<ExtensionRecoveryState["pairingState"]>();
  const [pairingErrors, setPairingErrors] = useState<PairingError[]>([]);
  const [connectionStateKnown, setConnectionStateKnown] = useState(false);
  const [peers, setPeers] = useState<string[]>([]);
  const [peerConnections, setPeerConnections] = useState<PeerConnectionInfo[]>(
    []
  );
  const [identity, setIdentity] = useState<Identity | null>(null);
  const managementNavigation = useMemo(
    () => createManagementNavigationConsumer(chrome.runtime, session),
    [session, identity?.deviceId]
  );
  useEffect(() => managementNavigation.start(), [managementNavigation]);
  const settings = useSettings();
  const [clipboardHistoryError, setClipboardHistoryError] =
    useState<ClipboardHistoryError | null>(null);
  const [historyPolicyError, setHistoryPolicyError] =
    useState<HistoryPolicyError | null>(null);
  const [recovery, setRecovery] = useState(initialRuntimeUiRecovery);
  const [identityRotationRecovery, setIdentityRotationRecovery] =
    useState(false);
  const [identityRotationNotice, setIdentityRotationNotice] =
    useState<IdentityRotationNoticeReason | null>(null);
  const [identityResetState, setIdentityResetState] =
    useState<IdentityResetState>();
  const [managedRelayConfigurations, setManagedRelayConfigurations] = useState<
    RelayConfiguration[]
  >([]);
  const [managedRelayStates, setManagedRelayStates] = useState<RelayState[]>(
    []
  );
  const [popupCapture, setPopupCapture] = useState<PopupCaptureState>({
    pending: false,
    error: null,
  });
  const captureRef = useRef<ReturnType<typeof createPopupCapture> | null>(null);
  const nameState = useRef(
    createPopupNameState(setIdentity, setDevices)
  ).current;
  const identityResetRequest = (message: Record<string, unknown>) =>
    new Promise<any>((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError || !response?.ok) {
          reject(new Error(response?.error ?? chrome.runtime.lastError?.message ?? "identity_reset_unavailable"));
          return;
        }
        if (response.state) setIdentityResetState(response.state);
        if (response.result?.state) setIdentityResetState(response.result.state);
        resolve(response);
      });
    });
  const identityResetActions: ManualIdentityResetActions | undefined =
    surface === "page"
      ? {
          begin: async (request) =>
            (await identityResetRequest({ type: "identityResetBegin", ...request })).result as IdentityResetResult,
          reconcile: async () =>
            (await identityResetRequest({ type: "identityResetReconcile" })).state as IdentityResetState,
          resume: async (request) =>
            (await identityResetRequest({ type: "identityResetResume", ...request })).result as IdentityResetResult,
          dismiss: async (receiptId) =>
            (await identityResetRequest({ type: "identityResetDismiss", receiptId })).state as IdentityResetState,
        }
      : undefined;

  const consumer = useMemo(
    () =>
      createRuntimeUiRecovery<ExtensionRecoveryState>({
        load: () => readExtensionRecoveryState(chrome.runtime),
        initializationError: () => probeExtensionInitialization(chrome.runtime),
        onRecovery: setRecovery,
        version: (state) => state.pairingState,
        authority: () => readExtensionRuntimeAuthority(chrome.runtime),
        onState: (state) => {
          nameState.publish(state);
          setPending(state.pending ?? []);
          setWaiting(state.waiting ?? []);
          setPairingErrors(state.pairingErrors ?? []);
          setPairingState(state.pairingState);
          setConnectionStateKnown(state.connectionStateKnown === true);
          setPeers(state.peers ?? []);
          setPeerConnections(state.peerConnections ?? []);
          setClipboardHistoryError(state.clipboardHistoryError ?? null);
          setHistoryPolicyError(state.historyPolicyError ?? null);
          setIdentityRotationRecovery(state.identityRotationRecovery === true);
          setIdentityRotationNotice(
            identityRotationNoticeReason(state.identityRotationNotice)
          );
          setManagedRelayConfigurations(state.managedRelayConfigurations ?? []);
          setManagedRelayStates(state.managedRelayStates ?? []);
        },
      }),
    [nameState]
  );
  useEffect(() => {
    const handler = (msg: any) => {
      if (msg.type === "trustRequest" && msg.device) {
        setPending((p) => {
          if (p.find((d) => d.deviceId === msg.device.deviceId)) return p;
          return [...p, msg.device];
        });
      }
      if (msg.type === "runtimeState" && msg.state) {
        consumer.live(msg.state);
      }
      if (msg.type === "identityResetStateChanged" && msg.state)
        setIdentityResetState(msg.state as IdentityResetState);
    };
    chrome.runtime.onMessage.addListener(handler);
    void consumer.load();
    const peerTimer = setInterval(() => void consumer.load(), 5000);
    if (surface === "page")
      chrome.runtime.sendMessage({ type: "identityResetRead" }, (response) => {
        if (!chrome.runtime.lastError && response?.ok && response.state)
          setIdentityResetState(response.state as IdentityResetState);
      });
    return () => {
      chrome.runtime.onMessage.removeListener(handler);
      clearInterval(peerTimer);
      consumer.cancel();
    };
  }, [consumer, surface]);

  useEffect(() => {
    if (surface !== "popup") return;
    const capture = createPopupCapture({
      hasFocus: () => document.hasFocus(),
      subscribeFocus: (listener) => {
        window.addEventListener("focus", listener);
        return () => window.removeEventListener("focus", listener);
      },
      readText: () => navigator.clipboard.readText(),
      runtime: chrome.runtime,
      onState: setPopupCapture,
    });
    captureRef.current = capture;
    capture.start();
    return () => {
      capture.dispose();
      captureRef.current = null;
    };
  }, [surface]);

  async function runHistoryOperation<
    Result extends { ok: true } = { ok: true },
  >(message: Record<string, unknown>): Promise<Result> {
    return await new Promise<Result>((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        const error = chrome.runtime.lastError;
        if (error || !response?.ok) {
          reject(
            error ?? new Error(response?.error || "history_operation_failed")
          );
          return;
        }
        resolve(response as Result);
      });
    });
  }

  async function relayAction<Result extends { ok: true } = { ok: true }>(
    message: Record<string, unknown>
  ): Promise<Result> {
    return await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError || !response?.ok) {
          reject(
            new Error(
              response?.error ??
                chrome.runtime.lastError?.message ??
                "relay_action_failed"
            )
          );
          return;
        }
        resolve(response as Result);
      });
    });
  }

  async function handleDeleteClip(id: string) {
    await runHistoryOperation({ type: "deleteClip", id });
    await history.refresh();
  }

  async function handleUnpair(id: string) {
    const actionRevision = nameState.revision();
    await new Promise<void>((resolve, reject) => {
      chrome.runtime.sendMessage({ type: "revokeDevice", id }, (response) => {
        if (chrome.runtime.lastError || !response?.ok) {
          reject(new Error(response?.error || "device_revocation_unconfirmed"));
          return;
        }
        if (ownerAlive.current && actionRevision === nameState.revision())
          setDevices((prev) => prev.filter((d) => d.deviceId !== id));
        resolve();
      });
    });
  }

  async function handleRenameDevice(
    id: string,
    name: string
  ): Promise<Device | null> {
    const actionRevision = nameState.revision();
    const device = await renameExtensionDevice(chrome.runtime, id, name);
    if (actionRevision === nameState.revision())
      setDevices((prev) =>
        prev.map((candidate) =>
          candidate.deviceId === id ? device : candidate
        )
      );
    return device;
  }

  async function handlePairingText(txt: string) {
    const result = await submitExtensionPairing(chrome.runtime, txt);
    void consumer.load();
    return result;
  }

  async function handleDecision(device: PendingRequest, accepted: boolean) {
    const result = await decideExtensionPairing(
      chrome.runtime,
      device,
      accepted
    );
    void consumer.load();
    return result;
  }

  async function handleRequestPairingCode(): Promise<PairingCode | null> {
    const target = await new Promise<string | null>((resolve) => {
      chrome.runtime.sendMessage({ type: "getPairingTarget" }, (res) =>
        resolve(res?.text || null)
      );
    });
    if (!target) return null;
    return createPairingCode(target);
  }

  async function handleRenameIdentity(
    name: string,
    expectedDeviceId: string
  ): Promise<Identity | null> {
    const actionRevision = nameState.revision();
    const updated = await renameExtensionIdentity(
      chrome.runtime,
      name,
      expectedDeviceId
    );
    nameState.readIdentity(actionRevision, updated);
    return updated;
  }

  useEffect(() => {
    authority.current = {
      identityId: identity?.deviceId,
      ready:
        Boolean(identity) &&
        Boolean(pairingState) &&
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
      requestIds: pending.map((request) => request.deviceId),
    };
    authorityListeners.current.forEach((listener) => listener());
  }, [
    identity,
    recovery,
    identityRotationRecovery,
    history.snapshot,
    history.loading,
    history.refreshError,
    settings.snapshot,
    settings.refreshError,
    pending,
    pairingState,
  ]);
  useEffect(() => {
    if (surface !== "page") return;
    return bindManagementPage({
      connect: () => connectManagementPage(chrome.runtime),
      session,
      authority: () => authority.current,
      subscribeAuthority: (listener) => {
        authorityListeners.current.add(listener);
        return () => {
          authorityListeners.current.delete(listener);
        };
      },
    });
  }, [surface, session]);
  return (
    <div
      style={{ width: "100%", height: "100%" }}
      className={surface === "popup" ? "popup-host" : "options-host"}
    >
      <ManagementNavigationView
        consumer={managementNavigation}
        surface={surface}
      />
      <ClipboardApp
        session={session}
        identityResetState={identityResetState}
        manualIdentityResetAvailable={false}
        identityResetActions={identityResetActions}
        onPairAfterIdentityReset={() =>
          session.open({ kind: "pairing", origin: "identity-reset-complete" })
        }
        onCopyFormerIdentity={async (receipt) => {
          const authorized = await identityResetRequest({
            type: "identityResetCopyFormerPeerId",
            receiptId: receipt.receiptId,
          });
          if (authorized.text !== receipt.formerPeerId)
            throw new Error("identity_reset_receipt_changed");
          const result = await copyPayloadText(authorized.text, (text) => navigator.clipboard.writeText(text));
          if (result.status !== "copied") throw new Error("peer_id_copy_unconfirmed");
        }}
        onInspectClip={
          surface === "popup"
            ? (id) =>
                managementNavigation.open({ kind: "clip-details", entity: id })
            : undefined
        }
        notificationControls={notificationControls}
        clips={history.snapshot?.clips ?? []}
        devices={devices}
        pending={pending}
        requestsLoading={recovery.loading}
        requestsUnavailable={recovery.unavailable || !pairingState}
        onRetryRequests={() => consumer.load()}
        waiting={waiting}
        pairingErrors={pairingErrors}
        pairingOutcomes={pairingState?.outcomes}
        onDismissPairingOutcome={(target) =>
          pairingState
            ? dismissExtensionPairingOutcome(
                chrome.runtime,
                target,
                pairingState
              )
            : Promise.resolve(false)
        }
        peers={peers}
        connectionStateKnown={connectionStateKnown && !recovery.unavailable}
        peerConnections={peerConnections}
        identity={identity}
        pinnedIds={history.snapshot?.pinnedIds ?? []}
        historyLoading={history.loading}
        historyUnavailable={history.snapshot === null && !history.loading}
        historyRefreshError={history.refreshError}
        onRetryHistoryRefresh={history.refresh}
        localRetentionMs={settings.snapshot?.state.localRetentionMs}
        appearanceSettings={settings}
        autoSync={settings.snapshot?.state.autoSync}
        autoSyncKnown={settings.snapshot !== null}
        autoSyncLoading={settings.loading}
        autoSyncRefreshing={settings.refreshing}
        autoSyncPending={settings.pending}
        autoSyncRecoveryRequired={settings.recoveryRequired}
        autoSyncRefreshError={settings.refreshError}
        autoSyncFeedback={
          settings.feedback?.fields?.includes("autoSync")
            ? settings.feedback
            : null
        }
        onRetryAutoSync={settings.refresh}
        popupCapture={surface === "popup" ? popupCapture : undefined}
        onRetryPopupCapture={
          surface === "popup"
            ? () => captureRef.current?.retry() ?? Promise.resolve(false)
            : undefined
        }
        clipboardHistoryError={clipboardHistoryError}
        historyPolicyError={historyPolicyError}
        initializationError={recovery.initializationError}
        runtimeError={
          recovery.unavailable && !recovery.initializationError
            ? "The extension runtime could not be loaded."
            : null
        }
        onRetryRuntime={() => consumer.load()}
        identityRotationRecovery={identityRotationRecovery}
        identityRotationNotice={identityRotationNotice}
        managedRelayConfigurations={managedRelayConfigurations}
        managedRelayStates={managedRelayStates}
        onRefreshManagedRelays={async () =>
          (
            await relayAction<{
              ok: true;
              configurations: RelayConfiguration[];
            }>({ type: "managedRelayRefresh" })
          ).configurations
        }
        onMutateManagedRelay={async (mutation) => {
          const response = await relayAction<{
            ok: true;
            result: RelayMutationResult;
          }>({ type: "managedRelayMutate", mutation });
          return response.result;
        }}
        onManagedRelayLogin={async (key) =>
          (
            await relayAction<{ ok: true; result: RelayActionResult }>({
              type: "managedRelayLogin",
              key,
            })
          ).result
        }
        onManagedRelayAccount={async (key) =>
          (
            await relayAction<{ ok: true; result: RelayActionResult }>({
              type: "managedRelayAccount",
              key,
            })
          ).result
        }
        onManagedRelayRetry={async (key) =>
          (
            await relayAction<{ ok: true; result: RelayActionResult }>({
              type: "managedRelayRetry",
              key,
            })
          ).result
        }
        onDeleteClip={handleDeleteClip}
        onUnpair={handleUnpair}
        onRenameDevice={handleRenameDevice}
        onAccept={(dev) => handleDecision(dev, true)}
        onReject={(dev) => handleDecision(dev, false)}
        onPairText={handlePairingText}
        pairingImport={
          <QRScanner
            session={session}
            disabled={
              !identity || recovery.unavailable || identityRotationRecovery
            }
            onScan={async (text) => {
              if (!authority.current.ready)
                throw new Error(
                  "Pairing is unavailable until Clipp has refreshed its current state. Retry the import after recovery."
                );
              session.pairing.change(text);
              await session.pairing.submit(handlePairingText);
            }}
          />
        }
        onRequestPairingCode={handleRequestPairingCode}
        onCopyPairingText={(text) =>
          copyPayloadText(text, (value) => navigator.clipboard.writeText(value))
        }
        onReuseClip={(id) => reuseExtensionClip(chrome.runtime, id)}
        onShareNow={
          surface === "popup"
            ? async () => {
                await shareCurrentPopupClipboard(
                  () => navigator.clipboard.readText(),
                  async (text) => {
                    await runHistoryOperation({ type: "shareNow", text });
                  }
                );
              }
            : undefined
        }
        onSetPinned={async (id, pinned) => {
          await runHistoryOperation({
            type: "setPin",
            id,
            pinned,
          });
          await history.refresh();
        }}
        onClearAll={async () => {
          let clearError: unknown;
          try {
            await runHistoryOperation({ type: "clearHistory" });
          } catch (error) {
            clearError = error;
          }
          const refreshed = await history.refresh();
          if (clearError) throw clearError;
          if (!refreshed) throw new Error("history_refresh_failed");
        }}
        onSetLocalRetention={async (retentionMs) => {
          await settings.save({ localRetentionMs: retentionMs });
        }}
        onSetAutoSync={async (enabled) => {
          await settings.save({ autoSync: enabled });
        }}
        onDismissClipboardHistoryError={async () => {
          await runHistoryOperation({ type: "dismissClipboardHistoryError" });
          await consumer.load();
        }}
        onRetryHistoryCleanup={async () => {
          await runHistoryOperation({ type: "retryHistoryCleanup" });
        }}
        onAcknowledgeIdentityRotationNotice={async () => {
          await runHistoryOperation({
            type: "acknowledgeIdentityRotationNotice",
          });
          await consumer.load();
        }}
        onRenameIdentity={handleRenameIdentity}
        onRetryInitialization={() =>
          consumer.load(() => retryExtensionInitialization(chrome.runtime))
        }
      />
    </div>
  );
};
