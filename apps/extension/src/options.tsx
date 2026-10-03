import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { DeviceList } from "./components/DeviceList";
import { ClipHistoryList } from "./components/ClipHistoryList";
import { QRScanner } from "./components/QRScanner";
import "./styles/tailwind-built.css";
import { createPairingCode } from "../../../packages/core/pairing/qrCode";
import { decodePairingTarget } from "../../../packages/core/pairing/v2";
import { ManagedRelaySettings } from "../../../packages/ui/src/ManagedRelaySettings";
import type {
  RelayConfiguration,
  RelayState,
} from "../../../packages/core/network/managedRelays";

const defaultTypes = { text: true, image: true, file: true };

const Options = () => {
  const [showQR, setShowQR] = useState(false);
  const [qrResult, setQRResult] = useState<string | null>(null);
  const [showMyQR, setShowMyQR] = useState(false);
  const [myQRImage, setMyQRImage] = useState<string | null>(null);
  const [myQRText, setMyQRText] = useState<string | null>(null);
  const [settings, setSettings] = useState({
    autoSync: true,
    expiryDays: 365,
    typesEnabled: defaultTypes,
    logLevel: "info",
  });
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
    // @ts-ignore
    chrome.runtime.sendMessage({ type: "getSettings" }, (resp) => {
      setSettings({
        autoSync: resp?.autoSync !== false,
        expiryDays: resp?.expiryDays || 365,
        typesEnabled: resp?.typesEnabled || defaultTypes,
        logLevel: resp?.logLevel || "info",
      });
    });
    return () => chrome.runtime.onMessage.removeListener(onRuntimeState);
  }, []);

  async function handleScan(payload: string) {
    setQRResult(payload);
    if (decodePairingTarget(payload)) {
      // @ts-ignore
      chrome.runtime.sendMessage(
        { type: "pairDevice", pairingText: payload },
        (resp) => {
          // Optionally show success/failure
        }
      );
    }
  }

  async function generateMyQR() {
    // @ts-ignore
    chrome.runtime.sendMessage({ type: "getPairingTarget" }, async (res) => {
      if (!res?.text) return;
      const txt = res.text as string;
      const code = await createPairingCode(txt);
      setMyQRImage(code.image);
      setMyQRText(txt);
    });
  }

  function copyMyQR() {
    if (myQRText) navigator.clipboard.writeText(myQRText);
  }

  function handleSettingChange(key: string, value: any) {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    // @ts-ignore
    chrome.runtime.sendMessage({ type: "setSettings", settings: newSettings });
  }

  function handleTypeToggle(type: keyof typeof defaultTypes) {
    const newTypes = {
      ...settings.typesEnabled,
      [type]: !settings.typesEnabled[type],
    };
    handleSettingChange("typesEnabled", newTypes);
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
        {showQR && <QRScanner onScan={handleScan} />}
        {qrResult && (
          <div className="text-xs text-green-600 mt-2">
            QR scanned: {qrResult.slice(0, 32)}...
          </div>
        )}
        <div className="mt-2 flex flex-col space-y-2">
          <button
            className="px-3 py-1 bg-blue-600 text-white rounded"
            onClick={() => {
              if (!showMyQR) generateMyQR();
              setShowMyQR((v) => !v);
            }}
          >
            {showMyQR ? "Hide My QR" : "Generate My QR"}
          </button>
        </div>
        {showMyQR && myQRText && (
          <div className="mt-2 flex flex-col items-center">
            {myQRImage ? (
              <img src={myQRImage} alt="My QR" className="w-32 h-32" />
            ) : (
              <p>
                This pairing target is too large for a QR code. Copy the pairing
                text and paste it on your other device.
              </p>
            )}
            <button
              className="mt-2 px-2 py-1 bg-gray-700 text-white rounded"
              onClick={copyMyQR}
            >
              Copy as Text
            </button>
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
              checked={settings.autoSync}
              onChange={(e) =>
                handleSettingChange("autoSync", e.target.checked)
              }
            />{" "}
            Auto-sync
          </label>
          <label className="flex items-center gap-2">
            <input
              type="number"
              className="w-16 px-1 border rounded"
              min={1}
              max={3650}
              value={settings.expiryDays}
              onChange={(e) =>
                handleSettingChange("expiryDays", Number(e.target.value))
              }
            />{" "}
            Expiry (days)
          </label>
          <label className="flex items-center gap-2">
            Log level
            <select
              className="border rounded px-1"
              value={settings.logLevel}
              onChange={(e) => handleSettingChange("logLevel", e.target.value)}
            >
              <option value="debug">Debug</option>
              <option value="info">Info</option>
              <option value="warn">Warn</option>
              <option value="error">Error</option>
            </select>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              className="accent-blue-600"
              checked={settings.typesEnabled.text}
              onChange={() => handleTypeToggle("text")}
            />{" "}
            Text
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              className="accent-blue-600"
              checked={settings.typesEnabled.image}
              onChange={() => handleTypeToggle("image")}
            />{" "}
            Images
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              className="accent-blue-600"
              checked={settings.typesEnabled.file}
              onChange={() => handleTypeToggle("file")}
            />{" "}
            Files
          </label>
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
