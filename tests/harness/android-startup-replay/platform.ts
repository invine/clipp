// Public external platform ports only. All Clipp startup/capture/history code stays real.
type Listener = (event: Record<string, unknown>) => void;
type QueuedAction = {
  id: string;
  text: string;
  source: "send";
  event: { clipId: string; capturedAt: number; sharingLifetimeMs: number };
};

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const listeners = new Map<string, Listener[]>();
const preferences = new Map<string, string>();
const startup = deferred();
const queuedFeedback = deferred();
let actions: QueuedAction[] = [];
let released = false;
let clipboardText = "";
let retainedActivity = true;
const queueReadWaiters: Array<{ count: number; resolve: () => void }> = [];
export const observations = {
  feedback: [] as string[],
  completions: [] as string[],
  preparations: [] as Record<string, unknown>[],
  platformInfoHeld: 0,
  networkAttempts: 0,
  queueReads: 0,
};

export function prepareCase(
  identity: unknown,
  action?: QueuedAction,
  earlyResume = true
) {
  preferences.set(
    "clipp-android:localDeviceIdentity",
    JSON.stringify(identity)
  );
  preferences.set("clipp-android:sharingLifetimeMs", "604800000");
  preferences.set("clipp-android:localRetentionMs", "604800000");
  actions = action ? [structuredClone(action)] : [];
  retainedActivity = earlyResume;
  if (!earlyResume) {
    released = true;
    startup.resolve();
  }
}

export const fixture = {
  earlyAttemptQueued: queuedFeedback.promise,
  releaseStartup() {
    released = true;
    startup.resolve();
  },
  pendingActions: () => structuredClone(actions),
  enqueue(action: QueuedAction) {
    actions.push(structuredClone(action));
  },
  activity(resumed: boolean) {
    for (const callback of listeners.get("activityState") ?? [])
      callback({ started: true, resumed, windowFocused: resumed });
  },
  explicitText() {
    for (const callback of listeners.get("explicitText") ?? []) callback({});
  },
  queueRead(count: number): Promise<void> {
    if (observations.queueReads >= count) return Promise.resolve();
    return new Promise((resolve) => {
      queueReadWaiters.push({ count, resolve });
    });
  },
};

export const Capacitor = { getPlatform: () => "android" };
export const Preferences = {
  get: async ({ key }: { key: string }) => ({
    value: preferences.get(key) ?? null,
  }),
  set: async ({ key, value }: { key: string; value: string }) => {
    preferences.set(key, value);
  },
  remove: async ({ key }: { key: string }) => {
    preferences.delete(key);
  },
};
export const Clipboard = {
  read: async () => ({ value: clipboardText }),
  write: async ({ string }: { string: string }) => {
    clipboardText = string;
  },
};
export const LocalNotifications = {
  checkPermissions: async () => ({ display: "granted" }),
  addListener: async () => ({ remove: async () => undefined }),
  getPending: async () => ({ notifications: [] }),
  schedule: async () => undefined,
  cancel: async () => undefined,
};

const background = {
  addListener: async (name: string, callback: Listener) => {
    const callbacks = listeners.get(name) ?? [];
    callbacks.push(callback);
    listeners.set(name, callbacks);
    // Capacitor's real native plugin retains its activityState event. Delivery
    // at listener registration is a public callback ordering, not a private hook.
    if (name === "activityState" && retainedActivity)
      callback({ started: true, resumed: true, windowFocused: true });
    return {
      remove: async () => {
        listeners.set(
          name,
          callbacks.filter((item) => item !== callback)
        );
      },
    };
  },
  getPlatformInfo: async () => {
    if (!released) {
      observations.platformInfoHeld++;
      await startup.promise;
    }
    return {
      apiLevel: 35,
      userStopped: false,
      enabled: false,
      enabledPersistenceKnown: true,
      serviceRunning: false,
      actionToken: null,
      notificationAvailability: "available",
      observedBackgroundFailureCount: 0,
      supportState: "unqualified",
      batteryOptimizationGuidance: false,
    };
  },
  getPairingNotificationAvailability: async () => ({
    app: "available",
    channel: "available",
  }),
  getExplicitTextActions: async () => {
    observations.queueReads++;
    for (const waiter of queueReadWaiters)
      if (observations.queueReads >= waiter.count) waiter.resolve();
    return { actions: JSON.stringify(actions) };
  },
  prepareExplicitTextAction: async (event: Record<string, unknown>) => {
    observations.preparations.push(structuredClone(event));
    throw new Error("Prepared event must retain its original native metadata");
  },
  completeExplicitTextAction: async ({ actionId }: { actionId: string }) => {
    observations.completions.push(actionId);
    actions = actions.filter((action) => action.id !== actionId);
  },
  showExplicitTextFeedback: async ({ state }: { state: string }) => {
    observations.feedback.push(state);
    if (state === "queued") queuedFeedback.resolve();
  },
  getPendingClipboardApplication: async () => ({ clipId: null }),
  clearPendingClipboardApplication: async () => undefined,
  stop: async () => undefined,
  heartbeat: async () => undefined,
  update: async () => undefined,
  showControlFeedback: async () => undefined,
};

const reset = {
  ...Preferences,
  openRuntime: async () => undefined,
  acquireFence: async () => undefined,
  releaseFence: async () => undefined,
  verifyNativeQueues: async () => undefined,
  clearNativeQueues: async () => {
    actions = [];
  },
};
const relay = {
  addListener: async () => ({ remove: async () => undefined }),
};
export function registerPlugin(name: string) {
  if (name === "BackgroundContinuity") return background;
  if (name === "IdentityResetStorage") return reset;
  if (name === "ManagedRelay") return relay;
  throw new Error("Unmodelled public native plugin: " + name);
}

// This is libp2p's external package boundary, not Clipp's transport module.
// It cannot open a host socket or pretend to have a successful network session.
export async function createLibp2p(): Promise<never> {
  observations.networkAttempts++;
  throw new Error("source_startup_fixture_network_unavailable");
}
