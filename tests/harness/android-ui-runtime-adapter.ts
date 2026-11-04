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
  let holdAvailabilityReads = 0;
  const releaseAvailabilityReads: ((value: typeof availability) => void)[] = [];
  let holdNextSettingsAction = false;
  let settleSettingsAction: ((error?: Error) => void) | undefined;
  let failNextSettingsAction = false;
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
        if (holdAvailabilityReads > 0) {
          holdAvailabilityReads -= 1;
          return new Promise<typeof availability>((resolve) => {
            releaseAvailabilityReads.push(resolve);
          });
        }
        return new Promise<typeof availability>((resolve) => {
          if (pendingAvailability) pendingAvailability = resolve;
          else resolve(availability);
        });
      },
      async openNotificationSettings() {
        opens++;
        if (failNextSettingsAction) {
          failNextSettingsAction = false;
          throw new Error("settings failed");
        }
        if (holdNextSettingsAction) {
          holdNextSettingsAction = false;
          await new Promise<void>((resolve, reject) => {
            settleSettingsAction = (error) =>
              error ? reject(error) : resolve();
          });
        }
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

  holdNextSettingsAction = true;
  const retiredSuccess = adapter
    .getSnapshot()
    .notificationControls?.openSettings?.();
  const duplicateAction = adapter
    .getSnapshot()
    .notificationControls?.openSettings?.();
  if (
    !adapter.getSnapshot().notificationControls?.pending ||
    Number(opens) !== 2
  )
    throw new Error("android_notification_duplicate_action_admitted");
  holdAvailabilityReads = 1;
  const passiveRefresh = adapter.getSnapshot().notificationControls?.refresh();
  for (let i = 0; i < 20 && releaseAvailabilityReads.length === 0; i++)
    await new Promise((resolve) => setTimeout(resolve, 0));
  if (releaseAvailabilityReads.length === 0)
    throw new Error("android_notification_passive_read_not_started");
  const releaseRead = releaseAvailabilityReads.shift()!;
  const passiveState = {
    app: "blocked",
    channel: "not-applicable",
    displayError: null,
  };
  releaseRead(passiveState);
  await passiveRefresh;
  if (
    adapter.getSnapshot().notificationControls?.pending !== true ||
    (adapter.getSnapshot().notificationControls?.state as { app?: string })
      ?.app !== "blocked"
  )
    throw new Error("android_notification_passive_refresh_lost_pending");
  await adapter.stop();
  await adapter.start();
  if (adapter.getSnapshot().notificationControls?.pending !== false)
    throw new Error("android_notification_pending_survived_restart");
  const replacementSnapshot = adapter.getSnapshot();
  const settleOldSuccess = settleSettingsAction as
    ((error?: Error) => void) | undefined;
  if (!settleOldSuccess)
    throw new Error("android_notification_action_not_held");
  settleSettingsAction = undefined;
  settleOldSuccess();
  await Promise.all([retiredSuccess, duplicateAction]);
  if (adapter.getSnapshot() !== replacementSnapshot)
    throw new Error("android_retired_notification_success_published");
  availability = {
    app: "available",
    channel: "available",
    displayError: null,
  };
  await adapter.getSnapshot().notificationControls?.refresh();
  if (
    (adapter.getSnapshot().notificationControls?.state as { app?: string })
      ?.app !== "available"
  )
    throw new Error("android_current_refresh_missed_native_change");

  holdAvailabilityReads = 1;
  const earlierRead = adapter.getSnapshot().notificationControls?.refresh();
  for (let i = 0; i < 20 && releaseAvailabilityReads.length === 0; i++)
    await new Promise((resolve) => setTimeout(resolve, 0));
  failNextSettingsAction = true;
  await adapter.getSnapshot().notificationControls?.openSettings?.();
  if (!adapter.getSnapshot().notificationControls?.error)
    throw new Error("android_notification_action_error_not_published");
  const finishEarlierRead = releaseAvailabilityReads.shift();
  if (!finishEarlierRead)
    throw new Error("android_notification_earlier_read_not_held");
  finishEarlierRead({
    app: "blocked",
    channel: "not-applicable",
    displayError: null,
  });
  await earlierRead;
  if (!adapter.getSnapshot().notificationControls?.error)
    throw new Error("android_earlier_read_cleared_action_error");
  holdAvailabilityReads = 1;
  const recoveryRead = adapter.getSnapshot().notificationControls?.refresh();
  for (let i = 0; i < 20 && releaseAvailabilityReads.length === 0; i++)
    await new Promise((resolve) => setTimeout(resolve, 0));
  const finishRecoveryRead = releaseAvailabilityReads.shift();
  if (!finishRecoveryRead)
    throw new Error("android_notification_recovery_read_not_held");
  finishRecoveryRead({
    app: "available",
    channel: "available",
    displayError: null,
  });
  await recoveryRead;
  if (adapter.getSnapshot().notificationControls?.error)
    throw new Error("android_successful_refresh_did_not_clear_action_error");
  holdAvailabilityReads = 2;
  const oldestRead = adapter.getSnapshot().notificationControls?.refresh();
  const newestRead = adapter.getSnapshot().notificationControls?.refresh();
  for (let i = 0; i < 20 && releaseAvailabilityReads.length < 2; i++)
    await new Promise((resolve) => setTimeout(resolve, 0));
  if (releaseAvailabilityReads.length < 2)
    throw new Error("android_notification_ordering_reads_not_held");
  releaseAvailabilityReads[1]({
    app: "blocked",
    channel: "not-applicable",
    displayError: null,
  });
  await newestRead;
  releaseAvailabilityReads[0]({
    app: "available",
    channel: "available",
    displayError: null,
  });
  await oldestRead;
  releaseAvailabilityReads.length = 0;
  if (
    (adapter.getSnapshot().notificationControls?.state as { app?: string })
      ?.app !== "blocked"
  )
    throw new Error("android_stale_notification_read_overwrote_newer_state");

  holdNextSettingsAction = true;
  const retiredFailure = adapter
    .getSnapshot()
    .notificationControls?.openSettings?.();
  for (let i = 0; i < 20 && !settleSettingsAction; i++)
    await new Promise((resolve) => setTimeout(resolve, 0));
  await adapter.stop();
  await adapter.start();
  const failureReplacementSnapshot = adapter.getSnapshot();
  const settleOldFailure = settleSettingsAction as
    ((error?: Error) => void) | undefined;
  settleSettingsAction = undefined;
  if (!settleOldFailure)
    throw new Error("android_notification_failure_action_not_held");
  settleOldFailure(new Error("retired settings action failed"));
  await retiredFailure;
  if (adapter.getSnapshot() !== failureReplacementSnapshot)
    throw new Error("android_retired_notification_failure_published");

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
