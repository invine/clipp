import {
  createAndroidBackgroundContinuityCoordinator,
  type AndroidBackgroundDiagnosticStatus,
  type AndroidBackgroundContinuityPlatform,
} from "../../apps/android/src/backgroundContinuity";
import { createIdentityBoundWorkFence } from "../../packages/core/runtime/identityInitialization";
import { createAndroidIdentityResetRuntime } from "../../apps/android/src/identityResetRuntime";

function createPlatform(
  androidApiLevel = 36,
  notificationAvailability: "available" | "blocked" = "available"
) {
  const commands: string[] = [];
  const captureEligibility: boolean[] = [];
  let baselines = 0;
  const autoSync: boolean[] = [];
  let savedAutoSync = true;
  const states: Array<{ state: string; count: number }> = [];
  let reconnectAlerts = 0;
  let enabled = false;
  let diagnosticStatus = {
    observedBackgroundFailureCount: 0,
    supportState: "unqualified" as const,
    batteryOptimizationGuidance: false,
  };
  const platform: AndroidBackgroundContinuityPlatform = {
    androidApiLevel: () => androidApiLevel,
    notificationAvailability: async () => notificationAvailability,
    readEnabled: async () => enabled,
    readAutoSync: async () => savedAutoSync,
    writeEnabled: async (next) => {
      enabled = next;
    },
    setClipboardCaptureEligible: async (next) => {
      captureEligibility.push(next);
    },
    resetClipboardBaseline: async () => {
      baselines += 1;
    },
    setAutoSync: async (next) => {
      autoSync.push(next);
      savedAutoSync = next;
      return next;
    },
    startService: async () => {
      commands.push("start");
    },
    stopService: async () => {
      commands.push("stop");
    },
    sendHeartbeat: async () => {
      commands.push("heartbeat");
    },
    updateService: async (state, count) => {
      states.push({ state, count });
    },
    showReconnectNotification: async () => {
      reconnectAlerts += 1;
    },
    readDiagnosticStatus: async () => diagnosticStatus,
    listExplicitTextActions: async () => [],
    prepareExplicitTextAction: async () => undefined,
    completeExplicitTextAction: async () => undefined,
    readAcceptedExplicitTextAction: async () => null,
    captureExplicitText: async () => null,
    showExplicitTextFeedback: async () => undefined,
    readPendingClipboardApplication: async () => null,
    writePendingClipboardApplication: async () => undefined,
    clearPendingClipboardApplication: async () => undefined,
    removeClip: async () => undefined,
    clearHistory: async () => undefined,
    readRetainedLiveClip: async () => null,
    retryRemoteClipboardApplication: async () => false,
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
    setDiagnosticStatus(next: AndroidBackgroundDiagnosticStatus) {
      diagnosticStatus = next as typeof diagnosticStatus;
    },
  };
}

test("manual reset suspends continuity and capture without changing saved background mode or Auto Sync", async () => {
  const fake = createPlatform();
  const coordinator = createAndroidBackgroundContinuityCoordinator(
    fake.platform
  );
  await coordinator.initialize();
  await coordinator.setEnabledFromUser(true);
  await coordinator.setActivityState({ resumed: true, windowFocused: true });
  await coordinator.suspendForIdentityReset();
  expect(fake.enabled()).toBe(true);
  expect(fake.autoSync).toEqual([]);
  expect(fake.captureEligibility.at(-1)).toBe(false);
  expect(coordinator.snapshot()).toMatchObject({
    service: "stopped",
    captureEligible: false,
    backgroundEnabled: true,
  });
});

test("manual reset waits for an admitted Start before confirming the companion is stopped", async () => {
  const fake = createPlatform();
  let running = false;
  let started!: () => void;
  const startEntered = new Promise<void>((resolve) => {
    started = resolve;
  });
  let finishStart!: () => void;
  const startCompletion = new Promise<void>((resolve) => {
    finishStart = resolve;
  });
  fake.platform.startService = async () => {
    started();
    await startCompletion;
    running = true;
  };
  fake.platform.stopService = async () => {
    running = false;
  };
  fake.platform.readServiceState = async () =>
    running ? "running" : "stopped";
  const coordinator = createAndroidBackgroundContinuityCoordinator(
    fake.platform
  );
  await coordinator.initialize();
  const starting = coordinator.setEnabledFromUser(true);
  await startEntered;
  let suspended = false;
  const suspending = coordinator.suspendForIdentityReset().then(() => {
    suspended = true;
  });
  // Give suspension every opportunity to complete while native Start is pending.
  await new Promise<void>((resolve) => setImmediate(resolve));
  const suspendedBeforeStartFinished = suspended;
  finishStart();
  await Promise.all([starting, suspending]);
  expect(suspendedBeforeStartFinished).toBe(false);
  expect(running).toBe(false);
  expect(coordinator.snapshot()).toMatchObject({
    service: "stopped",
    backgroundEnabled: true,
    autoSync: true,
  });
});

test("reset admission drains scheduled heartbeats and refuses controls until its provisional fence is released", async () => {
  const fake = createPlatform();
  const workFence = createIdentityBoundWorkFence();
  let tick!: () => Promise<void>;
  const options = {
    workFence,
    schedulePeriodicHeartbeat(next: () => Promise<void>) {
      tick = next;
      return () => {};
    },
  };
  const coordinator = createAndroidBackgroundContinuityCoordinator(
    fake.platform,
    options
  );
  await coordinator.setEnabledFromUser(true);
  let entered!: () => void;
  const heartbeatEntered = new Promise<void>((resolve) => {
    entered = resolve;
  });
  let finish!: () => void;
  fake.platform.sendHeartbeat = () => {
    entered();
    return new Promise<void>((resolve) => {
      finish = resolve;
    });
  };
  coordinator.startRuntimeHeartbeat();
  const heartbeat = tick();
  await heartbeatEntered;
  const fence = await workFence.acquireFence();
  let drained = false;
  const draining = workFence.quiesce().then(() => {
    drained = true;
  });
  await new Promise<void>((resolve) => setImmediate(resolve));
  const drainedBeforeHeartbeatFinished = drained;
  finish();
  await Promise.all([heartbeat, draining]);
  expect(drainedBeforeHeartbeatFinished).toBe(false);
  expect(() => coordinator.setEnabledFromUser(true)).toThrow(
    "identity_runtime_suspended"
  );
  expect(() => coordinator.handleNotificationAction("stop")).toThrow(
    "identity_runtime_suspended"
  );
  let lateHeartbeat = false;
  fake.platform.sendHeartbeat = async () => {
    lateHeartbeat = true;
  };
  await tick();
  expect(lateHeartbeat).toBe(false);
  await coordinator.suspendForIdentityReset();
  expect(coordinator.snapshot().service).toBe("stopped");
  await tick(); // A stale scheduled callback cannot enter the sealed runtime.
  await fence.release();
  await coordinator.setEnabledFromUser(true);
  expect(coordinator.snapshot().service).toBe("running");
  expect(fake.enabled()).toBe(true);
});

test("the Android reset lifecycle reaps admitted Activity capture before native queue cleanup", async () => {
  const fake = createPlatform();
  let captureEligible = false;
  let cleared = false;
  let coordinator: ReturnType<
    typeof createAndroidBackgroundContinuityCoordinator
  >;
  const runtime = createAndroidIdentityResetRuntime({
    native: {
      acquireFence: async () => {},
      releaseFence: async () => {},
      clearNativeQueues: async () => {
        cleared = true;
      },
      verifyNativeQueues: async () => {},
      openRuntime: async () => {},
      restartRuntime: async () => {},
    },
    suspend: () => coordinator.suspendForIdentityReset(),
  });
  coordinator = createAndroidBackgroundContinuityCoordinator(fake.platform, {
    workFence: runtime.workFence,
  });
  await coordinator.setEnabledFromUser(true);
  let entered!: () => void;
  const captureEntered = new Promise<void>((resolve) => {
    entered = resolve;
  });
  let finish!: () => void;
  fake.platform.setClipboardCaptureEligible = async (eligible) => {
    if (eligible) {
      entered();
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
    }
    captureEligible = eligible;
  };
  const resuming = coordinator.setActivityState({
    resumed: true,
    windowFocused: true,
  });
  await captureEntered;
  await runtime.lifecycle.acquireFence();
  const resetting = runtime.lifecycle.quiesce();
  await new Promise<void>((resolve) => setImmediate(resolve));
  const clearedBeforeCaptureSettled = cleared;
  finish();
  await Promise.all([resuming, resetting]);
  expect(clearedBeforeCaptureSettled).toBe(false);
  expect(cleared).toBe(true);
  expect(captureEligible).toBe(false);
  expect(coordinator.snapshot()).toMatchObject({
    captureEligible: false,
    service: "stopped",
    runtimeHealthy: false,
    backgroundEnabled: true,
    autoSync: true,
  });
});

test("qualifies repeatedly failing background configurations as limited before offering battery guidance", async () => {
  const fake = createPlatform();
  fake.setDiagnosticStatus({
    observedBackgroundFailureCount: 3,
    supportState: "limited",
    batteryOptimizationGuidance: true,
  });
  const coordinator = createAndroidBackgroundContinuityCoordinator(
    fake.platform
  );

  await coordinator.initialize();

  expect(coordinator.snapshot()).toEqual(
    expect.objectContaining({
      observedBackgroundFailureCount: 3,
      supportState: "limited",
      batteryOptimizationGuidance: true,
    })
  );
});

test("only lets Android 12-or-later users opt into background continuity", async () => {
  const unsupported = createPlatform(30);
  const coordinator = createAndroidBackgroundContinuityCoordinator(
    unsupported.platform
  );

  await coordinator.setEnabledFromUser(true);

  expect({
    enabled: unsupported.enabled(),
    commands: unsupported.commands,
    state: coordinator.snapshot(),
  }).toEqual({
    enabled: false,
    commands: [],
    state: expect.objectContaining({
      available: false,
      backgroundEnabled: false,
      service: "stopped",
    }),
  });
});

test("allows Android 12 users to opt into background continuity", async () => {
  const supported = createPlatform(31);
  const coordinator = createAndroidBackgroundContinuityCoordinator(
    supported.platform
  );

  await coordinator.setEnabledFromUser(true);

  expect({
    enabled: supported.enabled(),
    commands: supported.commands,
    state: coordinator.snapshot(),
  }).toEqual({
    enabled: true,
    commands: ["start"],
    state: expect.objectContaining({
      available: true,
      backgroundEnabled: true,
      service: "running",
    }),
  });
});

test("starts the companion service only after supported explicit opt-in", async () => {
  const fake = createPlatform();
  const coordinator = createAndroidBackgroundContinuityCoordinator(
    fake.platform
  );

  await coordinator.setEnabledFromUser(true);

  expect({
    enabled: fake.enabled(),
    commands: fake.commands,
    state: coordinator.snapshot(),
  }).toEqual({
    enabled: true,
    commands: ["start"],
    state: expect.objectContaining({
      backgroundEnabled: true,
      service: "running",
      connection: "waiting",
    }),
  });
});

test("does not report the service as running before native startup is acknowledged", async () => {
  const fake = createPlatform();
  let acknowledgeStart!: () => void;
  let observeStartRequest!: () => void;
  const startRequested = new Promise<void>((resolve) => {
    observeStartRequest = resolve;
  });
  fake.platform.startService = () =>
    new Promise<void>((resolve) => {
      acknowledgeStart = resolve;
      observeStartRequest();
    });
  const coordinator = createAndroidBackgroundContinuityCoordinator(
    fake.platform
  );

  const enabling = coordinator.setEnabledFromUser(true);
  await startRequested;
  expect(coordinator.snapshot()).toEqual(
    expect.objectContaining({ backgroundEnabled: true, service: "stopped" })
  );

  acknowledgeStart();
  await expect(enabling).resolves.toEqual(
    expect.objectContaining({ backgroundEnabled: true, service: "running" })
  );
});

test("keeps service state stopped when native startup fails", async () => {
  const fake = createPlatform();
  fake.platform.startService = async () => {
    throw new Error("service_start_failed");
  };
  const coordinator = createAndroidBackgroundContinuityCoordinator(
    fake.platform
  );

  await expect(coordinator.setEnabledFromUser(true)).resolves.toEqual(
    expect.objectContaining({ backgroundEnabled: true, service: "stopped" })
  );
});

test("retries a persisted opt-in from a later visible application start", async () => {
  const fake = createPlatform(31);
  await fake.platform.writeEnabled(true);
  const coordinator = createAndroidBackgroundContinuityCoordinator(
    fake.platform
  );

  const initialized = await coordinator.initialize();
  await coordinator.setEnabledFromUser(initialized.backgroundEnabled);

  expect({ commands: fake.commands, state: coordinator.snapshot() }).toEqual({
    commands: ["start"],
    state: expect.objectContaining({
      backgroundEnabled: true,
      service: "running",
    }),
  });
});

test("allows clipboard observation only while resumed and focused, with a fresh baseline", async () => {
  const fake = createPlatform();
  const coordinator = createAndroidBackgroundContinuityCoordinator(
    fake.platform
  );

  await coordinator.setActivityState({ resumed: true, windowFocused: false });
  await coordinator.setActivityState({ resumed: true, windowFocused: true });
  await coordinator.setActivityState({ resumed: true, windowFocused: false });

  expect({
    captureEligibility: fake.captureEligibility,
    baselines: fake.baselines(),
  }).toEqual({
    captureEligibility: [true, false],
    baselines: 1,
  });
});

test("does not let a stale focus transition re-enable clipboard polling", async () => {
  const fake = createPlatform();
  let finishBaselineReset!: () => void;
  fake.platform.resetClipboardBaseline = () =>
    new Promise<void>((resolve) => {
      finishBaselineReset = resolve;
    });
  const coordinator = createAndroidBackgroundContinuityCoordinator(
    fake.platform
  );

  const focusGained = coordinator.setActivityState({
    resumed: true,
    windowFocused: true,
  });
  const focusLost = coordinator.setActivityState({
    resumed: true,
    windowFocused: false,
  });
  await focusLost;
  finishBaselineReset();
  await focusGained;

  expect({
    captureEligibility: fake.captureEligibility,
    state: coordinator.snapshot(),
  }).toEqual({
    captureEligibility: [false],
    state: expect.objectContaining({ captureEligible: false }),
  });
});

test("reports a usable trusted-device connection and maps notification pause and resume to Auto Sync", async () => {
  const fake = createPlatform();
  const coordinator = createAndroidBackgroundContinuityCoordinator(
    fake.platform
  );
  await coordinator.setEnabledFromUser(true);
  await coordinator.setConnection(2);
  await coordinator.handleNotificationAction("pause");
  await coordinator.handleNotificationAction("resume");

  expect({
    autoSync: fake.autoSync,
    state: coordinator.snapshot(),
    latestService: fake.states.at(-1),
  }).toEqual({
    autoSync: [false, true],
    state: expect.objectContaining({
      connection: "connected",
      connectedTrustedDeviceCount: 2,
    }),
    latestService: { state: "connected", count: 2 },
  });
});

test("stops the empty service and posts a content-free reconnect alert when the runtime is lost", async () => {
  const fake = createPlatform();
  const coordinator = createAndroidBackgroundContinuityCoordinator(
    fake.platform
  );
  await coordinator.setEnabledFromUser(true);

  await coordinator.reportRuntimeLost();

  expect({
    commands: fake.commands,
    reconnectAlerts: fake.reconnectAlerts(),
    state: coordinator.snapshot(),
  }).toEqual({
    commands: ["start", "stop"],
    reconnectAlerts: 1,
    state: expect.objectContaining({
      service: "stopped",
      connection: "disconnected",
      runtimeHealthy: false,
    }),
  });
});

test("persists Stop before ending the service and treats task removal as a non-restarting boundary", async () => {
  const fake = createPlatform();
  const coordinator = createAndroidBackgroundContinuityCoordinator(
    fake.platform
  );
  await coordinator.setEnabledFromUser(true);
  await coordinator.handleTaskRemoved();
  await coordinator.handleNotificationAction("stop");

  expect({
    enabled: fake.enabled(),
    commands: fake.commands,
    state: coordinator.snapshot(),
  }).toEqual({
    enabled: false,
    commands: ["start", "stop"],
    state: expect.objectContaining({
      backgroundEnabled: false,
      service: "stopped",
    }),
  });
});

test("reboot offers an explicit reconnect instead of creating an empty foreground service", async () => {
  const fake = createPlatform();
  await fake.platform.writeEnabled(true);
  const coordinator = createAndroidBackgroundContinuityCoordinator(
    fake.platform
  );

  await coordinator.handleBoot();

  expect({
    commands: fake.commands,
    reconnectAlerts: fake.reconnectAlerts(),
    state: coordinator.snapshot(),
  }).toEqual({
    commands: [],
    reconnectAlerts: 1,
    state: expect.objectContaining({
      backgroundEnabled: true,
      service: "stopped",
    }),
  });
});

test("expires a missed Activity-runtime heartbeat through the coordinator's injectable clock", async () => {
  const fake = createPlatform();
  let now = 0;
  const coordinator = createAndroidBackgroundContinuityCoordinator(
    fake.platform,
    {
      now: () => now,
      heartbeatTimeoutMs: 60_000,
    }
  );
  await coordinator.setEnabledFromUser(true);
  await coordinator.heartbeat();
  now = 60_000;

  await coordinator.checkHeartbeatExpiry();

  expect({
    commands: fake.commands,
    reconnectAlerts: fake.reconnectAlerts(),
    state: coordinator.snapshot(),
  }).toEqual({
    commands: ["start", "heartbeat", "stop"],
    reconnectAlerts: 1,
    state: expect.objectContaining({
      connection: "disconnected",
      runtimeHealthy: false,
    }),
  });
});

test("schedules runtime heartbeats through an injectable coordinator clock and cancels late ticks", async () => {
  const fake = createPlatform();
  const scheduled: Array<{ everyMs: number; tick: () => Promise<void> }> = [];
  let cancellations = 0;
  const coordinator = createAndroidBackgroundContinuityCoordinator(
    fake.platform,
    {
      schedulePeriodicHeartbeat: (tick, everyMs) => {
        scheduled.push({ tick, everyMs });
        return () => {
          cancellations += 1;
        };
      },
      heartbeatIntervalMs: 20_000,
    }
  );
  await coordinator.setEnabledFromUser(true);

  coordinator.startRuntimeHeartbeat();
  coordinator.startRuntimeHeartbeat();
  await scheduled[0].tick();
  coordinator.stopRuntimeHeartbeat();
  coordinator.stopRuntimeHeartbeat();
  await scheduled[0].tick();

  expect({
    scheduled: scheduled.map(({ everyMs }) => everyMs),
    cancellations,
    commands: fake.commands,
  }).toEqual({
    scheduled: [20_000],
    cancellations: 1,
    commands: ["start", "heartbeat"],
  });
});

test("keeps background continuity available when notifications are blocked without claiming a reconnect alert", async () => {
  const fake = createPlatform(31, "blocked");
  const coordinator = createAndroidBackgroundContinuityCoordinator(
    fake.platform
  );
  await coordinator.initialize();
  await coordinator.setEnabledFromUser(true);

  await coordinator.reportRuntimeLost();

  expect({
    reconnectAlerts: fake.reconnectAlerts(),
    state: coordinator.snapshot(),
  }).toEqual({
    reconnectAlerts: 0,
    state: expect.objectContaining({
      available: true,
      backgroundEnabled: true,
      notificationAvailability: "blocked",
      service: "stopped",
    }),
  });
});

test("ignores repeated Stop and late Pause, Resume, runtime-loss, and task-removal events", async () => {
  const fake = createPlatform();
  const coordinator = createAndroidBackgroundContinuityCoordinator(
    fake.platform
  );
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
  const coordinator = createAndroidBackgroundContinuityCoordinator(
    fake.platform
  );
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
    state: expect.objectContaining({
      captureEligible: false,
      service: "running",
      runtimeHealthy: true,
    }),
  });
});

test("publishes healthy notification states and records Disconnected after the service stops", async () => {
  const fake = createPlatform();
  const coordinator = createAndroidBackgroundContinuityCoordinator(
    fake.platform
  );
  await coordinator.setEnabledFromUser(true);
  await coordinator.setConnection(2);
  await coordinator.setConnection(0);
  await coordinator.handleNotificationAction("pause");
  await coordinator.handleNotificationAction("resume");

  await coordinator.reportRuntimeLost();

  expect({
    notifications: fake.states,
    connection: coordinator.snapshot().connection,
  }).toEqual({
    notifications: [
      { state: "waiting", count: 0 },
      { state: "connected", count: 2 },
      { state: "reconnecting", count: 0 },
      { state: "paused", count: 0 },
      { state: "reconnecting", count: 0 },
    ],
    connection: "disconnected",
  });
});

test("rejected opt-in retains the persisted disabled mode", async () => {
  const fake = createPlatform();
  fake.platform.writeEnabled = async () => {
    throw new Error("write_rejected");
  };
  const coordinator = createAndroidBackgroundContinuityCoordinator(
    fake.platform
  );
  await coordinator.initialize();
  await coordinator.setEnabledFromUser(true).catch(() => undefined);
  expect(coordinator.snapshot()).toEqual(
    expect.objectContaining({ backgroundEnabled: false, service: "stopped" })
  );
});

test("Stop wins over an overlapping acknowledged enable and preserves Auto Sync", async () => {
  const fake = createPlatform();
  let acknowledge!: () => void;
  const gate = new Promise<void>((resolve) => {
    acknowledge = resolve;
  });
  let starting!: () => void;
  const entered = new Promise<void>((resolve) => {
    starting = resolve;
  });
  fake.platform.startService = async () => {
    starting();
    await gate;
  };
  const coordinator = createAndroidBackgroundContinuityCoordinator(
    fake.platform
  );
  const enabling = coordinator.setEnabledFromUser(true);
  await entered;
  const stopping = coordinator.setEnabledFromUser(false);
  acknowledge();
  await Promise.all([enabling, stopping]);
  expect({
    enabled: fake.enabled(),
    state: coordinator.snapshot(),
    autoSync: fake.autoSync,
  }).toEqual({
    enabled: false,
    state: expect.objectContaining({
      backgroundEnabled: false,
      service: "stopped",
    }),
    autoSync: [],
  });
});

test("disconnected service updates still carry the applied Auto Sync preference", async () => {
  const fake = createPlatform();
  let applied: boolean | null | undefined;
  fake.platform.updateService = async (_state, _count, autoSync) => {
    applied = autoSync;
  };
  fake.platform.readAutoSync = async () => false;
  const coordinator = createAndroidBackgroundContinuityCoordinator(
    fake.platform
  );
  await coordinator.setEnabledFromUser(true);
  await coordinator.reportRuntimeLost();
  expect(applied).toBe(false);
});

test("unknown persistence blocks stale notification actions until refresh succeeds", async () => {
  const fake = createPlatform();
  const coordinator = createAndroidBackgroundContinuityCoordinator(
    fake.platform
  );
  await coordinator.setEnabledFromUser(true);
  fake.platform.setAutoSync = async () => {
    throw new Error("auto_sync_rejected");
  };
  fake.platform.readAutoSync = async () => {
    throw new Error("read_unavailable");
  };
  await coordinator.setAutoSync(false).catch(() => undefined);
  expect(coordinator.snapshot()).toEqual(
    expect.objectContaining({ controlStateKnown: false, autoSync: true })
  );
  await coordinator.handleNotificationAction("resume");
  expect(fake.autoSync).toEqual([]);
  fake.platform.readAutoSync = async () => false;
  await coordinator.initialize();
  expect(coordinator.snapshot()).toEqual(
    expect.objectContaining({ controlStateKnown: true, autoSync: false })
  );
});

test("repeated stale taps never make unknown continuity state look confirmed", async () => {
  const fake = createPlatform();
  const coordinator = createAndroidBackgroundContinuityCoordinator(
    fake.platform
  );
  await coordinator.setEnabledFromUser(true);
  fake.platform.setAutoSync = async () => {
    throw new Error("rejected");
  };
  fake.platform.readAutoSync = async () => {
    throw new Error("unknown");
  };
  await coordinator.setAutoSync(false).catch(() => undefined);
  await coordinator.handleNotificationAction("resume");
  expect(coordinator.snapshot().controlStateKnown).toBe(false);
});

test("a native action that became stale while queued cannot change Auto Sync or stop a newer session", async () => {
  const fake = createPlatform();
  const coordinator = createAndroidBackgroundContinuityCoordinator(
    fake.platform
  );
  await coordinator.setEnabledFromUser(true);
  await coordinator.handleNotificationAction("pause", async () => false);
  await coordinator.handleNotificationAction("stop", async () => false);
  expect(coordinator.snapshot()).toEqual(
    expect.objectContaining({
      autoSync: true,
      backgroundEnabled: true,
      service: "running",
    })
  );
  expect(fake.autoSync).toEqual([]);
});

test("connection publication overlapping Stop cannot replace confirmed disabled mode with unknown state", async () => {
  const fake = createPlatform();
  let nativeRunning = false;
  let announceStop!: () => void;
  const stopEntered = new Promise<void>((resolve) => {
    announceStop = resolve;
  });
  let acknowledgeStop!: () => void;
  const stopAcknowledgment = new Promise<void>((resolve) => {
    acknowledgeStop = resolve;
  });
  const writeEnabled = fake.platform.writeEnabled;
  fake.platform.writeEnabled = async (enabled) => {
    await writeEnabled(enabled);
    if (!enabled) {
      // The production native setEnabled(false) stops its companion before
      // acknowledging the durable preference write to the JS owner.
      nativeRunning = false;
      announceStop();
      await stopAcknowledgment;
    }
  };
  fake.platform.startService = async () => {
    nativeRunning = true;
  };
  fake.platform.readServiceState = async () =>
    nativeRunning ? "running" : "stopped";
  const coordinator = createAndroidBackgroundContinuityCoordinator(
    fake.platform
  );
  await coordinator.initialize();
  await coordinator.setEnabledFromUser(true);
  await coordinator.setAutoSync(false);
  let rejectObsoleteUpdate: ((error: Error) => void) | undefined;
  fake.platform.updateService = async () => {
    if (!nativeRunning)
      await new Promise<void>((_resolve, reject) => {
        rejectObsoleteUpdate = reject;
      });
  };

  const stopping = coordinator.setEnabledFromUser(false);
  await stopEntered;
  // AndroidClient concurrently publishes getState while its control is pending.
  const publication = coordinator.setConnection(0);
  await new Promise<void>((resolve) => setImmediate(resolve));
  acknowledgeStop();
  await stopping;
  rejectObsoleteUpdate?.(new Error("background_continuity_not_running"));
  await publication;

  expect(coordinator.snapshot()).toMatchObject({
    backgroundEnabled: false,
    service: "stopped",
    autoSync: false,
    controlStateKnown: true,
    controlError: null,
  });
  expect(fake.enabled()).toBe(false);
});

test("a current failed connection update stays unknown until an explicit refresh confirms it", async () => {
  const fake = createPlatform();
  const coordinator = createAndroidBackgroundContinuityCoordinator(
    fake.platform
  );
  await coordinator.initialize();
  await coordinator.setEnabledFromUser(true);
  fake.platform.updateService = async () => {
    throw new Error("background_continuity_update_failed");
  };
  await coordinator.setConnection(1);
  expect(coordinator.snapshot()).toMatchObject({
    controlStateKnown: false,
    controlError:
      "Background notification state could not be confirmed. Refresh before trying again.",
    service: "running",
  });
  fake.platform.updateService = async () => undefined;
  await coordinator.setConnection(1);
  expect(coordinator.snapshot().controlStateKnown).toBe(false);
  expect(coordinator.snapshot().controlError).not.toBeNull();
  await coordinator.initialize();
  expect(coordinator.snapshot()).toMatchObject({
    controlStateKnown: true,
    controlError: null,
  });
});
