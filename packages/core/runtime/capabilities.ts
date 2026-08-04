import type { RuntimeCapabilities } from "./contract";

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
