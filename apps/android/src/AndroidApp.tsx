import { useNotificationAvailability } from "../../../packages/ui/src/useNotificationAvailability";
import { useNotificationRequests } from "../../../packages/ui/src/useNotificationRequests";
import { useRuntimeSettings } from "../../../packages/ui/src/useRuntimeSettings";
import "../../../packages/ui/src/styles.css";
import "../../../packages/ui/src/host.css";
import "./android-host.css";
import React, { useEffect, useMemo, useState } from "react";
import { ClipboardApp } from "@clipp/ui";
import {
  createRuntimeUiRecovery,
  initialRuntimeUiRecovery,
} from "@core/runtime/uiRecovery";
import type { Clip, Device, Identity, PendingRequest } from "@clipp/ui";
import type { AndroidAppState, createAndroidRuntime } from "./client";
import { bindAndroidHostGeometry } from "./hostGeometryNative";
import { createUiSession } from "../../../packages/ui/src/uiSession";
import {
  createHostTaskInput,
  bindHostOverlayKeyboard,
} from "../../../packages/ui/src/hostTaskInput";
import { bindAndroidHostTaskInput } from "./hostTaskInputNative";
import { createAndroidPairingScanner } from "./pairingScannerHost";
import type { PairingScanOptions } from "../../../packages/ui/src/pairingScan";

const initialState: AndroidAppState = {
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
  diagnostics: {
    lastPairingAttempt: null,
  },
};

export type AndroidAppRuntime = Pick<
  ReturnType<typeof createAndroidRuntime>,
  "client" | "start" | "stop"
>;

export function AndroidApp({ runtime }: { runtime: AndroidAppRuntime }) {
  const session = useMemo(() => createUiSession(), []);
  const taskInput = useMemo(() => createHostTaskInput(session), [session]);
  const pairingScanner = useMemo(
    () => createAndroidPairingScanner(taskInput),
    [taskInput]
  );
  useEffect(() => () => pairingScanner.dispose(), [pairingScanner]);
  useEffect(() => {
    const unbindNative = bindAndroidHostTaskInput(taskInput);
    const unbindKeyboard = bindHostOverlayKeyboard(taskInput, document);
    return () => {
      unbindKeyboard();
      unbindNative();
    };
  }, [taskInput]);
  useEffect(() => bindAndroidHostGeometry(), []);
  const { client } = runtime;
  const notificationControls = useNotificationAvailability(client);
  const appearanceSettings = useRuntimeSettings({
    send: (message) =>
      message.type === "getSettings"
        ? client.getSettings()
        : client.setSettings(message.settings),
    subscribe: (listener) =>
      client.onSettingsUpdate((snapshot) =>
        listener({ type: "settingsState", snapshot })
      ),
  });
  const [state, setState] = useState<AndroidAppState>(initialState);
  const [recovery, setRecovery] = useState(initialRuntimeUiRecovery);
  const consumer = useMemo(
    () =>
      createRuntimeUiRecovery<AndroidAppState>({
        load: async () => {
          await runtime.start();
          return client.getState();
        },
        initializationError: async () =>
          (await client.getInitializationError()) ?? null,
        version: (state) => state.pairingState,
        authority: () => client.getRuntimeAuthority(),
        confirmed: (state) =>
          !state.historyUnavailable && !state.historyRefreshError,
        onState: setState,
        onRecovery: setRecovery,
      }),
    [client, runtime]
  );
  useEffect(() => {
    const unsubscribe = client.onUpdate((state) => {
      void consumer.live(state);
    });
    void consumer.load();
    return () => {
      consumer.cancel();
      unsubscribe();
      void runtime.stop();
    };
  }, [client, consumer, runtime]);

  useNotificationRequests(client, session, {
    ready:
      !recovery.loading &&
      !recovery.unavailable &&
      !!state.pairingState &&
      !!state.identity &&
      !state.identityRotationRecovery,
    clipIds: state.clips.map((clip) => clip.id),
    requestIds: state.pending.map((request) => request.deviceId),
  });

  async function handlePairText(txt: string) {
    return await client.pairFromText(txt);
  }

  function handleScanPairingCode(options: PairingScanOptions) {
    return pairingScanner.scan(options);
  }

  return (
    <div className="android-host">
      <ClipboardApp
        taskInput={taskInput}
        session={session}
        notificationControls={notificationControls}
        appearanceSettings={appearanceSettings}
        pairingDiagnostics={
          <PairingDiagnosticsPanel
            attempt={state.diagnostics?.lastPairingAttempt || null}
          />
        }
        clips={state.clips as Clip[]}
        historyLoading={recovery.loading}
        historyUnavailable={
          !recovery.loading && (state.historyUnavailable || false)
        }
        historyRefreshError={
          state.historyRefreshError ? "history_unavailable" : null
        }
        onRetryHistoryRefresh={() => consumer.load()}
        runtimeError={
          recovery.unavailable && !recovery.initializationError
            ? "Android services could not be started or loaded."
            : null
        }
        onRetryRuntime={() => consumer.load()}
        devices={state.devices as Device[]}
        pending={state.pending as PendingRequest[]}
        requestsLoading={recovery.loading}
        requestsUnavailable={recovery.unavailable || !state.pairingState}
        onRetryRequests={() => consumer.load()}
        waiting={state.waiting || []}
        pairingErrors={state.pairingErrors || []}
        pairingOutcomes={state.pairingState?.outcomes}
        onDismissPairingOutcome={(target) =>
          state.pairingState
            ? client.dismissPairingOutcome(target, state.pairingState)
            : Promise.resolve(false)
        }
        peers={state.peers}
        peerConnections={state.peerConnections || []}
        relayConnections={state.relayConnections || []}
        identity={state.identity as Identity | null}
        pinnedIds={state.pinnedIds || []}
        localRetentionMs={state.localRetentionMs}
        autoSync={state.autoSync}
        autoSyncKnown={!recovery.loading && !recovery.unavailable}
        autoSyncLoading={recovery.loading}
        backgroundContinuity={state.backgroundContinuity}
        clipboardHistoryError={state.clipboardHistoryError}
        historyPolicyError={state.historyPolicyError}
        relayAddresses={state.relayAddresses || []}
        managedRelayConfigurations={state.managedRelayConfigurations || []}
        managedRelayStates={state.managedRelayStates || []}
        onRefreshManagedRelays={() => client.refreshManagedRelays()}
        onMutateManagedRelay={(mutation) => client.mutateManagedRelay(mutation)}
        onManagedRelayLogin={(key) => client.loginManagedRelay(key)}
        onManagedRelayAccount={(key) => client.openManagedRelayAccount(key)}
        onManagedRelayRetry={(key) => client.retryManagedRelay(key)}
        initializationError={recovery.initializationError}
        identityRotationRecovery={state.identityRotationRecovery}
        identityRotationNotice={state.identityRotationNotice}
        onDeleteClip={(id) => client.deleteClip(id)}
        onUnpair={(id) => client.unpairDevice(id)}
        onRenameDevice={(id, name) => client.renameDevice(id, name)}
        onRenameIdentity={(name, expectedDeviceId) =>
          client.renameIdentity(name, expectedDeviceId)
        }
        onAccept={(dev) => client.acceptRequest(dev)}
        onReject={(dev) => client.rejectRequest(dev)}
        onPairText={handlePairText}
        onScanPairingCode={handleScanPairingCode}
        scanCameraPermission={pairingScanner.permission}
        onRequestPairingCode={() => client.getPairingCode()}
        onCopyPairingText={(text) => client.copyPairingText(text)}
        onReuseClip={(id) => client.reuseClip(id)}
        onShareNow={() => client.shareCurrentClipboard()}
        onSetPinned={async (id, pinned) => {
          await client.setPinned(id, pinned);
        }}
        onClearAll={async () => {
          await client.clearHistory();
          if (!(await consumer.load()))
            throw new Error("history_refresh_failed");
        }}
        onDismissClipboardHistoryError={() =>
          client.dismissClipboardHistoryError()
        }
        onRetryHistoryCleanup={() => client.retryHistoryCleanup()}
        onAcknowledgeIdentityRotationNotice={() =>
          client.acknowledgeIdentityRotationNotice()
        }
        onSetLocalRetention={async (retentionMs) => {
          await client.setLocalRetention(retentionMs);
        }}
        onSetAutoSync={(enabled) => client.setAutoSync(enabled)}
        onRetryAutoSync={() => client.refreshAutoSync()}
        onSetBackgroundContinuity={async (enabled) => {
          await client.setBackgroundContinuity(enabled);
        }}
        onRefreshBackgroundContinuity={() =>
          client.refreshBackgroundContinuity()
        }
        onOpenBackgroundNotificationSettings={() =>
          client.openBackgroundNotificationSettings()
        }
        onExportBackgroundContinuityDiagnostics={() =>
          client.exportBackgroundContinuityDiagnostics()
        }
        onRetryInitialization={() =>
          consumer.load(async () => {
            await client.retryIdentityInitialization();
          })
        }
      />
    </div>
  );
}

function PairingDiagnosticsPanel({
  attempt,
}: {
  attempt: NonNullable<AndroidAppState["diagnostics"]>["lastPairingAttempt"];
}) {
  if (!attempt) return null;

  return (
    <div
      style={{
        maxWidth: "100%",
        maxHeight: "25dvh",
        overflow: "auto",
        overflowWrap: "anywhere",
        margin: 0,
        padding: 12,
        borderRadius: 12,
        border:
          attempt.status === "failed"
            ? "1px solid var(--clipp-danger)"
            : "1px solid var(--clipp-border)",
        background: "var(--clipp-surface-raised)",
        color: "var(--clipp-text)",
        fontSize: ".875rem",
      }}
    >
      <p style={{ fontWeight: 700 }}>
        Pairing diagnostics: {attempt.status} ({attempt.attemptId})
      </p>
      <pre
        style={{
          marginTop: 10,
          maxHeight: "15dvh",
          overflow: "auto",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          color: "var(--clipp-text-muted)",
        }}
      >
        {JSON.stringify(attempt, null, 2)}
      </pre>
    </div>
  );
}
