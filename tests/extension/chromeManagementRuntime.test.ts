/// <reference types="chrome" />
import { installChromeManagement } from "../../apps/extension/src/chromeManagementRuntime";
function chromeFixture() {
  let listener!: (
    message: any,
    sender: chrome.runtime.MessageSender,
    response: (value: any) => void
  ) => unknown;
  let records: Record<string, unknown> = {};
  let connectListener!: (port: chrome.runtime.Port) => void;
  let restrictionError = false;
  let windowLookups = 0;
  let holdWindowLookup = false;
  const api = {
    runtime: {
      id: "extension",
      lastError: undefined as { message: string } | undefined,
      getURL: (path: string) => `chrome-extension://extension/${path}`,
      onConnect: {
        addListener: (listener: typeof connectListener) => {
          connectListener = listener;
        },
      },
      onMessage: {
        addListener: (value: typeof listener) => {
          listener = value;
        },
      },
    },
    storage: {
      session: {
        setAccessLevel: (_: unknown, done: () => void) => {
          if (restrictionError)
            api.runtime.lastError = { message: "restriction failed" };
          done();
          api.runtime.lastError = undefined;
        },
        get: (key: string, done: (value: unknown) => void) =>
          done({ [key]: structuredClone(records[key]) }),
        set: (values: Record<string, unknown>, done: () => void) => {
          records = structuredClone(values);
          done();
        },
      },
    },
    windows: {
      getLastFocused: (
        _options: unknown,
        done: (window: { id: number }) => void
      ) => {
        windowLookups++;
        if (!holdWindowLookup) done({ id: 2 });
      },
    },
    tabs: {
      create: (_: unknown, done: (value: unknown) => void) => done({ id: 1 }),
      query: (_: unknown, done: (value: unknown) => void) => done([]),
    },
  };
  return {
    api: api as unknown as typeof chrome,
    failRestriction: () => {
      restrictionError = true;
    },
    records: () => records,
    windowLookups: () => windowLookups,
    holdWindowLookup: () => {
      holdWindowLookup = true;
    },
    connect: (port: chrome.runtime.Port) => connectListener(port),
    message(value: unknown, dropped = false) {
      let keepAlive: unknown;
      const result = new Promise<any>((resolve) => {
        keepAlive = listener(
          value,
          { id: "extension", url: api.runtime.getURL("src/popup.html") },
          (value) => {
            resolve(value);
            if (dropped) throw new Error("Popup disappeared");
          }
        );
      });
      return { result, keepAlive };
    },
  };
}
it("Chrome109 callback listener declines navigation if mailbox cannot be kept trusted", async () => {
  const f = chromeFixture();
  f.failRestriction();
  installChromeManagement(f.api);
  const request = f.message({
    type: "managementNavigate",
    handoff: { id: "one", destination: { kind: "requests" } },
  });
  expect(request.keepAlive).toBe(true);
  expect(await request.result).toMatchObject({
    ok: false,
    error: "management_storage_unavailable",
  });
  expect(f.records()).toEqual({});
});
it("navigation waits for reset reconciliation and refuses identity-fenced ingress", async () => {
  const f = chromeFixture();
  let ready!: () => void;
  let fenced = false;
  installChromeManagement(f.api, {
    ready: new Promise<void>((resolve) => {
      ready = resolve;
    }),
    available: () => !fenced,
  });
  const request = f.message({
    type: "managementNavigate",
    handoff: { id: "before-readiness", destination: { kind: "requests" } },
  });
  await Promise.resolve();
  expect(f.records()).toEqual({});
  fenced = true;
  ready();
  expect(await request.result).toMatchObject({
    ok: false,
    error: "identity_runtime_suspended",
  });
  expect(f.records()).toEqual({});
  const status = f.message({ type: "managementStatus" });
  expect(await status.result).toMatchObject({ ok: true, records: [] });
});
it("accepted navigation is routed even when the destroyed popup can no longer receive its callback", async () => {
  const f = chromeFixture();
  const coordinator = installChromeManagement(f.api);
  // A callback receiver may disappear at any point after durable acceptance.
  const source = f.message(
    {
      type: "managementNavigate",
      handoff: { id: "destroyed", destination: { kind: "requests" } },
    },
    true
  );
  await source.result;
  await coordinator.flush();
  expect(Object.values(f.records())).toContainEqual([
    expect.objectContaining({ id: "destroyed", target: 1 }),
  ]);
});

it("page registration buffers its first ready advertisement during worker admission", async () => {
  const f = chromeFixture();
  let ready!: () => void, message!: (value: unknown) => void;
  const coordinator = installChromeManagement(f.api, {
    ready: new Promise<void>((resolve) => {
      ready = resolve;
    }),
  });
  const port = {
    name: "clipp-management-page-v1",
    sender: {
      id: "extension",
      url: f.api.runtime.getURL("src/options.html"),
      tab: { id: 7, url: f.api.runtime.getURL("src/options.html") },
      frameId: 0,
    },
    postMessage: () => {},
    disconnect: () => {},
    onMessage: {
      addListener: (listener: typeof message) => {
        message = listener;
      },
    },
    onDisconnect: { addListener: () => {} },
  } as unknown as chrome.runtime.Port;
  f.connect(port);
  message({ type: "ready", ready: true, idle: true });
  ready();
  await Promise.resolve();
  await coordinator.flush();
  const request = f.message({
    type: "managementNavigate",
    handoff: { id: "early-page", destination: { kind: "requests" } },
  });
  await request.result;
  await coordinator.flush();
  expect(Object.values(f.records())).toContainEqual([
    expect.objectContaining({ id: "early-page", target: 7 }),
  ]);
});

it("canonical popup without tab metadata prefers an idle page in the focused Chrome window", async () => {
  const f = chromeFixture(),
    coordinator = installChromeManagement(f.api);
  const register = (id: number, windowId: number) => {
    let receive!: (value: unknown) => void;
    f.connect({
      name: "clipp-management-page-v1",
      sender: {
        id: "extension",
        url: f.api.runtime.getURL("src/options.html"),
        tab: { id, windowId, url: f.api.runtime.getURL("src/options.html") },
        frameId: 0,
      },
      postMessage: () => {},
      disconnect: () => {},
      onMessage: {
        addListener: (listener: typeof receive) => {
          receive = listener;
        },
      },
      onDisconnect: { addListener: () => {} },
    } as unknown as chrome.runtime.Port);
    receive({ type: "ready", ready: true, idle: true });
  };
  register(7, 1);
  register(8, 2);
  await Promise.resolve();
  await coordinator.flush();
  const request = f.message({
    type: "managementNavigate",
    handoff: { id: "popup-window", destination: { kind: "requests" } },
  });
  await request.result;
  await coordinator.flush();
  expect(Object.values(f.records())).toContainEqual([
    expect.objectContaining({ id: "popup-window", target: 8 }),
  ]);
  expect(f.windowLookups()).toBe(1);
});

it("missing popup-window callback falls back after its bounded wait without losing acceptance", async () => {
  jest.useFakeTimers();
  try {
    const f = chromeFixture();
    f.holdWindowLookup();
    const coordinator = installChromeManagement(f.api);
    const request = f.message({
      type: "managementNavigate",
      handoff: { id: "no-window", destination: { kind: "requests" } },
    });
    await jest.advanceTimersByTimeAsync(499);
    expect(f.records()).toEqual({});
    await jest.advanceTimersByTimeAsync(1);
    expect(await request.result).toMatchObject({ ok: true, status: "pending" });
    await coordinator.flush();
    expect(Object.values(f.records())).toContainEqual([
      expect.objectContaining({ id: "no-window", target: 1 }),
    ]);
  } finally {
    jest.useRealTimers();
  }
});
