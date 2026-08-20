import React, { useEffect, useState } from "react";

export type Device = {
  deviceId: string;
  deviceName: string;
  displayName?: string;
};

export const DeviceList = () => {
  const [devices, setDevices] = useState<Device[]>([]);
  const [revocationError, setRevocationError] = useState<string | null>(null);

  useEffect(() => {
    // @ts-ignore
    chrome.runtime.sendMessage({ type: "getActiveDevices" }, (resp) => {
      setDevices(resp?.devices || []);
    });
  }, []);

  function revoke(id: string) {
    if (!globalThis.confirm("Permanently revoke this device? This cannot be undone.")) return;
    // @ts-ignore
    chrome.runtime.sendMessage({ type: "revokeDevice", id }, (response) => {
      if (!response?.ok) {
        setRevocationError(id);
        return;
      }
      setDevices((prev) => prev.filter((d) => d.deviceId !== id));
      setRevocationError(null);
    });
  }

  return (
    <div className="space-y-2">
      {devices.length === 0 && <div className="text-gray-400">(No devices)</div>}
      {revocationError && (
        <button className="text-xs text-red-600 hover:underline" onClick={() => revoke(revocationError)}>
          Could not revoke device. Retry
        </button>
      )}
      {devices.map((d) => (
        <div key={d.deviceId} className="flex items-center justify-between bg-gray-100 dark:bg-gray-800 rounded p-2">
          <span className="truncate max-w-[140px]" title={d.displayName || d.deviceName}>
            {d.displayName || d.deviceName}
          </span>
          <button className="text-xs text-red-600 hover:underline" onClick={() => revoke(d.deviceId)}>
            Revoke
          </button>
        </div>
      ))}
    </div>
  );
};
