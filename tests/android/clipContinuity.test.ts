import type { Clip } from "../../packages/core/models/Clip";
import {
  createAndroidBackgroundContinuityCoordinator,
  type AndroidBackgroundContinuityPlatform,
  type AndroidExplicitTextAction,
} from "../../apps/android/src/backgroundContinuity";

const originPeerId = "12D3KooWJ5oQ9G9kDMwrrzmVWwZnJryHJns8ovH8LYgDgJYJYyXy";

function clip(id: string, content: string, capturedAt = 1): Clip {
  return {
    id,
    type: "text",
    content,
    originPeerId,
    capturedAt,
    shareExpiresAt: capturedAt + 86_400_000,
  };
}

function createPlatform() {
  let actions: AndroidExplicitTextAction[] = [];
  let pendingApplicationClipId: string | null = null;
  let autoSync = true;
  const prepared: Array<{ actionId: string; clipId: string; capturedAt: number }> = [];
  const completed: string[] = [];
  const captures: AndroidExplicitTextAction[] = [];
  const feedback: string[] = [];
  const retained = new Map<string, { clip: Clip; liveHandled: boolean }>();
  const writes: string[] = [];
  let nextCapture: ((action: AndroidExplicitTextAction) => Promise<Clip | null>) | undefined;
  let completeFailureCount = 0;
  let writeFailureCount = 0;
  const platform: AndroidBackgroundContinuityPlatform = {
    androidApiLevel: () => 36,
    notificationPermission: async () => "granted",
    readEnabled: async () => false,
    writeEnabled: async () => undefined,
    setClipboardCaptureEligible: async () => undefined,
    resetClipboardBaseline: async () => undefined,
    setAutoSync: async (enabled) => { autoSync = enabled; },
    startService: async () => undefined,
    stopService: async () => undefined,
    sendHeartbeat: async () => undefined,
    updateService: async () => undefined,
    showReconnectNotification: async () => undefined,
    listExplicitTextActions: async () => structuredClone(actions),
    prepareExplicitTextAction: async (actionId, event) => {
      prepared.push({ actionId, ...event });
      actions = actions.map((action) => action.id === actionId ? { ...action, event } : action);
    },
    completeExplicitTextAction: async (actionId) => {
      if (completeFailureCount > 0) {
        completeFailureCount -= 1;
        throw new Error("completion persistence unavailable");
      }
      completed.push(actionId);
      actions = actions.filter((action) => action.id !== actionId);
    },
    readAcceptedExplicitTextAction: async (action) => {
      const existing = retained.get(action.event!.clipId)?.clip;
      return existing
        && existing.content === action.text
        && existing.capturedAt === action.event!.capturedAt
        ? existing
        : null;
    },
    captureExplicitText: async (action) => {
      captures.push(structuredClone(action));
      const accepted = nextCapture
        ? await nextCapture(action)
        : clip(action.event!.clipId, action.text, action.event!.capturedAt);
      if (accepted) retained.set(accepted.id, { clip: accepted, liveHandled: true });
      return accepted;
    },
    showExplicitTextFeedback: async (state) => { feedback.push(state); },
    readPendingClipboardApplication: async () => pendingApplicationClipId,
    writePendingClipboardApplication: async (clipId) => { pendingApplicationClipId = clipId; },
    clearPendingClipboardApplication: async () => { pendingApplicationClipId = null; },
    readRetainedLiveClip: async (clipId) => retained.get(clipId) ?? null,
    retryRemoteClipboardApplication: async (value) => {
      writes.push(value.id);
      if (writeFailureCount > 0) {
        writeFailureCount -= 1;
        throw new Error("clipboard unavailable");
      }
    },
  };
  return {
    platform,
    enqueue(...next: AndroidExplicitTextAction[]) { actions.push(...structuredClone(next)); },
    actions: () => structuredClone(actions),
    prepared,
    completed,
    captures,
    feedback,
    setCapture(handler: (action: AndroidExplicitTextAction) => Promise<Clip | null>) { nextCapture = handler; },
    failCompletion(times = 1) { completeFailureCount = times; },
    pendingApplication: () => pendingApplicationClipId,
    retain(value: Clip, liveHandled = true) { retained.set(value.id, { clip: value, liveHandled }); },
    remove(clipId: string) { retained.delete(clipId); },
    writes,
    failWrite(times = 1) { writeFailureCount = times; },
    autoSync: () => autoSync,
  };
}

test("drains cold and warm selected-text and Sharesheet actions through Share Now without rereading the clipboard", async () => {
  const fake = createPlatform();
  fake.enqueue(
    { id: "selection", text: "same text", source: "process-text" },
    { id: "share", text: "same text", source: "send" },
  );
  const ids = [
    "00000000-0000-4000-8000-000000000801",
    "00000000-0000-4000-8000-000000000802",
    "00000000-0000-4000-8000-000000000803",
  ];
  const coordinator = createAndroidBackgroundContinuityCoordinator(fake.platform, {
    now: () => 1,
    makeClipId: () => ids.shift()!,
  });

  await coordinator.handleExplicitTextActionsAvailable();
  fake.enqueue({ id: "warm-share", text: "warm", source: "send" });
  await coordinator.handleExplicitTextActionsAvailable();

  expect(fake.captures).toEqual([
    expect.objectContaining({ id: "selection", text: "same text", source: "process-text", event: { clipId: "00000000-0000-4000-8000-000000000801", capturedAt: 1 } }),
    expect.objectContaining({ id: "share", text: "same text", source: "send", event: { clipId: "00000000-0000-4000-8000-000000000802", capturedAt: 1 } }),
    expect.objectContaining({ id: "warm-share", text: "warm", source: "send" }),
  ]);
  expect(fake.captures.every((action) => action.shareNow === true)).toBe(true);
  expect(fake.completed).toEqual(["selection", "share", "warm-share"]);
  expect(fake.actions()).toEqual([]);
  expect(fake.feedback).toEqual(["accepted", "accepted", "accepted"]);
});

test("preserves one prepared Clip identity across restart and completion-persistence recovery", async () => {
  const fake = createPlatform();
  fake.enqueue({ id: "persisted-action", text: "recover me", source: "send" });
  fake.failCompletion();
  const first = createAndroidBackgroundContinuityCoordinator(fake.platform, {
    now: () => 10,
    makeClipId: () => "00000000-0000-4000-8000-000000000810",
  });

  await first.handleExplicitTextActionsAvailable();
  const restarted = createAndroidBackgroundContinuityCoordinator(fake.platform, {
    now: () => 20,
    makeClipId: () => "00000000-0000-4000-8000-000000000811",
  });
  await restarted.handleExplicitTextActionsAvailable();

  expect(fake.prepared).toEqual([{
    actionId: "persisted-action",
    clipId: "00000000-0000-4000-8000-000000000810",
    capturedAt: 10,
  }]);
  expect(fake.captures.map((action) => action.event)).toEqual([
    { clipId: "00000000-0000-4000-8000-000000000810", capturedAt: 10 },
  ]);
  expect(fake.completed).toEqual(["persisted-action"]);
  expect(fake.actions()).toEqual([]);
});

test("keeps a durably queued action until local Clip acceptance succeeds, including with Auto Sync disabled", async () => {
  const fake = createPlatform();
  fake.enqueue({ id: "queued", text: "share once", source: "process-text" });
  let accepts = 0;
  fake.setCapture(async (action) => {
    accepts += 1;
    return accepts === 1 ? null : clip(action.event!.clipId, action.text);
  });
  const coordinator = createAndroidBackgroundContinuityCoordinator(fake.platform, {
    makeClipId: () => "00000000-0000-4000-8000-000000000820",
  });
  await coordinator.reflectAutoSync(false);

  await coordinator.handleExplicitTextActionsAvailable();
  await coordinator.handleExplicitTextActionsAvailable();

  expect(fake.captures.map((action) => action.shareNow)).toEqual([true, true]);
  expect(fake.feedback).toEqual(["queued", "accepted"]);
  expect(fake.completed).toEqual(["queued"]);
});

test("stores only the newest failed live Remote Clip and retries it once on resume", async () => {
  const fake = createPlatform();
  const older = clip("00000000-0000-4000-8000-000000000830", "older");
  const newer = clip("00000000-0000-4000-8000-000000000831", "newer");
  fake.retain(older);
  fake.retain(newer);
  const coordinator = createAndroidBackgroundContinuityCoordinator(fake.platform);

  await coordinator.recordLiveClipboardApplication(older, "failed");
  await coordinator.recordLiveClipboardApplication(newer, "failed");
  await coordinator.setActivityState({ resumed: true, windowFocused: false });
  await coordinator.setActivityState({ resumed: false, windowFocused: false });
  await coordinator.setActivityState({ resumed: true, windowFocused: false });

  expect(fake.writes).toEqual([newer.id]);
  expect(fake.pendingApplication()).toBeNull();
});

test("clears one failed resume retry instead of recreating pending application work", async () => {
  const fake = createPlatform();
  const remote = clip("00000000-0000-4000-8000-000000000840", "remote");
  fake.retain(remote);
  fake.failWrite();
  const coordinator = createAndroidBackgroundContinuityCoordinator(fake.platform);
  await coordinator.recordLiveClipboardApplication(remote, "failed");

  await coordinator.setActivityState({ resumed: true, windowFocused: false });
  await coordinator.setActivityState({ resumed: false, windowFocused: false });
  await coordinator.setActivityState({ resumed: true, windowFocused: false });

  expect(fake.writes).toEqual([remote.id]);
  expect(fake.pendingApplication()).toBeNull();
});

test("cancels pending application for Auto Sync, local removal, history clearing, rotation, and historical-only Clips", async () => {
  const fake = createPlatform();
  const live = clip("00000000-0000-4000-8000-000000000850", "live");
  const historical = clip("00000000-0000-4000-8000-000000000851", "historical");
  fake.retain(live);
  fake.retain(historical, false);
  const coordinator = createAndroidBackgroundContinuityCoordinator(fake.platform);

  await coordinator.recordLiveClipboardApplication(live, "failed");
  await coordinator.reflectAutoSync(false);
  expect(fake.pendingApplication()).toBeNull();

  await coordinator.reflectAutoSync(true);
  await coordinator.recordLiveClipboardApplication(live, "failed");
  fake.remove(live.id);
  await coordinator.clearPendingClipboardApplication(live.id);
  expect(fake.pendingApplication()).toBeNull();

  await coordinator.recordLiveClipboardApplication(live, "failed");
  await coordinator.clearPendingClipboardApplication();
  expect(fake.pendingApplication()).toBeNull();

  await coordinator.recordLiveClipboardApplication(live, "failed");
  const rotation = await coordinator.prepareIdentityRotationCleanup();
  expect(fake.pendingApplication()).toBeNull();
  await rotation.rollback();
  expect(fake.pendingApplication()).toBe(live.id);

  await coordinator.clearPendingClipboardApplication();
  await fake.platform.writePendingClipboardApplication(historical.id);
  await coordinator.setActivityState({ resumed: true, windowFocused: false });
  expect(fake.writes).toEqual([]);
  expect(fake.pendingApplication()).toBeNull();
});

test("a newer successful live application clears an older failed marker", async () => {
  const fake = createPlatform();
  const older = clip("00000000-0000-4000-8000-000000000860", "older");
  const newer = clip("00000000-0000-4000-8000-000000000861", "newer");
  const coordinator = createAndroidBackgroundContinuityCoordinator(fake.platform);

  await coordinator.recordLiveClipboardApplication(older, "failed");
  await coordinator.recordLiveClipboardApplication(newer, "applied");

  expect(fake.pendingApplication()).toBeNull();
});
