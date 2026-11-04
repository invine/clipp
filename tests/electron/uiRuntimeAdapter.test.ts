import type {} from "../../apps/electron/src/preload";
import { createUiSession } from "../../packages/ui/src/uiSession";
import { createElectronUiRuntimeAdapter } from "../../apps/electron/src/uiRuntimeAdapter";
import type { RuntimeNotificationAvailability } from "../../packages/core/runtime/notifications";
import {
  verifyUiRuntimeLifecycleConformance,
  verifyUiRuntimeSnapshotConformance,
} from "../ui/runtimeAdapterConformance";

function electronBridge() {
  let update: Function | undefined;
  let settingsUpdate: Function | undefined;
  let notificationUpdate: (() => void) | undefined;
  const unsubs = jest.fn();
  const state = {
    clips: [],
    devices: [],
    pending: [],
    waiting: [],
    pairingErrors: [],
    pairingState: { sessionId: "runtime-one", revision: 1, outcomes: [] },
    peers: [],
    identity: {
      deviceId: "device-one",
      deviceName: "Device One",
      peerId: "peer-one",
    },
    relayAddresses: [],
    pinnedIds: [],
  };
  const snapshot = {
    sessionId: "settings-one",
    revision: 1,
    state: { autoSync: true, theme: "system", localRetentionMs: 86400000 },
  };
  const bridge = {
    getState: jest.fn(async () => state),
    onUpdate: jest.fn((listener: Function) => {
      update = listener;
      return unsubs;
    }),
    getRuntimeAuthority: jest.fn(async () => "runtime-one"),
    getInitializationError: jest.fn(async () => null),
    getSettings: jest.fn(async () => ({ ok: true, snapshot })),
    setSettings: jest.fn(async () => ({ status: "applied", snapshot })),
    onSettingsUpdate: jest.fn((listener: Function) => {
      settingsUpdate = listener;
      return unsubs;
    }),
    getNotificationAvailability: jest.fn(async () => ({
      app: "available",
      channel: "not-applicable",
      displayError: null,
    })),
    onNotificationAvailabilityChanged: jest.fn((listener: () => void) => {
      notificationUpdate = listener;
      return unsubs;
    }),
    onTaskActivation: jest.fn(() => unsubs),
    setTaskInputReady: jest.fn(async () => {}),
    getApprovalEntries: jest.fn(async () => []),
    acknowledgeApprovalEntry: jest.fn(async () => {}),
    onApprovalEntriesChanged: jest.fn(() => unsubs),
    pairFromText: jest.fn(async () => ({ ok: true })),
    deleteClip: jest.fn(async () => {}),
    unpairDevice: jest.fn(async () => {}),
    renameDevice: jest.fn(async () => {}),
    acceptRequest: jest.fn(async () => ({ ok: true })),
    rejectRequest: jest.fn(async () => ({ ok: true })),
    dismissPairingOutcome: jest.fn(async () => true),
    openQrWindow: jest.fn(async () => null),
    copyPairingText: jest.fn(async () => ({ status: "copied" })),
    reuseClip: jest.fn(async () => ({ outcome: "completed" })),
    shareNow: jest.fn(async () => ({ status: "completed" })),
    setPinned: jest.fn(async () => {}),
    clearHistory: jest.fn(async () => {}),
    dismissClipboardHistoryError: jest.fn(async () => {}),
    retryHistoryCleanup: jest.fn(async () => {}),
    acknowledgeIdentityRotationNotice: jest.fn(async () => {}),
    setLocalRetention: jest.fn(async () => {}),
    setAutoSync: jest.fn(async () => ({ status: "applied" })),
    refreshAutoSync: jest.fn(async () => true),
    renameIdentity: jest.fn(async () => {}),
    retryIdentityInitialization: jest.fn(async () => {}),
    refreshManagedRelays: jest.fn(async () => []),
    mutateManagedRelay: jest.fn(async () => ({ status: "applied" })),
    managedRelayLogin: jest.fn(async () => ({ status: "completed" })),
    managedRelayAccount: jest.fn(async () => ({ status: "completed" })),
    managedRelayRetry: jest.fn(async () => ({ status: "completed" })),
    identityReset: {
      begin: jest.fn(async () => ({ status: "unavailable" })),
      reconcile: jest.fn(async () => ({ phase: "idle" })),
      resume: jest.fn(async () => ({ status: "unavailable" })),
      dismiss: jest.fn(async () => ({ phase: "idle" })),
      copyFormerPeerId: jest.fn(async () => ({ status: "copied" })),
    },
    onLog: jest.fn(() => unsubs),
  } as unknown as Window["clipp"];
  return {
    bridge,
    unsubs,
    getUpdate: () => update,
    getSettingsUpdate: () => settingsUpdate,
    getNotificationUpdate: () => notificationUpdate,
    state,
  };
}

it("owns Electron bridge subscriptions and publishes the current runtime snapshot", async () => {
  const fixture = electronBridge();
  const adapter = createElectronUiRuntimeAdapter(
    fixture.bridge,
    createUiSession()
  );
  const changed = jest.fn();
  const unsubscribe = adapter.subscribe(changed);

  expect(adapter.getSnapshot().identity).toBeNull();
  await adapter.start?.();
  expect(adapter.getSnapshot().identity?.deviceId).toBe("device-one");
  expect(adapter.getSnapshot().appearanceSettings?.snapshot?.revision).toBe(1);
  expect(adapter.getSnapshot().appearanceSettings).not.toHaveProperty("save");
  expect(adapter.getSnapshot().appearanceSettings).not.toHaveProperty(
    "refresh"
  );
  expect(adapter.actions.onSaveAppearanceSettings).toBeDefined();
  expect(adapter.actions.onRefreshAppearanceSettings).toBeDefined();
  expect(fixture.bridge.onUpdate).toHaveBeenCalledTimes(1);
  expect(fixture.bridge.onSettingsUpdate).toHaveBeenCalledTimes(1);
  expect(
    fixture.bridge.onNotificationAvailabilityChanged
  ).toHaveBeenCalledTimes(1);

  fixture.getSettingsUpdate()?.({
    sessionId: "settings-one",
    revision: 2,
    state: { autoSync: false, theme: "dark", localRetentionMs: 86400000 },
  });
  expect(adapter.getSnapshot().appearanceSettings?.snapshot?.revision).toBe(2);
  fixture.getNotificationUpdate()?.();
  await Promise.resolve();
  expect(fixture.bridge.getNotificationAvailability).toHaveBeenCalledTimes(2);

  await fixture.getUpdate()?.({
    ...fixture.state,
    pairingState: { sessionId: "runtime-one", revision: 2, outcomes: [] },
    identity: null,
  });
  expect(adapter.getSnapshot().identity).toBeNull();
  expect(changed).toHaveBeenCalled();

  unsubscribe();
  await adapter.stop?.();
  expect(fixture.unsubs).toHaveBeenCalled();
});

it("publishes stable snapshots before notifying and preserves previous observations", async () => {
  const fixture = electronBridge();
  let availability: RuntimeNotificationAvailability = {
    app: "available",
    channel: "not-applicable",
    displayError: null,
  };
  Object.assign(fixture.bridge, {
    getNotificationAvailability: jest.fn(async () => availability),
  });
  const adapter = createElectronUiRuntimeAdapter(
    fixture.bridge,
    createUiSession()
  );
  const { previous: before, current: afterRuntimePublication } =
    await verifyUiRuntimeSnapshotConformance({
      adapter,
      afterStart: () => new Promise((resolve) => setImmediate(resolve)),
      publishObservation: async () => {
        await fixture.getUpdate()?.({
          ...fixture.state,
          identity: {
            deviceId: "device-two",
            deviceName: "Device Two",
            peerId: "peer-two",
          },
        });
      },
    });
  expect(adapter.capabilities.actions).toContain("onShareNow");
  expect(adapter.capabilities.cameraScanning).toBe(false);
  expect(adapter.capabilities.notifications).toEqual({
    openSettings: false,
    requestPermission: false,
  });
  expect(before.identity?.deviceId).toBe("device-one");
  expect(before.notificationControls?.state?.app).toBe("available");
  expect(afterRuntimePublication.identity?.deviceId).toBe("device-two");
  expect(before.identity?.deviceId).toBe("device-one");

  availability = {
    app: "blocked",
    channel: "not-applicable",
    displayError: "permission_denied",
  };
  fixture.getNotificationUpdate()?.();
  await new Promise((resolve) => setImmediate(resolve));
  const afterNotificationPublication = adapter.getSnapshot();
  expect(afterNotificationPublication).not.toBe(afterRuntimePublication);
  expect(afterNotificationPublication.notificationControls?.state?.app).toBe(
    "blocked"
  );
  expect(before.notificationControls?.state?.app).toBe("available");

  await adapter.stop?.();
});

it("drives a public action and stop without accepting a retired host callback", async () => {
  const fixture = electronBridge();
  const adapter = createElectronUiRuntimeAdapter(
    fixture.bridge,
    createUiSession()
  );

  await verifyUiRuntimeLifecycleConformance({
    adapter,
    exerciseAction: async () => {
      await adapter.actions.onSetAutoSync?.(false);
    },
    publishRetiredObservation: async () => {
      await fixture.getUpdate()?.({
        ...fixture.state,
        identity: {
          deviceId: "retired-device",
          deviceName: "Retired Device",
          peerId: "retired-peer",
        },
      });
    },
  });

  expect(fixture.bridge.setAutoSync).toHaveBeenCalledWith(false);
});

it("translates shared UI actions through the production Electron bridge", async () => {
  const fixture = electronBridge();
  const adapter = createElectronUiRuntimeAdapter(
    fixture.bridge,
    createUiSession()
  );

  await adapter.actions.onPairText?.("pairing-text");
  expect(fixture.bridge.pairFromText).toHaveBeenCalledWith("pairing-text");
  await adapter.actions.onRenameDevice?.("device-one", "Alias");
  expect(fixture.bridge.renameDevice).toHaveBeenCalledWith(
    "device-one",
    "Alias"
  );
  await adapter.start?.();
  await adapter.actions.onSetAutoSync?.(false);
  expect(fixture.bridge.setAutoSync).toHaveBeenCalledWith(false);
  await adapter.stop?.();
});

it("guards duplicate notification actions and settles pending/error through the public controls", async () => {
  const fixture = electronBridge();
  let resolveAction!: () => void;
  const openNotificationSettings = jest.fn(
    () =>
      new Promise<void>((resolve) => {
        resolveAction = resolve;
      })
  );
  Object.assign(fixture.bridge, { openNotificationSettings });
  const adapter = createElectronUiRuntimeAdapter(
    fixture.bridge,
    createUiSession()
  );
  await adapter.start?.();
  const controls = adapter.getSnapshot().notificationControls!;
  const first = controls.openSettings!();
  const duplicate = controls.openSettings!();
  expect(adapter.getSnapshot().notificationControls?.pending).toBe(true);
  expect(openNotificationSettings).toHaveBeenCalledTimes(1);
  resolveAction();
  await Promise.all([first, duplicate]);
  expect(adapter.getSnapshot().notificationControls?.pending).toBe(false);
  expect(adapter.getSnapshot().notificationControls?.error).toBe(false);
  await adapter.stop?.();

  const failed = electronBridge();
  Object.assign(failed.bridge, {
    openNotificationSettings: jest.fn(async () => {
      throw new Error("denied");
    }),
  });
  const failedAdapter = createElectronUiRuntimeAdapter(
    failed.bridge,
    createUiSession()
  );
  await failedAdapter.start?.();
  const failedControls = failedAdapter.getSnapshot().notificationControls!;
  await failedControls.openSettings!();
  expect(failedAdapter.getSnapshot().notificationControls?.pending).toBe(false);
  expect(failedAdapter.getSnapshot().notificationControls?.error).toBe(true);
  await failedAdapter.stop?.();
});
