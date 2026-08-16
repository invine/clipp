import type { RuntimeCapabilities, RuntimePlatform } from "./contract";

const INITIAL_DEVICE_NAMES = {
  electron: "Desktop",
  android: "Mobile",
  "chrome-extension": "Extension",
} as const satisfies Record<RuntimePlatform, string>;

export function initialDeviceNameForPlatform(platform: RuntimePlatform): string {
  return INITIAL_DEVICE_NAMES[platform];
}

export const RUNTIME_CAPABILITIES = {
  electron: {
    platform: "electron",
    clipboardCapture: "polling",
    relayConfiguration: "editable",
    pinPersistence: "durable",
    notificationApi: "electron",
    postRotationClipboardCapture: "baseline-current",
  },
  android: {
    platform: "android",
    clipboardCapture: "polling",
    relayConfiguration: "fixed",
    pinPersistence: "durable",
    notificationApi: "capacitor",
    postRotationClipboardCapture: "baseline-current",
  },
  chromeExtension: {
    platform: "chrome-extension",
    clipboardCapture: "explicit-input",
    relayConfiguration: "fixed",
    pinPersistence: "session",
    notificationApi: "chrome",
    postRotationClipboardCapture: "deferred",
  },
} as const satisfies Record<string, RuntimeCapabilities>;
