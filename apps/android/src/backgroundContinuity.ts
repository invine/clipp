import type { Clip } from "../../../packages/core/models/Clip";

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
export type BackgroundNotificationPermission = "granted" | "denied" | "unknown";

export type AndroidExplicitTextAction = {
  id: string;
  text: string;
  source: "process-text" | "send";
  event?: {
    clipId: string;
    capturedAt: number;
  };
  /** Assigned by the coordinator, never trusted from an Android intent. */
  shareNow?: true;
};

export type AndroidRetainedLiveClip = {
  clip: Clip;
  liveHandled: boolean;
};

export type AndroidBackgroundContinuitySnapshot = {
  available: boolean;
  backgroundEnabled: boolean;
  captureEligible: boolean;
  service: BackgroundServiceState;
  connection: BackgroundConnectionState;
  connectedTrustedDeviceCount: number;
  runtimeHealthy: boolean;
  notificationPermission: BackgroundNotificationPermission;
};

export type AndroidBackgroundContinuityPlatform = {
  androidApiLevel(): number | undefined;
  notificationPermission(): Promise<Exclude<BackgroundNotificationPermission, "unknown">>;
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
  listExplicitTextActions(): Promise<AndroidExplicitTextAction[]>;
  prepareExplicitTextAction(
    actionId: string,
    event: { clipId: string; capturedAt: number },
  ): Promise<void>;
  completeExplicitTextAction(actionId: string): Promise<void>;
  captureExplicitText(action: AndroidExplicitTextAction & {
    event: NonNullable<AndroidExplicitTextAction["event"]>;
    shareNow: true;
  }): Promise<Clip | null>;
  showExplicitTextFeedback(state: "accepted" | "queued" | "failed"): Promise<void>;
  readPendingClipboardApplication(): Promise<string | null>;
  writePendingClipboardApplication(clipId: string): Promise<void>;
  clearPendingClipboardApplication(): Promise<void>;
  readRetainedLiveClip(clipId: string): Promise<AndroidRetainedLiveClip | null>;
  retryRemoteClipboardApplication(clip: Clip): Promise<void>;
};

export type AndroidBackgroundNotificationAction = "pause" | "resume" | "stop";

const ANDROID_16_API_LEVEL = 36;

export function createAndroidBackgroundContinuityCoordinator(
  platform: AndroidBackgroundContinuityPlatform,
  options: {
    now?: () => number;
    heartbeatTimeoutMs?: number;
    heartbeatIntervalMs?: number;
    makeClipId?: () => string;
    schedulePeriodicHeartbeat?: (tick: () => Promise<void>, everyMs: number) => () => void;
  } = {},
) {
  const now = options.now ?? Date.now;
  const heartbeatTimeoutMs = options.heartbeatTimeoutMs ?? 60_000;
  const heartbeatIntervalMs = options.heartbeatIntervalMs ?? 20_000;
  const makeClipId = options.makeClipId ?? (() => globalThis.crypto.randomUUID());
  const schedulePeriodicHeartbeat = options.schedulePeriodicHeartbeat ?? ((tick, everyMs) => {
    const interval = setInterval(() => void tick(), everyMs);
    return () => clearInterval(interval);
  });
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
  let notificationPermission: BackgroundNotificationPermission = "unknown";
  let cancelHeartbeatSchedule: (() => void) | null = null;
  let heartbeatScheduleGeneration = 0;
  let activityStateGeneration = 0;
  let clipContinuityQueue = Promise.resolve();

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
    notificationPermission,
  });

  async function refreshNotificationPermission(): Promise<void> {
    notificationPermission = await platform.notificationPermission();
  }

  async function publishServiceState(): Promise<void> {
    if (service !== "running") return;
    await platform.updateService(connection, connectedTrustedDeviceCount);
  }

  function connectionForHealthyRuntime(connectedCount: number): BackgroundConnectionState {
    if (!autoSync) return "paused";
    if (connectedCount > 0) return "connected";
    return wasConnected ? "reconnecting" : "waiting";
  }

  async function heartbeat(): Promise<AndroidBackgroundContinuitySnapshot> {
    if (!runtimeHealthy) return snapshot();
    lastHeartbeatAt = now();
    if (service === "running") await platform.sendHeartbeat();
    return snapshot();
  }

  function serializeClipContinuity<T>(operation: () => Promise<T>): Promise<T> {
    const next = clipContinuityQueue.then(operation, operation);
    clipContinuityQueue = next.then(() => undefined, () => undefined);
    return next;
  }

  async function clearPendingClipboardApplication(expectedClipId?: string): Promise<void> {
    if (expectedClipId !== undefined) {
      const pendingClipId = await platform.readPendingClipboardApplication();
      if (pendingClipId !== expectedClipId) return;
    }
    await platform.clearPendingClipboardApplication();
  }

  async function drainExplicitTextActions(): Promise<void> {
    let actions: AndroidExplicitTextAction[];
    try {
      actions = await platform.listExplicitTextActions();
    } catch {
      await platform.showExplicitTextFeedback("failed");
      return;
    }

    for (const queued of actions) {
      if (!queued.id || !queued.text || (queued.source !== "process-text" && queued.source !== "send")) {
        await platform.showExplicitTextFeedback("failed");
        continue;
      }
      let event = queued.event;
      if (!event) {
        event = { clipId: makeClipId(), capturedAt: now() };
        try {
          await platform.prepareExplicitTextAction(queued.id, event);
        } catch {
          await platform.showExplicitTextFeedback("queued");
          continue;
        }
      }

      let accepted: Clip | null;
      try {
        accepted = await platform.captureExplicitText({ ...queued, event, shareNow: true });
      } catch {
        await platform.showExplicitTextFeedback("failed");
        continue;
      }
      if (!accepted) {
        await platform.showExplicitTextFeedback("queued");
        continue;
      }
      try {
        await platform.completeExplicitTextAction(queued.id);
        await platform.showExplicitTextFeedback("accepted");
      } catch {
        await platform.showExplicitTextFeedback("queued");
      }
    }
  }

  async function retryPendingClipboardApplication(): Promise<void> {
    const pendingClipId = await platform.readPendingClipboardApplication();
    if (!pendingClipId) return;
    const retained = await platform.readRetainedLiveClip(pendingClipId);
    if (!autoSync || !retained?.liveHandled) {
      await platform.clearPendingClipboardApplication();
      return;
    }

    // Clearing first is the durable at-most-once boundary for the resume side effect.
    await platform.clearPendingClipboardApplication();
    try {
      await platform.retryRemoteClipboardApplication(retained.clip);
    } catch {
      // One failed resume retry is terminal and deliberately never re-queued.
    }
  }

  async function handleActivityResumed(): Promise<void> {
    await drainExplicitTextActions();
    await retryPendingClipboardApplication();
  }

  return {
    snapshot,

    startRuntimeHeartbeat(): void {
      if (cancelHeartbeatSchedule) return;
      const generation = ++heartbeatScheduleGeneration;
      cancelHeartbeatSchedule = schedulePeriodicHeartbeat(async () => {
        if (!cancelHeartbeatSchedule || generation !== heartbeatScheduleGeneration) return;
        await heartbeat();
      }, heartbeatIntervalMs);
    },

    stopRuntimeHeartbeat(): void {
      if (!cancelHeartbeatSchedule) return;
      heartbeatScheduleGeneration += 1;
      const cancel = cancelHeartbeatSchedule;
      cancelHeartbeatSchedule = null;
      cancel();
    },

    async initialize(): Promise<AndroidBackgroundContinuitySnapshot> {
      backgroundEnabled = available() && await platform.readEnabled();
      if (available()) await refreshNotificationPermission();
      return snapshot();
    },

    async setEnabledFromUser(enabled: boolean): Promise<AndroidBackgroundContinuitySnapshot> {
      if (enabled && !available()) return snapshot();
      if (!enabled && !backgroundEnabled && service === "stopped") return snapshot();
      if (enabled) await refreshNotificationPermission();
      const serviceWasRunning = service === "running";
      backgroundEnabled = enabled;
      await platform.writeEnabled(enabled);
      if (!enabled) {
        service = "stopped";
        if (serviceWasRunning) await platform.stopService();
        return snapshot();
      }

      const started = await platform.startService().then(
        () => true,
        () => false,
      );
      if (!started) {
        service = "stopped";
        return snapshot();
      }

      runtimeHealthy = true;
      lastHeartbeatAt = now();
      connection = connectionForHealthyRuntime(connectedTrustedDeviceCount);
      service = "running";
      await publishServiceState();
      return snapshot();
    },

    async setActivityState(next: { resumed: boolean; windowFocused: boolean }): Promise<AndroidBackgroundContinuitySnapshot> {
      const generation = ++activityStateGeneration;
      const wasEligible = captureEligible();
      const wasResumed = resumed;
      resumed = next.resumed;
      windowFocused = next.windowFocused;
      const eligible = captureEligible();
      if (eligible !== wasEligible) {
        if (eligible) await platform.resetClipboardBaseline();
        if (generation !== activityStateGeneration) return snapshot();
        await platform.setClipboardCaptureEligible(eligible);
      }
      if (!wasResumed && resumed && generation === activityStateGeneration) {
        await serializeClipContinuity(handleActivityResumed);
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
      if (!enabled) await serializeClipContinuity(() => clearPendingClipboardApplication());
      if (runtimeHealthy) connection = connectionForHealthyRuntime(connectedTrustedDeviceCount);
      await publishServiceState();
      return snapshot();
    },

    async reflectAutoSync(enabled: boolean): Promise<AndroidBackgroundContinuitySnapshot> {
      autoSync = enabled;
      if (!enabled) await serializeClipContinuity(() => clearPendingClipboardApplication());
      if (runtimeHealthy) connection = connectionForHealthyRuntime(connectedTrustedDeviceCount);
      await publishServiceState();
      return snapshot();
    },

    async heartbeat(): Promise<AndroidBackgroundContinuitySnapshot> {
      return await heartbeat();
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
      if (service !== "running") return snapshot();
      runtimeHealthy = false;
      connection = "disconnected";
      connectedTrustedDeviceCount = 0;
      await publishServiceState();
      service = "stopped";
      await platform.stopService();
      if (notificationPermission === "granted") {
        await platform.showReconnectNotification();
      }
      return snapshot();
    },

    async handleNotificationAction(action: AndroidBackgroundNotificationAction): Promise<AndroidBackgroundContinuitySnapshot> {
      if (action === "stop") return await this.setEnabledFromUser(false);
      if (!backgroundEnabled || service !== "running") return snapshot();
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
      if (backgroundEnabled) {
        await refreshNotificationPermission();
        if (notificationPermission === "granted") {
          await platform.showReconnectNotification();
        }
      }
      return snapshot();
    },

    async handleExplicitTextActionsAvailable(): Promise<void> {
      await serializeClipContinuity(drainExplicitTextActions);
    },

    async recordLiveClipboardApplication(clip: Clip, result: "applied" | "failed"): Promise<void> {
      await serializeClipContinuity(async () => {
        if (result === "failed") {
          if (autoSync) await platform.writePendingClipboardApplication(clip.id);
          return;
        }
        await clearPendingClipboardApplication();
      });
    },

    async clearPendingClipboardApplication(expectedClipId?: string): Promise<void> {
      await serializeClipContinuity(() => clearPendingClipboardApplication(expectedClipId));
    },

    async prepareIdentityRotationCleanup(): Promise<{ rollback(): Promise<void> }> {
      return await serializeClipContinuity(async () => {
        const checkpoint = await platform.readPendingClipboardApplication();
        if (checkpoint) await platform.clearPendingClipboardApplication();
        let restored = false;
        return {
          rollback: async () => {
            if (restored || !checkpoint) return;
            restored = true;
            await serializeClipContinuity(() => platform.writePendingClipboardApplication(checkpoint));
          },
        };
      });
    },
  };
}
