import {
  createAndroidBackgroundContinuityCoordinator,
  type AndroidBackgroundContinuityPlatform,
} from "../../apps/android/src/backgroundContinuity";

function createPlatform(
  androidApiLevel = 36,
  notificationPermission: "granted" | "denied" = "granted",
) {
  const commands: string[] = [];
  const captureEligibility: boolean[] = [];
  let baselines = 0;
  const autoSync: boolean[] = [];
  const states: Array<{ state: string; count: number }> = [];
  let reconnectAlerts = 0;
  let enabled = false;
  const platform: AndroidBackgroundContinuityPlatform = {
    androidApiLevel: () => androidApiLevel,
    notificationPermission: async () => notificationPermission,
    readEnabled: async () => enabled,
    writeEnabled: async (next) => { enabled = next; },
    setClipboardCaptureEligible: async (next) => { captureEligibility.push(next); },
    resetClipboardBaseline: async () => { baselines += 1; },
    setAutoSync: async (next) => { autoSync.push(next); },
    startService: async () => { commands.push("start"); },
    stopService: async () => { commands.push("stop"); },
    sendHeartbeat: async () => { commands.push("heartbeat"); },
    updateService: async (state, count) => { states.push({ state, count }); },
    showReconnectNotification: async () => { reconnectAlerts += 1; },
  };
  return {
    platform,
    commands,
    enabled: () => enabled,
    captureEligibility,
    baselines: () => baselines,
    autoSync,
    states,
    reconnectAlerts: () => reconnectAlerts,
  };
}

test("only lets Android 16-or-later users opt into background continuity", async () => {
  const unsupported = createPlatform(35);
  const coordinator = createAndroidBackgroundContinuityCoordinator(unsupported.platform);

  await coordinator.setEnabledFromUser(true);

  expect({ enabled: unsupported.enabled(), commands: unsupported.commands, state: coordinator.snapshot() }).toEqual({
    enabled: false,
    commands: [],
    state: expect.objectContaining({ available: false, backgroundEnabled: false, service: "stopped" }),
  });
});

test("starts the companion service only after supported explicit opt-in", async () => {
  const fake = createPlatform();
  const coordinator = createAndroidBackgroundContinuityCoordinator(fake.platform);

  await coordinator.setEnabledFromUser(true);

  expect({ enabled: fake.enabled(), commands: fake.commands, state: coordinator.snapshot() }).toEqual({
    enabled: true,
    commands: ["start"],
    state: expect.objectContaining({ backgroundEnabled: true, service: "running", connection: "waiting" }),
  });
});

test("keeps service state stopped when native startup fails", async () => {
  const fake = createPlatform();
  fake.platform.startService = async () => {
    throw new Error("service_start_failed");
  };
  const coordinator = createAndroidBackgroundContinuityCoordinator(fake.platform);

  await expect(coordinator.setEnabledFromUser(true)).resolves.toEqual(
    expect.objectContaining({ backgroundEnabled: true, service: "stopped" }),
  );
});

test("allows clipboard observation only while resumed and focused, with a fresh baseline", async () => {
  const fake = createPlatform();
  const coordinator = createAndroidBackgroundContinuityCoordinator(fake.platform);

  await coordinator.setActivityState({ resumed: true, windowFocused: false });
  await coordinator.setActivityState({ resumed: true, windowFocused: true });
  await coordinator.setActivityState({ resumed: true, windowFocused: false });

  expect({ captureEligibility: fake.captureEligibility, baselines: fake.baselines() }).toEqual({
    captureEligibility: [true, false],
    baselines: 1,
  });
});

test("does not let a stale focus transition re-enable clipboard polling", async () => {
  const fake = createPlatform();
  let finishBaselineReset!: () => void;
  fake.platform.resetClipboardBaseline = () => new Promise<void>((resolve) => {
    finishBaselineReset = resolve;
  });
  const coordinator = createAndroidBackgroundContinuityCoordinator(fake.platform);

  const focusGained = coordinator.setActivityState({ resumed: true, windowFocused: true });
  const focusLost = coordinator.setActivityState({ resumed: true, windowFocused: false });
  await focusLost;
  finishBaselineReset();
  await focusGained;

  expect({ captureEligibility: fake.captureEligibility, state: coordinator.snapshot() }).toEqual({
    captureEligibility: [false],
    state: expect.objectContaining({ captureEligible: false }),
  });
});

test("reports a usable trusted-device connection and maps notification pause and resume to Auto Sync", async () => {
  const fake = createPlatform();
  const coordinator = createAndroidBackgroundContinuityCoordinator(fake.platform);
  await coordinator.setEnabledFromUser(true);
  await coordinator.setConnection(2);
  await coordinator.handleNotificationAction("pause");
  await coordinator.handleNotificationAction("resume");

  expect({ autoSync: fake.autoSync, state: coordinator.snapshot(), latestService: fake.states.at(-1) }).toEqual({
    autoSync: [false, true],
    state: expect.objectContaining({ connection: "connected", connectedTrustedDeviceCount: 2 }),
    latestService: { state: "connected", count: 2 },
  });
});

test("stops the empty service and posts a content-free reconnect alert when the runtime is lost", async () => {
  const fake = createPlatform();
  const coordinator = createAndroidBackgroundContinuityCoordinator(fake.platform);
  await coordinator.setEnabledFromUser(true);

  await coordinator.reportRuntimeLost();

  expect({ commands: fake.commands, reconnectAlerts: fake.reconnectAlerts(), state: coordinator.snapshot() }).toEqual({
    commands: ["start", "stop"],
    reconnectAlerts: 1,
    state: expect.objectContaining({ service: "stopped", connection: "disconnected", runtimeHealthy: false }),
  });
});

test("persists Stop before ending the service and treats task removal as a non-restarting boundary", async () => {
  const fake = createPlatform();
  const coordinator = createAndroidBackgroundContinuityCoordinator(fake.platform);
  await coordinator.setEnabledFromUser(true);
  await coordinator.handleTaskRemoved();
  await coordinator.handleNotificationAction("stop");

  expect({ enabled: fake.enabled(), commands: fake.commands, state: coordinator.snapshot() }).toEqual({
    enabled: false,
    commands: ["start", "stop"],
    state: expect.objectContaining({ backgroundEnabled: false, service: "stopped" }),
  });
});

test("reboot offers an explicit reconnect instead of creating an empty foreground service", async () => {
  const fake = createPlatform();
  await fake.platform.writeEnabled(true);
  const coordinator = createAndroidBackgroundContinuityCoordinator(fake.platform);

  await coordinator.handleBoot();

  expect({ commands: fake.commands, reconnectAlerts: fake.reconnectAlerts(), state: coordinator.snapshot() }).toEqual({
    commands: [],
    reconnectAlerts: 1,
    state: expect.objectContaining({ backgroundEnabled: true, service: "stopped" }),
  });
});

test("expires a missed Activity-runtime heartbeat through the coordinator's injectable clock", async () => {
  const fake = createPlatform();
  let now = 0;
  const coordinator = createAndroidBackgroundContinuityCoordinator(fake.platform, {
    now: () => now,
    heartbeatTimeoutMs: 60_000,
  });
  await coordinator.setEnabledFromUser(true);
  await coordinator.heartbeat();
  now = 60_000;

  await coordinator.checkHeartbeatExpiry();

  expect({ commands: fake.commands, reconnectAlerts: fake.reconnectAlerts(), state: coordinator.snapshot() }).toEqual({
    commands: ["start", "heartbeat", "stop"],
    reconnectAlerts: 1,
    state: expect.objectContaining({ connection: "disconnected", runtimeHealthy: false }),
  });
});

test("schedules runtime heartbeats through an injectable coordinator clock and cancels late ticks", async () => {
  const fake = createPlatform();
  const scheduled: Array<{ everyMs: number; tick: () => Promise<void> }> = [];
  let cancellations = 0;
  const coordinator = createAndroidBackgroundContinuityCoordinator(fake.platform, {
    schedulePeriodicHeartbeat: (tick, everyMs) => {
      scheduled.push({ tick, everyMs });
      return () => { cancellations += 1; };
    },
    heartbeatIntervalMs: 20_000,
  });
  await coordinator.setEnabledFromUser(true);

  coordinator.startRuntimeHeartbeat();
  coordinator.startRuntimeHeartbeat();
  await scheduled[0].tick();
  coordinator.stopRuntimeHeartbeat();
  coordinator.stopRuntimeHeartbeat();
  await scheduled[0].tick();

  expect({ scheduled: scheduled.map(({ everyMs }) => everyMs), cancellations, commands: fake.commands }).toEqual({
    scheduled: [20_000],
    cancellations: 1,
    commands: ["start", "heartbeat"],
  });
});

test("keeps background continuity available when notifications are denied without claiming a reconnect alert", async () => {
  const fake = createPlatform(36, "denied");
  const coordinator = createAndroidBackgroundContinuityCoordinator(fake.platform);
  await coordinator.initialize();
  await coordinator.setEnabledFromUser(true);

  await coordinator.reportRuntimeLost();

  expect({ reconnectAlerts: fake.reconnectAlerts(), state: coordinator.snapshot() }).toEqual({
    reconnectAlerts: 0,
    state: expect.objectContaining({
      available: true,
      backgroundEnabled: true,
      notificationPermission: "denied",
      service: "stopped",
    }),
  });
});

test("ignores repeated Stop and late Pause, Resume, runtime-loss, and task-removal events", async () => {
  const fake = createPlatform();
  const coordinator = createAndroidBackgroundContinuityCoordinator(fake.platform);
  await coordinator.setEnabledFromUser(true);
  await coordinator.handleNotificationAction("stop");

  await coordinator.handleNotificationAction("stop");
  await coordinator.handleNotificationAction("pause");
  await coordinator.handleNotificationAction("resume");
  await coordinator.reportRuntimeLost();
  await coordinator.handleTaskRemoved();

  expect({
    enabled: fake.enabled(),
    commands: fake.commands,
    autoSync: fake.autoSync,
    reconnectAlerts: fake.reconnectAlerts(),
    state: coordinator.snapshot(),
  }).toEqual({
    enabled: false,
    commands: ["start", "stop"],
    autoSync: [],
    reconnectAlerts: 0,
    state: expect.objectContaining({
      backgroundEnabled: false,
      service: "stopped",
      runtimeHealthy: true,
    }),
  });
});

test("Home and screen-off suspend capture without stopping background continuity", async () => {
  const fake = createPlatform();
  const coordinator = createAndroidBackgroundContinuityCoordinator(fake.platform);
  await coordinator.setEnabledFromUser(true);
  await coordinator.setActivityState({ resumed: true, windowFocused: true });

  await coordinator.setActivityState({ resumed: false, windowFocused: false });
  await coordinator.setActivityState({ resumed: true, windowFocused: true });
  await coordinator.setActivityState({ resumed: false, windowFocused: false });

  expect({
    captureEligibility: fake.captureEligibility,
    baselines: fake.baselines(),
    commands: fake.commands,
    state: coordinator.snapshot(),
  }).toEqual({
    captureEligibility: [true, false, true, false],
    baselines: 2,
    commands: ["start"],
    state: expect.objectContaining({ captureEligible: false, service: "running", runtimeHealthy: true }),
  });
});

test("publishes Waiting, Connected, Reconnecting, Paused, and Disconnected notification states", async () => {
  const fake = createPlatform();
  const coordinator = createAndroidBackgroundContinuityCoordinator(fake.platform);
  await coordinator.setEnabledFromUser(true);
  await coordinator.setConnection(2);
  await coordinator.setConnection(0);
  await coordinator.handleNotificationAction("pause");
  await coordinator.handleNotificationAction("resume");

  await coordinator.reportRuntimeLost();

  expect(fake.states).toEqual([
    { state: "waiting", count: 0 },
    { state: "connected", count: 2 },
    { state: "reconnecting", count: 0 },
    { state: "paused", count: 0 },
    { state: "reconnecting", count: 0 },
    { state: "disconnected", count: 0 },
  ]);
});
