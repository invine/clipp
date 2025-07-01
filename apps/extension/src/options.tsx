import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import "./styles/tailwind-built.css";
import { DeviceList } from "./components/DeviceList";
import { ClipHistoryList } from "./components/ClipHistoryList";
import { QRScanner } from "./components/QRScanner";
import { decode, encode, payloadToBase64 } from "../../../packages/core/qr";

const defaultTypes = { text: true, image: true, file: true };

const Options = () => {
  const [showQR, setShowQR] = useState(false);
  const [qrResult, setQRResult] = useState<string | null>(null);
  const [showMyQR, setShowMyQR] = useState(false);
  const [myQRImage, setMyQRImage] = useState<string | null>(null);
  const [myQRText, setMyQRText] = useState<string | null>(null);
  const [settings, setSettings] = useState({ autoSync: true, expiryDays: 365, typesEnabled: defaultTypes });

  useEffect(() => {
    // @ts-ignore
    chrome.runtime.sendMessage({ type: "getSettings" }, (resp) => {
      setSettings({
        autoSync: resp?.autoSync !== false,
        expiryDays: resp?.expiryDays || 365,
        typesEnabled: resp?.typesEnabled || defaultTypes,
      });
    });
  }, []);

  async function handleScan(payload: string) {
    setQRResult(payload);
    const pairing = await decode(payload);
    if (pairing) {
      // @ts-ignore
      chrome.runtime.sendMessage({ type: "pairDevice", pairing }, (resp) => {
        // Optionally show success/failure
      });
    }
  }

  async function generateMyQR() {
    // @ts-ignore
    chrome.runtime.sendMessage({ type: "getLocalIdentity" }, async (res) => {
      if (!res?.identity) return;
      const info = {
        deviceId: res.identity.deviceId,
        deviceName: res.identity.deviceName,
        multiaddr: res.identity.multiaddr,
      };
      const img = await encode(info);
      const txt = payloadToBase64({ ...info, timestamp: Math.floor(Date.now() / 1000), version: "1" });
      setMyQRImage(img);
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
    const newTypes = { ...settings.typesEnabled, [type]: !settings.typesEnabled[type] };
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
        {showQR && <QRScanner onScan={handleScan} />}
        {showMyQR && myQRImage && (
          <div className="mt-2 flex flex-col items-center">
            <img src={myQRImage} alt="My QR" className="w-32 h-32" />
            <button
              className="mt-2 px-2 py-1 bg-gray-700 text-white rounded"
              onClick={copyMyQR}
            >
              Copy as Text
            </button>
          </div>
        )}
        {qrResult && <div className="text-xs text-green-600 mt-2">QR scanned: {qrResult.slice(0, 32)}...</div>}
      </section>
      <section className="mb-6">
        <h2 className="font-semibold mb-2">Clipboard History</h2>
        <ClipHistoryList />
      </section>
      <section className="mb-6">
        <h2 className="font-semibold mb-2">Settings</h2>
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2">
            <input type="checkbox" className="accent-blue-600" checked={settings.autoSync} onChange={e => handleSettingChange("autoSync", e.target.checked)} /> Auto-sync
          </label>
          <label className="flex items-center gap-2">
            <input type="number" className="w-16 px-1 border rounded" min={1} max={3650} value={settings.expiryDays} onChange={e => handleSettingChange("expiryDays", Number(e.target.value))} /> Expiry (days)
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" className="accent-blue-600" checked={settings.typesEnabled.text} onChange={() => handleTypeToggle("text")} /> Text
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" className="accent-blue-600" checked={settings.typesEnabled.image} onChange={() => handleTypeToggle("image")} /> Images
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" className="accent-blue-600" checked={settings.typesEnabled.file} onChange={() => handleTypeToggle("file")} /> Files
          </label>
        </div>
      </section>
      <button className="mt-2 px-3 py-1 bg-gray-700 text-white rounded" onClick={() => {
        document.documentElement.classList.toggle('dark');
      }}>Toggle Dark Mode</button>
    </div>
  );
};

ReactDOM.createRoot(document.getElementById("root")!).render(<Options />);
