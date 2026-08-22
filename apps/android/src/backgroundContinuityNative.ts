import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import type {
  BackgroundConnectionState,
  BackgroundNotificationPermission,
  AndroidBackgroundDiagnosticStatus,
  AndroidExplicitTextAction,
} from "./backgroundContinuity";

type NativePlatformInfo = {
  apiLevel: number;
  userStopped: boolean;
  notificationPermission: Exclude<BackgroundNotificationPermission, "unknown">;
  observedBackgroundFailureCount: number;
  supportState: "unqualified" | "limited";
  batteryOptimizationGuidance: boolean;
};

type NativeBackgroundContinuityPlugin = {
  getPlatformInfo(): Promise<NativePlatformInfo>;
  setEnabled(options: { enabled: boolean }): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  heartbeat(): Promise<void>;
  update(options: { state: BackgroundConnectionState; connectedTrustedDeviceCount: number }): Promise<void>;
  showReconnectNotification(): Promise<void>;
  exportDiagnostics(): Promise<void>;
  getExplicitTextActions(): Promise<{ actions: string }>;
  prepareExplicitTextAction(options: { actionId: string; clipId: string; capturedAt: number }): Promise<void>;
  completeExplicitTextAction(options: { actionId: string }): Promise<void>;
  showExplicitTextFeedback(options: { state: "accepted" | "queued" | "failed" }): Promise<void>;
  getPendingClipboardApplication(): Promise<{ clipId?: string | null }>;
  setPendingClipboardApplication(options: { clipId: string }): Promise<void>;
  clearPendingClipboardApplication(): Promise<void>;
  addListener(
    eventName: "action" | "runtimeLost" | "taskRemoved" | "activityState" | "explicitText",
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
  diagnosticStatus(): Promise<AndroidBackgroundDiagnosticStatus>;
  exportDiagnostics(): Promise<void>;
  explicitTextActions(): Promise<AndroidExplicitTextAction[]>;
  prepareExplicitTextAction(actionId: string, event: { clipId: string; capturedAt: number }): Promise<void>;
  completeExplicitTextAction(actionId: string): Promise<void>;
  showExplicitTextFeedback(state: "accepted" | "queued" | "failed"): Promise<void>;
  pendingClipboardApplication(): Promise<string | null>;
  setPendingClipboardApplication(clipId: string): Promise<void>;
  clearPendingClipboardApplication(): Promise<void>;
  on(event: "action" | "runtimeLost" | "taskRemoved" | "activityState" | "explicitText", handler: (event: Record<string, unknown>) => void): Promise<() => void>;
};

function isNativeAndroid(): boolean {
  return Capacitor.getPlatform() === "android";
}

function parseExplicitTextActions(raw: string): AndroidExplicitTextAction[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is AndroidExplicitTextAction => {
      if (typeof value !== "object" || value === null) return false;
      const candidate = value as Partial<AndroidExplicitTextAction>;
      const event = candidate.event;
      return typeof candidate.id === "string"
        && typeof candidate.text === "string"
        && (candidate.source === "process-text" || candidate.source === "send")
        && (event === undefined || (
          typeof event.clipId === "string"
          && Number.isSafeInteger(event.capturedAt)
        ));
    });
  } catch {
    return [];
  }
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
    async diagnosticStatus() {
      const platform = await info();
      return {
        observedBackgroundFailureCount: Math.max(0, Math.floor(platform?.observedBackgroundFailureCount ?? 0)),
        supportState: platform?.supportState === "limited" ? "limited" : "unqualified",
        batteryOptimizationGuidance: platform?.batteryOptimizationGuidance === true,
      };
    },
    setEnabled: async (enabled) => await invoke(() => NativeBackgroundContinuity.setEnabled({ enabled })),
    async start() {
      if (!isNativeAndroid()) throw new Error("background_continuity_unavailable");
      await NativeBackgroundContinuity.start();
    },
    stop: async () => await invoke(() => NativeBackgroundContinuity.stop()),
    heartbeat: async () => await invoke(() => NativeBackgroundContinuity.heartbeat()),
    update: async (state, connectedTrustedDeviceCount) => await invoke(() => NativeBackgroundContinuity.update({ state, connectedTrustedDeviceCount })),
    showReconnectNotification: async () => await invoke(() => NativeBackgroundContinuity.showReconnectNotification()),
    async exportDiagnostics() {
      if (!isNativeAndroid()) throw new Error("diagnostic_export_unavailable");
      await NativeBackgroundContinuity.exportDiagnostics();
    },
    async explicitTextActions() {
      if (!isNativeAndroid()) return [];
      const result = await NativeBackgroundContinuity.getExplicitTextActions();
      return parseExplicitTextActions(result.actions);
    },
    async prepareExplicitTextAction(actionId, event) {
      if (!isNativeAndroid()) throw new Error("explicit_text_action_unavailable");
      await NativeBackgroundContinuity.prepareExplicitTextAction({ actionId, ...event });
    },
    async completeExplicitTextAction(actionId) {
      if (!isNativeAndroid()) throw new Error("explicit_text_action_unavailable");
      await NativeBackgroundContinuity.completeExplicitTextAction({ actionId });
    },
    showExplicitTextFeedback: async (state) => await invoke(() => NativeBackgroundContinuity.showExplicitTextFeedback({ state })),
    async pendingClipboardApplication() {
      if (!isNativeAndroid()) return null;
      const result = await NativeBackgroundContinuity.getPendingClipboardApplication();
      return typeof result.clipId === "string" ? result.clipId : null;
    },
    async setPendingClipboardApplication(clipId) {
      if (!isNativeAndroid()) throw new Error("pending_clipboard_application_unavailable");
      await NativeBackgroundContinuity.setPendingClipboardApplication({ clipId });
    },
    async clearPendingClipboardApplication() {
      if (!isNativeAndroid()) return;
      await NativeBackgroundContinuity.clearPendingClipboardApplication();
    },
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
