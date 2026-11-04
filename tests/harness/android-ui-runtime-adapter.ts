import { createAndroidUiRuntimeAdapter } from "../../apps/android/src/uiRuntimeAdapter";
import {
  verifyUiRuntimeLifecycleConformance,
  verifyUiRuntimeSnapshotConformance,
} from "../ui/runtimeAdapterConformance";

type State = {
  clips: Array<{ id: string; retained: { label: string } }>;
  devices: unknown[];
  pending: unknown[];
  waiting: unknown[];
  pairingErrors: unknown[];
  peers: string[];
  peerConnections: unknown[];
  relayConnections: unknown[];
  identity: { deviceId: string; deviceName: string };
  pinnedIds: string[];
  relayAddresses: string[];
  pairingState: { sessionId: string; revision: number; outcomes: unknown[] };
};

const initialState: State = {
  clips: [{ id: "clip-a", retained: { label: "retained" } }],
  devices: [],
  pending: [],
  waiting: [],
  pairingErrors: [],
  peers: [],
  peerConnections: [],
  relayConnections: [],
  identity: { deviceId: "android-a", deviceName: "Android A" },
  pinnedIds: [],
  relayAddresses: [],
  pairingState: { sessionId: "runtime-a", revision: 1, outcomes: [] },
};

export async function runAndroidUiRuntimeAdapterConformance() {
  const subscriptions: {
    runtime?: (state: State) => void;
    availability?: () => void;
    settings?: (snapshot: unknown) => void;
  } = {};
  let availability = {
    app: "available",
    channel: "available",
    displayError: null,
  };
  let pendingAvailability: ((value: typeof availability) => void) | undefined;
  let opens = 0;
  let availabilityReads = 0;
  let state = initialState;
  const runtime = {
    client: {
      async getState() {
        return state;
      },
      async getInitializationError() {
        return null;
      },
      async getRuntimeAuthority() {
        return "runtime-a";
      },
      onUpdate(listener: (next: State) => void) {
        subscriptions.runtime = listener;
        return () => {
          subscriptions.runtime = undefined;
        };
      },
      onNotificationAvailabilityChanged(listener: () => void) {
        subscriptions.availability = listener;
        return () => {
          subscriptions.availability = undefined;
        };
      },
      async getNotificationAvailability() {
        availabilityReads++;
        return new Promise<typeof availability>((resolve) => {
          if (pendingAvailability) pendingAvailability = resolve;
          else resolve(availability);
        });
      },
      async openNotificationSettings() {
        opens++;
      },
      async requestNotificationPermission() {
        return "granted";
      },
      async getSettings() {
        return {
          ok: true,
          snapshot: {
            sessionId: "settings-a",
            revision: 1,
            state: { theme: "light" },
          },
        };
      },
      onSettingsUpdate(listener: (snapshot: unknown) => void) {
        subscriptions.settings = listener;
        return () => {
          subscriptions.settings = undefined;
        };
      },
      async setSettings() {
        return {
          status: "confirmed",
          snapshot: {
            sessionId: "settings-a",
            revision: 2,
            state: { theme: "dark" },
          },
        };
      },
      async getApprovalEntries() {
        return [];
      },
      async acknowledgeApprovalEntry() {},
      onApprovalEntriesChanged() {
        return () => undefined;
      },
    },
    async start() {},
    async stop() {},
    identityReset: { async reset() {} },
  } as never;
  const adapter = createAndroidUiRuntimeAdapter(
    runtime,
    { open: async () => undefined } as never,
    {} as never,
    { permission: "granted", scan: async () => null } as never
  );
  await adapter.start();
  for (let i = 0; i < 20; i++)
    await new Promise((resolve) => setTimeout(resolve, 0));

  const afterStartReads = availabilityReads;
  window.dispatchEvent(new Event("focus"));
  for (let i = 0; i < 20; i++)
    await new Promise((resolve) => setTimeout(resolve, 0));
  if (availabilityReads !== afterStartReads + 1)
    throw new Error("android_focus_not_translated");
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => "hidden",
  });
  document.dispatchEvent(new Event("visibilitychange"));
  for (let i = 0; i < 20; i++)
    await new Promise((resolve) => setTimeout(resolve, 0));
  if (availabilityReads !== afterStartReads + 1)
    throw new Error("android_hidden_visibility_not_ignored");
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => "visible",
  });
  document.dispatchEvent(new Event("visibilitychange"));
  for (let i = 0; i < 20; i++)
    await new Promise((resolve) => setTimeout(resolve, 0));
  if (availabilityReads !== afterStartReads + 2)
    throw new Error("android_visible_visibility_not_translated");

  await verifyUiRuntimeSnapshotConformance({
    adapter,
    afterStart: async () => {
      for (let i = 0; i < 20; i++)
        await new Promise((resolve) => setTimeout(resolve, 0));
    },
    publishObservation: async () => {
      state = {
        ...state,
        pairingState: { ...state.pairingState, revision: 2 },
      };
      subscriptions.runtime?.(state);
      for (let i = 0; i < 20; i++)
        await new Promise((resolve) => setTimeout(resolve, 0));
    },
  });

  const previous = adapter.getSnapshot();
  const retainedClip = previous.clips[0];
  if (adapter.getSnapshot() !== previous)
    throw new Error("android_initial_snapshot_not_stable");
  let duringNotification: unknown;
  const removeObserver = adapter.subscribe(() => {
    duringNotification = adapter.getSnapshot();
  });

  availability = {
    app: "blocked",
    channel: "not-applicable",
    displayError: null,
  };
  subscriptions.availability?.();
  for (let i = 0; i < 20; i++)
    await new Promise((resolve) => setTimeout(resolve, 0));
  const current = adapter.getSnapshot();
  if (current === previous || duringNotification !== current)
    throw new Error("android_notification_publication_order");
  if (
    (retainedClip as unknown as (typeof initialState.clips)[number]).retained
      .label !== "retained" ||
    (previous.clips[0] as unknown as (typeof initialState.clips)[number])
      .retained.label !== "retained"
  )
    throw new Error("android_retained_nested_value_changed");
  if (
    (current.notificationControls?.state as { app?: string } | null)?.app !==
    "blocked"
  )
    throw new Error("android_notification_translation_failed");
  if (
    current.appearanceSettings?.snapshot?.revision !== 1 ||
    current.clips[0].id !== "clip-a"
  )
    throw new Error("android_settings_and_history_authorities_conflated");
  subscriptions.settings?.({
    sessionId: "settings-a",
    revision: 2,
    state: { theme: "dark" },
  });
  for (let i = 0; i < 20; i++)
    await new Promise((resolve) => setTimeout(resolve, 0));
  if (
    adapter.getSnapshot().appearanceSettings?.snapshot?.revision !== 2 ||
    adapter.getSnapshot().clips[0].id !== "clip-a"
  )
    throw new Error("android_settings_publication_changed_history");
  if (
    !adapter.capabilities.notifications.openSettings ||
    !adapter.capabilities.notifications.requestPermission ||
    !adapter.capabilities.cameraScanning ||
    !adapter.capabilities.identityReset
  )
    throw new Error("android_capabilities_missing");
  await current.notificationControls?.openSettings?.();
  if (opens !== 1)
    throw new Error("android_notification_action_not_translated");

  const firstRuntimeListener = subscriptions.runtime;
  let beforeStop: ReturnType<typeof adapter.getSnapshot> | undefined;
  await verifyUiRuntimeLifecycleConformance({
    adapter,
    exerciseAction: async () => {
      await adapter.getSnapshot().notificationControls?.openSettings?.();
      beforeStop = adapter.getSnapshot();
    },
    publishRetiredObservation: async () => {
      firstRuntimeListener?.({
        ...state,
        pairingState: { ...state.pairingState, revision: 99 },
      });
      await Promise.resolve();
    },
  });
  if (!beforeStop || adapter.getSnapshot() !== beforeStop)
    throw new Error("android_retired_client_callback_published");
  if (
    subscriptions.runtime ||
    subscriptions.availability ||
    subscriptions.settings
  )
    throw new Error("android_listeners_survived_stop");
  const afterStopReads = availabilityReads;
  window.dispatchEvent(new Event("focus"));
  document.dispatchEvent(new Event("visibilitychange"));
  for (let i = 0; i < 20; i++)
    await new Promise((resolve) => setTimeout(resolve, 0));
  if (availabilityReads !== afterStopReads)
    throw new Error("android_dom_listener_survived_stop");
  await adapter.start();
  for (let i = 0; i < 20; i++)
    await new Promise((resolve) => setTimeout(resolve, 0));
  if (
    !subscriptions.runtime ||
    !subscriptions.availability ||
    !subscriptions.settings
  )
    throw new Error("android_listeners_not_restarted");
  const restartedReads = availabilityReads;
  window.dispatchEvent(new Event("focus"));
  for (let i = 0; i < 20; i++)
    await new Promise((resolve) => setTimeout(resolve, 0));
  if (availabilityReads !== restartedReads + 1)
    throw new Error("android_focus_listener_not_restarted");
  state = {
    ...state,
    pairingState: {
      ...state.pairingState,
      revision: 3,
      outcomes: [{ targetPeerId: "peer-a", status: "rejected" }],
    },
  };
  (subscriptions as unknown as { runtime?: (next: State) => void }).runtime?.(
    state
  );
  for (let i = 0; i < 20; i++)
    await new Promise((resolve) => setTimeout(resolve, 0));
  if (adapter.getSnapshot().pairingOutcomes?.length !== 1)
    throw new Error("android_client_observation_not_published");
  removeObserver();
  await adapter.stop();
  return {
    ok: true,
    opens,
    priorRevision: previous.pairingOutcomes,
    capabilities: adapter.capabilities,
  };
}

Object.assign(globalThis, { runAndroidUiRuntimeAdapterConformance });
