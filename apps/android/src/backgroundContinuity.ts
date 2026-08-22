/**
 * The public orchestration seam for the optional Android foreground-service
 * companion. It deliberately knows nothing about Capacitor, libp2p, timers, or
 * Android callbacks: callers translate those boundaries into these events.
 */
export type BackgroundConnectionState =
  | "connected"
  | "waiting"
  | "reconnecting"
  | "paused"
  | "disconnected";

export type BackgroundServiceState = "running" | "stopped";

export type AndroidBackgroundContinuitySnapshot = {
  available: boolean;
  backgroundEnabled: boolean;
  captureEligible: boolean;
  service: BackgroundServiceState;
  connection: BackgroundConnectionState;
  connectedTrustedDeviceCount: number;
  runtimeHealthy: boolean;
};

export type AndroidBackgroundContinuityPlatform = {
  androidApiLevel(): number | undefined;
  readEnabled(): Promise<boolean>;
  writeEnabled(enabled: boolean): Promise<void>;
  setClipboardCaptureEligible(eligible: boolean): Promise<void>;
  resetClipboardBaseline(): Promise<void>;
  setAutoSync(enabled: boolean): Promise<void>;
  startService(): Promise<void>;
  stopService(): Promise<void>;
  sendHeartbeat(): Promise<void>;
  updateService(state: BackgroundConnectionState, connectedTrustedDeviceCount: number): Promise<void>;
  showReconnectNotification(): Promise<void>;
};

export type AndroidBackgroundNotificationAction = "pause" | "resume" | "stop";

const ANDROID_16_API_LEVEL = 36;

export function createAndroidBackgroundContinuityCoordinator(
  platform: AndroidBackgroundContinuityPlatform,
  options: {
    now?: () => number;
    heartbeatTimeoutMs?: number;
  } = {},
) {
  const now = options.now ?? Date.now;
  const heartbeatTimeoutMs = options.heartbeatTimeoutMs ?? 60_000;
  let backgroundEnabled = false;
  let resumed = false;
  let windowFocused = false;
  let service: BackgroundServiceState = "stopped";
  let connection: BackgroundConnectionState = "waiting";
  let connectedTrustedDeviceCount = 0;
  let runtimeHealthy = true;
  let autoSync = true;
  let wasConnected = false;
  let lastHeartbeatAt: number | null = null;

  const available = (): boolean => (platform.androidApiLevel() ?? 0) >= ANDROID_16_API_LEVEL;
  const captureEligible = (): boolean => resumed && windowFocused;

  const snapshot = (): AndroidBackgroundContinuitySnapshot => ({
    available: available(),
    backgroundEnabled,
    captureEligible: captureEligible(),
    service,
    connection,
    connectedTrustedDeviceCount,
    runtimeHealthy,
  });

  async function publishServiceState(): Promise<void> {
    if (service !== "running") return;
    await platform.updateService(connection, connectedTrustedDeviceCount);
  }

  function connectionForHealthyRuntime(connectedCount: number): BackgroundConnectionState {
    if (!autoSync) return "paused";
    if (connectedCount > 0) return "connected";
    return wasConnected ? "reconnecting" : "waiting";
  }

  return {
    snapshot,

    async initialize(): Promise<AndroidBackgroundContinuitySnapshot> {
      backgroundEnabled = available() && await platform.readEnabled();
      return snapshot();
    },

    async setEnabledFromUser(enabled: boolean): Promise<AndroidBackgroundContinuitySnapshot> {
      if (enabled && !available()) return snapshot();
      backgroundEnabled = enabled;
      await platform.writeEnabled(enabled);
      if (!enabled) {
        service = "stopped";
        await platform.stopService();
        return snapshot();
      }

      runtimeHealthy = true;
      lastHeartbeatAt = now();
      connection = connectionForHealthyRuntime(connectedTrustedDeviceCount);
      service = "running";
      await platform.startService();
      await publishServiceState();
      return snapshot();
    },

    async setActivityState(next: { resumed: boolean; windowFocused: boolean }): Promise<AndroidBackgroundContinuitySnapshot> {
      const wasEligible = captureEligible();
      resumed = next.resumed;
      windowFocused = next.windowFocused;
      const eligible = captureEligible();
      if (eligible !== wasEligible) {
        if (eligible) await platform.resetClipboardBaseline();
        await platform.setClipboardCaptureEligible(eligible);
      }
      return snapshot();
    },

    async setConnection(connectedCount: number): Promise<AndroidBackgroundContinuitySnapshot> {
      connectedTrustedDeviceCount = Math.max(0, Math.floor(connectedCount));
      if (connectedTrustedDeviceCount > 0) wasConnected = true;
      if (runtimeHealthy) connection = connectionForHealthyRuntime(connectedTrustedDeviceCount);
      await publishServiceState();
      return snapshot();
    },

    async setAutoSync(enabled: boolean): Promise<AndroidBackgroundContinuitySnapshot> {
      autoSync = enabled;
      await platform.setAutoSync(enabled);
      if (runtimeHealthy) connection = connectionForHealthyRuntime(connectedTrustedDeviceCount);
      await publishServiceState();
      return snapshot();
    },

    async reflectAutoSync(enabled: boolean): Promise<AndroidBackgroundContinuitySnapshot> {
      autoSync = enabled;
      if (runtimeHealthy) connection = connectionForHealthyRuntime(connectedTrustedDeviceCount);
      await publishServiceState();
      return snapshot();
    },

    async heartbeat(): Promise<AndroidBackgroundContinuitySnapshot> {
      if (!runtimeHealthy) return snapshot();
      lastHeartbeatAt = now();
      if (service === "running") await platform.sendHeartbeat();
      return snapshot();
    },

    async checkHeartbeatExpiry(): Promise<AndroidBackgroundContinuitySnapshot> {
      if (
        service === "running"
        && lastHeartbeatAt !== null
        && now() - lastHeartbeatAt >= heartbeatTimeoutMs
      ) {
        return await this.reportRuntimeLost();
      }
      return snapshot();
    },

    async reportRuntimeLost(): Promise<AndroidBackgroundContinuitySnapshot> {
      if (!runtimeHealthy && service === "stopped") return snapshot();
      runtimeHealthy = false;
      connection = "disconnected";
      connectedTrustedDeviceCount = 0;
      await publishServiceState();
      service = "stopped";
      await platform.stopService();
      await platform.showReconnectNotification();
      return snapshot();
    },

    async handleNotificationAction(action: AndroidBackgroundNotificationAction): Promise<AndroidBackgroundContinuitySnapshot> {
      if (action === "stop") return await this.setEnabledFromUser(false);
      return await this.setAutoSync(action === "resume");
    },

    async handleTaskRemoved(): Promise<AndroidBackgroundContinuitySnapshot> {
      if (service !== "running") return snapshot();
      service = "stopped";
      await platform.stopService();
      return snapshot();
    },

    async handleBoot(): Promise<AndroidBackgroundContinuitySnapshot> {
      backgroundEnabled = available() && await platform.readEnabled();
      if (backgroundEnabled) await platform.showReconnectNotification();
      return snapshot();
    },
  };
}
