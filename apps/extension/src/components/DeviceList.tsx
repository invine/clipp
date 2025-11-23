import React, { useEffect, useState } from "react";

export type Device = {
  deviceId: string;
  deviceName: string;
  publicKey: string;
  createdAt: number;
};

export const DeviceList = () => {
  const [devices, setDevices] = useState<Device[]>([]);

  useEffect(() => {
    // @ts-ignore
    chrome.runtime.sendMessage({ type: "getTrustedDevices" }, (resp) => {
      setDevices(resp?.devices || []);
    });
  }, []);

  function revoke(id: string) {
    // @ts-ignore
    chrome.runtime.sendMessage({ type: "revokeDevice", id }, () => {
      setDevices((prev) => prev.filter((d) => d.deviceId !== id));
    });
  }

  return (
    <div className="space-y-2">
      {devices.length === 0 && <div className="text-gray-400">(No devices)</div>}
      {devices.map((d) => (
        <div key={d.deviceId} className="flex items-center justify-between bg-gray-100 dark:bg-gray-800 rounded p-2">
          <span className="truncate max-w-[140px]" title={d.deviceName}>{d.deviceName}</span>
          <button className="text-xs text-red-600 hover:underline" onClick={() => revoke(d.deviceId)}>
            Revoke
          </button>
        </div>
      ))}
    </div>
  );
};
