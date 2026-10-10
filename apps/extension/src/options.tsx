import { subscribePairingCodeIdentity } from "./pairingCodeIdentity";
import { PairingCodeContent } from "../../../packages/ui/src/PairingCodeContent";
import { usePairingCodeTask } from "../../../packages/ui/src/usePairingCodeTask";
import { copyPayloadText } from "../../../packages/core/clipboard/payloadCopy";
import { createPairingSubmission } from "../../../packages/ui/src/pairingSubmission";
import { pairingSubmissionMessage } from "../../../packages/ui/src/pairingFeedback";
import { submitExtensionPairing } from "./pairingActions";
import React, { useEffect, useState, useSyncExternalStore } from "react";
import ReactDOM from "react-dom/client";
import { DeviceList } from "./components/DeviceList";
import { ClipHistoryList } from "./components/ClipHistoryList";
import { QRScanner } from "./components/QRScanner";
import "./styles/tailwind-built.css";
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
  const [qrIdentity, setQrIdentity] = useState<string | null>(null);
  const { task: qrTask, state: qrState } = usePairingCodeTask(qrIdentity);
  const [pairingTask] = useState(createPairingSubmission);
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

  useEffect(() => {
    void relayAction<{
      ok: true;
      configurations: RelayConfiguration[];
      states: RelayState[];
    }>({ type: "managedRelayGet" }).then((response) => {
      setManagedRelayConfigurations(response.configurations);
      setManagedRelayStates(response.states);
    });
    const onRuntimeState = (message: {
      type?: string;
      state?: {
        managedRelayConfigurations?: RelayConfiguration[];
        managedRelayStates?: RelayState[];
      };
    }) => {
      if (message.type !== "runtimeState") return;
      if (message.state?.managedRelayConfigurations)
        setManagedRelayConfigurations(message.state.managedRelayConfigurations);
      if (message.state?.managedRelayStates)
        setManagedRelayStates(message.state.managedRelayStates);
    };
    chrome.runtime.onMessage.addListener(onRuntimeState);
    return () => chrome.runtime.onMessage.removeListener(onRuntimeState);
  }, []);

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
    if (pairing.pending) return;
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
    <div className="p-4 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold mb-4">Clipboard Share – Settings</h1>
      <section className="mb-6">
        <h2 className="font-semibold mb-2">Trusted Devices</h2>
        <DeviceList />
        <div className="mt-2 flex flex-col space-y-2">
          <button
            className="px-3 py-1 bg-blue-600 text-white rounded"
            onClick={() => setShowQR((v) => !v)}
          >
            {showQR ? "Hide QR Scanner" : "Add Device (QR)"}
          </button>
        </div>
        {showQR && (
          <>
            <QRScanner onScan={handleScan} disabled={pairing.pending} />
            <label className="block mt-2">
              Pairing text
              <textarea
                aria-label="Pairing text"
                className="block w-full"
                value={pairing.raw}
                onChange={(event) => pairingTask.change(event.target.value)}
              />
            </label>
            <button
              disabled={pairing.pending}
              onClick={() =>
                void pairingTask.submit((text) =>
                  submitExtensionPairing(chrome.runtime, text)
                )
              }
            >
              {pairing.pending ? "Submitting…" : "Submit pairing text"}
            </button>
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
      <section className="mb-6">
        <ManagedRelaySettings
          configurations={managedRelayConfigurations}
          states={managedRelayStates}
          onSetConfigurations={async (configurations) => {
            const response = await relayAction<{
              ok: true;
              configurations: RelayConfiguration[];
            }>({ type: "managedRelaySet", configurations });
            setManagedRelayConfigurations(response.configurations);
          }}
          onLogin={(key) =>
            relayAction({ type: "managedRelayLogin", key })
              .then(() => undefined)
              .catch((error) => alert((error as Error).message))
          }
          onManageAccount={(key) =>
            relayAction({ type: "managedRelayAccount", key })
              .then(() => undefined)
              .catch((error) => alert((error as Error).message))
          }
          onRetry={(key) =>
            relayAction({ type: "managedRelayRetry", key })
              .then(() => undefined)
              .catch((error) => alert((error as Error).message))
          }
        />
      </section>
      <section className="mb-6">
        <h2 className="font-semibold mb-2">Clipboard History</h2>
        <ClipHistoryList />
      </section>
      <section className="mb-6">
        <h2 className="font-semibold mb-2">Settings</h2>
        <div className="flex flex-col gap-2">
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
      <button
        className="mt-2 px-3 py-1 bg-gray-700 text-white rounded"
        onClick={() => {
          document.documentElement.classList.toggle("dark");
        }}
      >
        Toggle Dark Mode
      </button>
    </div>
  );
};

ReactDOM.createRoot(document.getElementById("root")!).render(<Options />);
