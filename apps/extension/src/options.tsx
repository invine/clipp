import { Appearance } from "../../../packages/ui/src/Appearance";
import type { RecoveryIssue } from "../../../packages/core/runtime/recoveryIssues";
import { OptionsRecovery } from "../../../packages/ui/src/OptionsRecovery";
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
import "./styles/tailwind-built.css";
import "../../../packages/ui/src/styles.css";
import "../../../packages/ui/src/host.css";
import "./options-host.css";
import { createUiSession } from "../../../packages/ui/src/uiSession";
import type { RelayMutationResult } from "../../../packages/core/network/relayMutations";
import type { RelayActionResult } from "../../../packages/core/network/relayActions";
import { subscribePairingCodeIdentity } from "./pairingCodeIdentity";
import { PairingCodeContent } from "../../../packages/ui/src/PairingCodeContent";
import { usePairingCodeTask } from "../../../packages/ui/src/usePairingCodeTask";
import { copyPayloadText } from "../../../packages/core/clipboard/payloadCopy";
import { pairingSubmissionMessage } from "../../../packages/ui/src/pairingFeedback";
import { PairingStatus } from "../../../packages/ui/src/PairingStatus";
import {
  submitExtensionPairing,
  dismissExtensionPairingOutcome,
} from "./pairingActions";
import React, {
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import ReactDOM from "react-dom/client";
import { DeviceList } from "./components/DeviceList";
import { ClipHistoryList } from "./components/ClipHistoryList";
import { QRScanner } from "./components/QRScanner";
import { createPairingCode } from "../../../packages/core/pairing/qrCode";
import { ManagedRelaySettings } from "../../../packages/ui/src/ManagedRelaySettings";
import {
  PreferenceRefreshNotice,
  PreferenceSaveFeedback,
} from "../../../packages/ui/src/PreferenceSaveFeedback";
import type {
  RelayConfiguration,
  RelayState,
} from "../../../packages/core/network/managedRelays";
import { useSettings } from "./useSettings";

const Options = () => {
  const [showQR, setShowQR] = useState(false);
  const [pairingEditorOpen, setPairingEditorOpen] = useState(false);
  const [qrIdentity, setQrIdentity] = useState<string | null>(null);
  const [session] = useState(createUiSession);
  const { task: qrTask, state: qrState } = usePairingCodeTask(
    qrIdentity,
    session.qr
  );
  const pairingTask = session.pairing;
  const pairing = useSyncExternalStore(
    pairingTask.subscribe,
    pairingTask.getSnapshot,
    pairingTask.getSnapshot
  );
  const settings = useSettings();
  const [managedRelayConfigurations, setManagedRelayConfigurations] = useState<
    RelayConfiguration[]
  >([]);
  const [managedRelayStates, setManagedRelayStates] = useState<RelayState[]>(
    []
  );

  function relayAction<Result extends { ok: true } = { ok: true }>(
    message: Record<string, unknown>
  ): Promise<Result> {
    return new Promise((resolve, reject) => {
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

  const [recovery, setRecovery] = useState(initialRuntimeUiRecovery);
  const [runtimeState, setRuntimeState] =
    useState<ExtensionRecoveryState | null>(null);
  const consumer = useMemo(
    () =>
      createRuntimeUiRecovery({
        load: () => readExtensionRecoveryState(chrome.runtime),
        initializationError: () => probeExtensionInitialization(chrome.runtime),
        onRecovery: setRecovery,
        version: (state) => state.pairingState,
        authority: () => readExtensionRuntimeAuthority(chrome.runtime),
        onState: (state: ExtensionRecoveryState) => {
          setRuntimeState(state);
          setManagedRelayConfigurations(state.managedRelayConfigurations ?? []);
          setManagedRelayStates(state.managedRelayStates ?? []);
        },
      }),
    []
  );
  useEffect(() => {
    const onRuntimeState = (message: {
      type?: string;
      state?: ExtensionRecoveryState;
    }) => {
      if (message.type === "runtimeState" && message.state)
        consumer.live(message.state);
    };
    chrome.runtime.onMessage.addListener(onRuntimeState);
    void consumer.load();
    return () => {
      consumer.cancel();
      chrome.runtime.onMessage.removeListener(onRuntimeState);
    };
  }, [consumer]);
  const identityReady =
    Boolean(runtimeState?.identity) &&
    !recovery.unavailable &&
    !runtimeState?.identityRotationRecovery;
  function openRecoveryTask(issue: RecoveryIssue) {
    if (issue.scope === "task" && issue.code === "pairing") {
      setShowQR(false);
      setPairingEditorOpen(true);
      session.open({ kind: "pairing", origin: "issues-summary" });
      requestAnimationFrame(() =>
        document.getElementById("pairing-input")?.focus()
      );
      return;
    }
    if (issue.scope === "task" && issue.code === "relay-edit") {
      const configuration = managedRelayConfigurations.find(
        (value) => value.key === issue.target
      );
      if (configuration || issue.target === "new") {
        session.open({
          kind: "relay",
          entity: issue.target,
          origin: "issues-summary",
        });
        session.relay.begin(configuration);
      }
    }
    document
      .getElementById(
        issue.scope === "history"
          ? "clipboard-history"
          : issue.scope === "relay" || issue.code.startsWith("relay-")
            ? "relay-settings"
            : issue.code === "settings"
              ? "options-settings"
              : "trusted-devices"
      )
      ?.focus();
  }

  useEffect(
    () =>
      subscribePairingCodeIdentity(
        {
          send: (message, receive) =>
            chrome.runtime.sendMessage(message, (reply) => {
              if (!chrome.runtime.lastError) receive(reply);
            }),
          subscribe: (receive) => {
            chrome.runtime.onMessage.addListener(receive);
            return () => chrome.runtime.onMessage.removeListener(receive);
          },
        },
        (identity) =>
          setQrIdentity(
            identity ? `${identity.deviceId}:${identity.deviceName}` : null
          )
      ),
    []
  );

  async function handleScan(payload: string) {
    if (!identityReady || pairing.pending) return;
    pairingTask.change(payload);
    await pairingTask.submit((text) =>
      submitExtensionPairing(chrome.runtime, text)
    );
  }

  async function requestMyQR() {
    const text = await new Promise<string>((resolve, reject) => {
      chrome.runtime.sendMessage({ type: "getPairingTarget" }, (response) => {
        if (chrome.runtime.lastError || !response?.text) {
          reject(new Error("pairing_target_unavailable"));
          return;
        }
        resolve(response.text);
      });
    });
    return createPairingCode(text);
  }

  return (
    <div className="options-host p-4 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold mb-4">Clipboard Share – Settings</h1>
      <OptionsRecovery
        session={session}
        faults={{
          ...runtimeState,
          initializationError: recovery.initializationError,
          runtimeError:
            recovery.unavailable && !recovery.initializationError
              ? "The extension runtime could not be loaded."
              : null,
        }}
        waiting={runtimeState?.waiting}
        preferenceError={
          settings.refreshError ||
          settings.feedback?.error ||
          (settings.feedback && settings.feedback.status !== "applied"
            ? "The settings action could not be confirmed."
            : null)
        }
        onRetry={(issue) =>
          issue.code === "initialization_failed"
            ? () =>
                consumer.load(() =>
                  retryExtensionInitialization(chrome.runtime)
                )
            : issue.scope === "runtime"
              ? () => consumer.load()
              : undefined
        }
        onOpenTask={openRecoveryTask}
      />
      <section className="mb-6">
        <h2 id="trusted-devices" tabIndex={-1} className="font-semibold mb-2">
          Trusted Devices
        </h2>
        <DeviceList disabled={!identityReady} />
        <PairingStatus
          outcomes={runtimeState?.pairingState?.outcomes}
          waiting={runtimeState?.waiting}
          errors={runtimeState?.pairingErrors}
          devices={runtimeState?.devices ?? []}
          onDismiss={(target) =>
            runtimeState?.pairingState
              ? dismissExtensionPairingOutcome(
                  chrome.runtime,
                  target,
                  runtimeState.pairingState
                )
              : Promise.resolve(false)
          }
        />
        <div className="mt-2 flex flex-col space-y-2">
          <button
            className="px-3 py-1 bg-blue-600 text-white rounded"
            disabled={!identityReady}
            onClick={() => setShowQR((v) => !v)}
          >
            {showQR ? "Hide QR Scanner" : "Add Device (QR)"}
          </button>
        </div>
        {showQR && (
          <QRScanner
            onScan={handleScan}
            disabled={!identityReady || pairing.pending}
          />
        )}
        {(showQR || pairingEditorOpen) && (
          <>
            <label className="block mt-2">
              Pairing text
              <textarea
                id="pairing-input"
                aria-label="Pairing text"
                className="block w-full"
                value={pairing.raw}
                onChange={(event) => pairingTask.change(event.target.value)}
              />
            </label>
            <button
              disabled={!identityReady || pairing.pending}
              onClick={() =>
                void pairingTask.submit((text) =>
                  submitExtensionPairing(chrome.runtime, text)
                )
              }
            >
              {pairing.pending ? "Submitting…" : "Submit pairing text"}
            </button>
            {pairingEditorOpen && (
              <button
                type="button"
                onClick={() => {
                  setPairingEditorOpen(false);
                  session.complete("pairing");
                }}
              >
                Close Pairing input
              </button>
            )}
            {pairing.result && (
              <p role="status" style={{ overflowWrap: "anywhere" }}>
                {pairingSubmissionMessage(pairing.result)}
              </p>
            )}
          </>
        )}
        <div className="mt-2 flex flex-col space-y-2">
          <button
            className="px-3 py-1 bg-blue-600 text-white rounded"
            disabled={!identityReady}
            onClick={() => {
              if (qrState.open) qrTask.close();
              else void qrTask.generate(requestMyQR);
            }}
          >
            {qrState.open ? "Hide My QR" : "Generate My QR"}
          </button>
        </div>
        {qrState.open && (
          <div className="mt-2 flex flex-col items-center">
            <PairingCodeContent
              buttonClassName="mt-2 px-2 py-1 bg-gray-700 text-white rounded"
              state={qrState}
              onRetry={() => {
                void qrTask.generate(requestMyQR);
              }}
              onCopy={() => {
                void qrTask.copy((text) =>
                  copyPayloadText(text, (value) =>
                    navigator.clipboard.writeText(value)
                  )
                );
              }}
            />
          </div>
        )}
      </section>
      <section id="relay-settings" tabIndex={-1} className="mb-6">
        <ManagedRelaySettings
          configurations={managedRelayConfigurations}
          states={managedRelayStates}
          session={session}
          onRefresh={async () =>
            (
              await relayAction<{
                ok: true;
                configurations: RelayConfiguration[];
              }>({ type: "managedRelayRefresh" })
            ).configurations
          }
          onMutate={async (mutation) => {
            const response = await relayAction<{
              ok: true;
              result: RelayMutationResult;
            }>({ type: "managedRelayMutate", mutation });
            return response.result;
          }}
          onLogin={async (key) =>
            (
              await relayAction<{ ok: true; result: RelayActionResult }>({
                type: "managedRelayLogin",
                key,
              })
            ).result
          }
          onManageAccount={async (key) =>
            (
              await relayAction<{ ok: true; result: RelayActionResult }>({
                type: "managedRelayAccount",
                key,
              })
            ).result
          }
          onRetry={async (key) =>
            (
              await relayAction<{ ok: true; result: RelayActionResult }>({
                type: "managedRelayRetry",
                key,
              })
            ).result
          }
        />
      </section>
      <section className="mb-6">
        <h2 id="clipboard-history" tabIndex={-1} className="font-semibold mb-2">
          Clipboard History
        </h2>
        <ClipHistoryList />
      </section>
      <section className="mb-6">
        <h2 id="options-settings" tabIndex={-1} className="font-semibold mb-2">
          Settings
        </h2>
        <div className="flex flex-col gap-2">
          <Appearance settings={settings} />
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              className="accent-blue-600"
              checked={settings.snapshot?.state.autoSync ?? false}
              aria-checked={settings.snapshot ? undefined : "mixed"}
              ref={(input) => {
                if (input) input.indeterminate = settings.snapshot === null;
              }}
              disabled={
                !settings.snapshot ||
                settings.pending ||
                settings.recoveryRequired
              }
              onChange={(e) => {
                void settings.save({ autoSync: e.target.checked });
              }}
            />{" "}
            Auto Sync
          </label>
          {!settings.snapshot && <p>Applied Auto Sync: unknown</p>}
          <label className="flex items-center gap-2">
            Log level
            <select
              className="border rounded px-1"
              value={settings.snapshot?.state.logLevel ?? ""}
              disabled={
                !settings.snapshot ||
                settings.pending ||
                settings.recoveryRequired
              }
              onChange={(e) => {
                void settings.save({
                  logLevel: e.target.value as
                    "debug" | "info" | "warn" | "error",
                });
              }}
            >
              {!settings.snapshot && <option value="">Unknown</option>}
              <option value="debug">Debug</option>
              <option value="info">Info</option>
              <option value="warn">Warn</option>
              <option value="error">Error</option>
            </select>
          </label>
          {settings.loading && <p role="status">Loading settings…</p>}
          {settings.pending && <p role="status">Saving settings…</p>}
          <PreferenceRefreshNotice
            subject="Settings"
            error={settings.refreshError}
            onRetry={settings.refresh}
          />
          <PreferenceSaveFeedback
            feedback={settings.feedback}
            subject="Settings"
            plural
            refreshError={settings.refreshError}
            refreshing={settings.refreshing}
          />
        </div>
      </section>
    </div>
  );
};

ReactDOM.createRoot(document.getElementById("root")!).render(<Options />);
