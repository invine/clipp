import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import type {
  BackgroundConnectionState,
  BackgroundNotificationPermission,
} from "./backgroundContinuity";

type NativePlatformInfo = {
  apiLevel: number;
  userStopped: boolean;
  notificationPermission: Exclude<BackgroundNotificationPermission, "unknown">;
};

type NativeBackgroundContinuityPlugin = {
  getPlatformInfo(): Promise<NativePlatformInfo>;
  setEnabled(options: { enabled: boolean }): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  heartbeat(): Promise<void>;
  update(options: { state: BackgroundConnectionState; connectedTrustedDeviceCount: number }): Promise<void>;
  showReconnectNotification(): Promise<void>;
  addListener(
    eventName: "action" | "runtimeLost" | "taskRemoved" | "activityState",
    listenerFunc: (event: Record<string, unknown>) => void,
  ): Promise<PluginListenerHandle>;
};

const NativeBackgroundContinuity = registerPlugin<NativeBackgroundContinuityPlugin>("BackgroundContinuity");

export type AndroidBackgroundNative = {
  apiLevel(): Promise<number | undefined>;
  userStopped(): Promise<boolean>;
  notificationPermission(): Promise<Exclude<BackgroundNotificationPermission, "unknown">>;
  setEnabled(enabled: boolean): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  heartbeat(): Promise<void>;
  update(state: BackgroundConnectionState, connectedTrustedDeviceCount: number): Promise<void>;
  showReconnectNotification(): Promise<void>;
  on(event: "action" | "runtimeLost" | "taskRemoved" | "activityState", handler: (event: Record<string, unknown>) => void): Promise<() => void>;
};

function isNativeAndroid(): boolean {
  return Capacitor.getPlatform() === "android";
}

export function createAndroidBackgroundNative(): AndroidBackgroundNative {
  const info = async (): Promise<NativePlatformInfo | null> => {
    if (!isNativeAndroid()) return null;
    try {
      return await NativeBackgroundContinuity.getPlatformInfo();
    } catch {
      return null;
    }
  };
  const invoke = async (operation: () => Promise<void>): Promise<void> => {
    if (!isNativeAndroid()) return;
    try {
      await operation();
    } catch {
      // The experimental companion is unavailable on unsupported devices and web preview.
    }
  };

  return {
    async apiLevel() {
      return (await info())?.apiLevel;
    },
    async userStopped() {
      return (await info())?.userStopped ?? false;
    },
    async notificationPermission() {
      return (await info())?.notificationPermission ?? "denied";
    },
    setEnabled: async (enabled) => await invoke(() => NativeBackgroundContinuity.setEnabled({ enabled })),
    start: async () => await invoke(() => NativeBackgroundContinuity.start()),
    stop: async () => await invoke(() => NativeBackgroundContinuity.stop()),
    heartbeat: async () => await invoke(() => NativeBackgroundContinuity.heartbeat()),
    update: async (state, connectedTrustedDeviceCount) => await invoke(() => NativeBackgroundContinuity.update({ state, connectedTrustedDeviceCount })),
    showReconnectNotification: async () => await invoke(() => NativeBackgroundContinuity.showReconnectNotification()),
    async on(event, handler) {
      if (!isNativeAndroid()) return () => undefined;
      try {
        const listener = await NativeBackgroundContinuity.addListener(event, handler);
        return () => void listener.remove();
      } catch {
        return () => undefined;
      }
    },
  };
}
