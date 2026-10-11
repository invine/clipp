import {
  createRuntimeUiRecovery,
  initialRuntimeUiRecovery,
} from "../../../packages/core/runtime/uiRecovery";
import {
  readExtensionRecoveryState,
  probeExtensionInitialization,
  retryExtensionInitialization,
  type ExtensionRecoveryState,
} from "./runtimeRecovery";
import "./styles/tailwind-built.css";
import "../../../packages/ui/src/styles.css";
import "../../../packages/ui/src/host.css";
import "./popup-host.css";
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
import ReactDOM from "react-dom/client";
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
  ReuseClipOutcome,
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

function identityRotationNoticeReason(
  value: unknown
): IdentityRotationNoticeReason | null {
  return value === "revoked" || value === "identity-loss" ? value : null;
}

const Popup = () => {
  const history = useHistory();
  const [devices, setDevices] = useState<Device[]>([]);
  const [pending, setPending] = useState<PendingRequest[]>([]);
  const [waiting, setWaiting] = useState<PairingWaiting[]>([]);
  const [pairingState, setPairingState] =
    useState<ExtensionRecoveryState["pairingState"]>();
  const [pairingErrors, setPairingErrors] = useState<PairingError[]>([]);
  const [peers, setPeers] = useState<string[]>([]);
  const [peerConnections, setPeerConnections] = useState<PeerConnectionInfo[]>(
    []
  );
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [localRetentionMs, setLocalRetentionMs] = useState(
    30 * 24 * 60 * 60 * 1000
  );
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
  const [managedRelayConfigurations, setManagedRelayConfigurations] = useState<
    RelayConfiguration[]
  >([]);
  const [managedRelayStates, setManagedRelayStates] = useState<RelayState[]>(
    []
  );
  const lastClipboardRef = useRef("");
  const nameState = useRef(
    createPopupNameState(setIdentity, setDevices)
  ).current;

  const consumer = useMemo(
    () =>
      createRuntimeUiRecovery<ExtensionRecoveryState>({
        load: () => readExtensionRecoveryState(chrome.runtime),
        initializationError: () => probeExtensionInitialization(chrome.runtime),
        onRecovery: setRecovery,
        version: (state) => state.pairingState,
        onState: (state) => {
          nameState.publish(state);
          setPending(state.pending ?? []);
          setWaiting(state.waiting ?? []);
          setPairingErrors(state.pairingErrors ?? []);
          setPairingState(state.pairingState);
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
    void consumer.load();
    chrome.runtime.sendMessage({ type: "getSettings" }, (res) => {
      if (typeof res?.localRetentionMs === "number")
        setLocalRetentionMs(res.localRetentionMs);
    });

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
    };
    chrome.runtime.onMessage.addListener(handler);
    const peerTimer = setInterval(refreshPeers, 5000);
    return () => {
      chrome.runtime.onMessage.removeListener(handler);
      clearInterval(peerTimer);
      consumer.cancel();
    };
  }, [consumer]);

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

  function refreshDevices() {
    const readRevision = nameState.revision();
    chrome.runtime.sendMessage({ type: "getTrustedDevices" }, (resp) => {
      nameState.readDevices(readRevision, resp?.devices || []);
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
      setPeerConnections(resp?.peerConnections || []);
    });
  }

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
    await new Promise<void>((resolve, reject) => {
      chrome.runtime.sendMessage({ type: "revokeDevice", id }, (response) => {
        if (!response?.ok) {
          reject(new Error(response?.error || "device_revocation_failed"));
          return;
        }
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
    refreshPending();
    return result;
  }

  async function handleDecision(device: PendingRequest, accepted: boolean) {
    const result = await decideExtensionPairing(
      chrome.runtime,
      device,
      accepted
    );
    refreshPending();
    refreshDevices();
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

  return (
    <div
      style={{ width: "100%", height: "100%" }}
      className="overflow-hidden bg-gradient-to-br from-slate-900 via-slate-950 to-black"
    >
      <ClipboardApp
        clips={history.snapshot?.clips ?? []}
        devices={devices}
        pending={pending}
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
        peerConnections={peerConnections}
        identity={identity}
        pinnedIds={history.snapshot?.pinnedIds ?? []}
        historyLoading={history.loading}
        historyUnavailable={history.snapshot === null && !history.loading}
        historyRefreshError={history.refreshError}
        onRetryHistoryRefresh={history.refresh}
        localRetentionMs={localRetentionMs}
        autoSync={settings.snapshot?.state.autoSync}
        autoSyncKnown={settings.snapshot !== null}
        autoSyncLoading={settings.loading}
        autoSyncRefreshing={settings.refreshing}
        autoSyncPending={settings.pending}
        autoSyncRecoveryRequired={settings.recoveryRequired}
        autoSyncRefreshError={settings.refreshError}
        autoSyncFeedback={settings.feedback}
        onRetryAutoSync={settings.refresh}
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
        onRequestPairingCode={handleRequestPairingCode}
        onCopyPairingText={(text) =>
          copyPayloadText(text, (value) => navigator.clipboard.writeText(value))
        }
        onReuseClip={async (id) => {
          const response = await runHistoryOperation<{
            ok: true;
            outcome: ReuseClipOutcome;
          }>({
            type: "reuseClip",
            id,
          });
          return response.outcome;
        }}
        onShareNow={async () => {
          await shareCurrentPopupClipboard(
            () => navigator.clipboard.readText(),
            async (text) => {
              await runHistoryOperation({ type: "shareNow", text });
            }
          );
        }}
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
          const response = await runHistoryOperation<{
            ok: true;
            localRetentionMs: number;
          }>({
            type: "setLocalRetention",
            retentionMs,
          });
          setLocalRetentionMs(response.localRetentionMs);
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

ReactDOM.createRoot(document.getElementById("root")!).render(<Popup />);
