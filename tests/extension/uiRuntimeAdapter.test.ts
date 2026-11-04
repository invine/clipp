/// <reference types="chrome" />
import { createExtensionUiAdapter } from "../../apps/extension/src/uiRuntimeAdapter";
import { createUiSession } from "../../packages/ui/src/uiSession";

type MessageListener = (message: any) => void;

function fixture(surface: "popup" | "page") {
  const listeners = new Set<MessageListener>();
  const requests: { type: string; reply(value: unknown): void }[] = [];
  const focusListeners = new Set<() => void>();
  const pollListeners = new Set<() => void>();
  let clipboardReads = 0;
  let stoppedPolls = 0;
  const runtime = {
    lastError: undefined,
    sendMessage(message: { type: string }, reply: (value: unknown) => void) {
      requests.push({ type: message.type, reply });
    },
    onMessage: {
      addListener(listener: MessageListener) {
        listeners.add(listener);
      },
      removeListener(listener: MessageListener) {
        listeners.delete(listener);
      },
    },
    connect: () => {
      const port = {
        onMessage: { addListener() {}, removeListener() {} },
        onDisconnect: { addListener() {}, removeListener() {} },
        postMessage() {},
        disconnect() {},
      };
      return port;
    },
  } as unknown as typeof chrome.runtime;
  const adapter = createExtensionUiAdapter({
    runtime,
    surface,
    session: createUiSession(),
    clipboard: {
      async readText() {
        clipboardReads += 1;
        return "popup clip";
      },
      async writeText() {},
    },
    host: { copyText: async () => {}, confirm: () => true },
    focus: {
      hasFocus: () => true,
      subscribe(listener: () => void) {
        focusListeners.add(listener);
        return () => focusListeners.delete(listener);
      },
    },
    subscribeReturn: () => () => {},
    poll(listener: () => void) {
      pollListeners.add(listener);
      return () => {
        stoppedPolls += 1;
        pollListeners.delete(listener);
      };
    },
  });
  return {
    adapter,
    listeners,
    requests,
    focusListeners,
    pollListeners,
    clipboardReads: () => clipboardReads,
    stoppedPolls: () => stoppedPolls,
    async reply(type: string, value: unknown, occurrence = 0) {
      for (let turn = 0; turn < 20; turn += 1) {
        const matches = requests.filter((entry) => entry.type === type);
        if (matches[occurrence]) {
          const request = matches[occurrence];
          requests.splice(requests.indexOf(request), 1);
          request.reply(value);
          await settle();
          return;
        }
        await Promise.resolve();
      }
      throw new Error(`No pending ${type} request`);
    },
    async flush() {
      const response = (type: string) => {
        if (type === "getRuntimeState") return runtimeState("local", 1);
        if (type === "getRuntimeAuthority") return { sessionId: "runtime" };
        if (type === "getClipHistory")
          return {
            ok: true,
            snapshot: {
              sessionId: "history",
              revision: 1,
              clips: [],
              pinnedIds: [],
            },
          };
        if (type === "getSettings")
          return {
            ok: true,
            snapshot: {
              sessionId: "settings",
              revision: 1,
              state: {
                theme: "light",
                autoSync: false,
                localRetentionMs: 500,
                sharingLifetimeMs: 1000,
                logLevel: "info",
              },
            },
          };
        if (type === "getNotificationAvailability")
          return { ok: true, state: { status: "available" } };
        if (type === "managementStatus") return { ok: true, records: [] };
        if (type === "identityResetRead")
          return { ok: true, state: { phase: "idle" } };
        return { ok: true };
      };
      for (let turn = 0; turn < 30; turn += 1) {
        const request = requests.shift();
        if (request) {
          request.reply(response(request.type));
          await settle();
        } else {
          await Promise.resolve();
        }
        if (requests.length === 0 && turn > 5) return;
      }
    },
    publish(message: unknown) {
      for (const listener of [...listeners]) listener(message);
    },
  };
}

async function settle() {
  for (let turn = 0; turn < 20; turn += 1) await Promise.resolve();
}

const runtimeState = (deviceId: string, revision: number) => ({
  state: {
    identity: { deviceId, deviceName: deviceId },
    devices: [],
    pending: [],
    peers: [],
    pairingState: {
      sessionId: "runtime",
      revision,
      waiting: [],
      errors: [],
      outcomes: [],
    },
    connectionStateKnown: true,
  },
});

it.each(["popup", "page"] as const)(
  "%s uses independently revisioned runtime, history, and settings observations and ignores stale reads",
  async (surface) => {
    const f = fixture(surface);
    f.adapter.start?.();
    await f.reply("getRuntimeState", runtimeState("older", 1));
    f.publish({ type: "runtimeState", state: runtimeState("newer", 2).state });
    await f.reply("getRuntimeAuthority", { sessionId: "runtime" }, 1);
    await f.reply("getRuntimeAuthority", { sessionId: "runtime" });

    f.publish({ type: "historyChanged", sessionId: "history", revision: 3 });
    await f.reply(
      "getClipHistory",
      {
        ok: true,
        snapshot: {
          sessionId: "history",
          revision: 3,
          clips: [{ id: "newer-clip" }],
          pinnedIds: [],
        },
      },
      1
    );
    await f.reply("getClipHistory", {
      ok: true,
      snapshot: {
        sessionId: "history",
        revision: 2,
        clips: [{ id: "stale-clip" }],
        pinnedIds: [],
      },
    });
    f.publish({
      type: "settingsState",
      snapshot: {
        sessionId: "settings",
        revision: 2,
        state: {
          theme: "dark",
          autoSync: true,
          localRetentionMs: 500,
          sharingLifetimeMs: 1000,
          logLevel: "info",
        },
      },
    });
    await f.reply("getSettings", {
      ok: true,
      snapshot: {
        sessionId: "settings",
        revision: 1,
        state: {
          theme: "dark",
          autoSync: false,
          localRetentionMs: 500,
          sharingLifetimeMs: 1000,
          logLevel: "info",
        },
      },
    });
    await settle();

    const snapshot = f.adapter.getSnapshot();
    expect(snapshot.identity?.deviceId).toBe("newer");
    expect(snapshot.clips).toEqual([{ id: "newer-clip" }]);
    expect(snapshot.appearanceSettings?.snapshot).toMatchObject({
      sessionId: "settings",
      revision: 2,
    });
    expect(snapshot.autoSync).toBe(true);
    await f.adapter.stop?.();
    await f.flush();
  }
);

it("keeps popup capture and Share Now out of the management page", async () => {
  const page = fixture("page");
  page.adapter.start?.();
  expect(page.adapter.actions.onShareNow).toBeUndefined();
  expect(page.focusListeners.size).toBe(0);
  expect(page.clipboardReads()).toBe(0);
  await page.adapter.stop?.();
  await page.flush();

  const popup = fixture("popup");
  popup.adapter.start?.();
  expect(popup.adapter.actions.onShareNow).toBeDefined();
  expect(popup.focusListeners.size).toBe(1);
  popup.focusListeners.forEach((listener) => listener());
  await settle();
  expect(popup.clipboardReads()).toBeGreaterThan(0);
  await popup.adapter.stop?.();
  await popup.flush();
});

it("reports missing responses and removes document listeners and polling on stop", async () => {
  const f = fixture("page");
  f.adapter.start?.();
  await f.reply("getRuntimeState", undefined);
  await f.reply("getClipHistory", undefined);
  await f.reply("getSettings", undefined);
  await settle();
  expect(f.adapter.getSnapshot().historyRefreshError).toBeTruthy();

  await f.adapter.stop?.();
  expect(f.listeners.size).toBe(0);
  expect(f.pollListeners.size).toBe(0);
  expect(f.stoppedPolls()).toBe(1);
  await f.flush();
});
