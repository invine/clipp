import {
  createAndroidBackgroundContinuityCoordinator,
  type AndroidBackgroundContinuityPlatform,
} from "../../apps/android/src/backgroundContinuity";

function createPlatform(androidApiLevel = 36) {
  const commands: string[] = [];
  const captureEligibility: boolean[] = [];
  let baselines = 0;
  const autoSync: boolean[] = [];
  const states: Array<{ state: string; count: number }> = [];
  let reconnectAlerts = 0;
  let enabled = false;
  const platform: AndroidBackgroundContinuityPlatform = {
    androidApiLevel: () => androidApiLevel,
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
    commands: ["start", "stop", "stop"],
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
