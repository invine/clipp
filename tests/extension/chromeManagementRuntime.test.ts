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
      update: (
        _id: number,
        _options: unknown,
        done: (value: unknown) => void
      ) => done({ id: 2 }),
      getLastFocused: (
        _options: unknown,
        done: (window: { id: number }) => void
      ) => {
        windowLookups++;
        if (!holdWindowLookup) done({ id: 2 });
      },
    },
    tabs: {
      get: (id: number, done: (value: unknown) => void) =>
        done({ id, url: api.runtime.getURL("src/options.html") }),
      update: (id: number, _options: unknown, done: (value: unknown) => void) =>
        done({ id }),
      create: (_: unknown, done: (value: unknown) => void) => done({ id: 1 }),
      query: (_: unknown, done: (value: unknown) => void) => done([]),
    },
  };
  return {
    api: api as unknown as typeof chrome,
    host: api,
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

it("a missing tab lookup callback preserves the accepted target for reconciliation", async () => {
  jest.useFakeTimers();
  try {
    const f = chromeFixture();
    const coordinator = installChromeManagement(f.api);
    await f.message({
      type: "managementNavigate",
      handoff: { id: "target-uncertain", destination: { kind: "requests" } },
    }).result;
    await coordinator.flush();
    const get = f.host.tabs.get;
    let late!: (value: unknown) => void;
    f.host.tabs.get = (_id, done) => {
      late = done;
    };
    let error: unknown;
    let completed = false;
    const routing = coordinator.route("target-uncertain").then(
      () => {
        completed = true;
      },
      (value) => {
        error = value;
      }
    );
    await jest.advanceTimersByTimeAsync(5000);
    expect(error).toEqual(new Error("management_host_callback_timeout"));
    expect(completed).toBe(false);
    await routing;
    late({ id: 99, url: f.api.runtime.getURL("src/options.html") });
    f.host.tabs.get = get;
    expect(await f.message({ type: "managementStatus" }).result).toMatchObject({
      ok: true,
      records: [{ id: "target-uncertain", target: 1, attempts: 1 }],
    });
    await coordinator.flush();
  } finally {
    jest.useRealTimers();
  }
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

it("missing mailbox read releases later requests and ignores its late value while consuming lastError", async () => {
  jest.useFakeTimers();
  try {
    const f = chromeFixture();
    const get = f.host.storage.session.get;
    let late!: (value: unknown) => void;
    f.host.storage.session.get = (_key, done) => {
      late = done;
      f.host.storage.session.get = get;
    };
    installChromeManagement(f.api);
    let response: unknown;
    const first = f.message({ type: "managementStatus" });
    void first.result.then((value) => {
      response = value;
    });
    const next = f.message({ type: "managementStatus" });
    await jest.advanceTimersByTimeAsync(5000);
    expect(response).toEqual({
      ok: false,
      error: "management_storage_unavailable",
    });
    expect(await next.result).toEqual({ ok: true, records: [] });
    let errorReads = 0;
    Object.defineProperty(f.api.runtime, "lastError", {
      configurable: true,
      get: () => {
        errorReads++;
        return { message: "late host error" };
      },
    });
    late({ clippManagementNavigationV1: [{ id: "obsolete" }] });
    expect(errorReads).toBe(1);
    expect(await first.result).toEqual({
      ok: false,
      error: "management_storage_unavailable",
    });
    Object.defineProperty(f.api.runtime, "lastError", {
      configurable: true,
      value: undefined,
    });
    expect(await f.message({ type: "managementStatus" }).result).toEqual({
      ok: true,
      records: [],
    });
  } finally {
    jest.useRealTimers();
  }
});

it("a later request can establish trusted storage after the initial restriction callback is lost", async () => {
  jest.useFakeTimers();
  try {
    const f = chromeFixture();
    const restrict = f.host.storage.session.setAccessLevel;
    let late!: () => void;
    f.host.storage.session.setAccessLevel = (_options, done) => {
      late = done;
      f.host.storage.session.setAccessLevel = restrict;
    };
    installChromeManagement(f.api);
    let response: unknown;
    const first = f.message({ type: "managementStatus" });
    void first.result.then((value) => {
      response = value;
    });
    await jest.advanceTimersByTimeAsync(5000);
    expect(response).toEqual({
      ok: false,
      error: "management_storage_unavailable",
    });
    expect(f.records()).toEqual({});
    expect(await f.message({ type: "managementStatus" }).result).toEqual({
      ok: true,
      records: [],
    });
    late();
    expect(await first.result).toEqual({
      ok: false,
      error: "management_storage_unavailable",
    });
  } finally {
    jest.useRealTimers();
  }
});

it("a lost acceptance-write callback reports uncertainty and later reads reconcile the original handoff", async () => {
  jest.useFakeTimers();
  try {
    const f = chromeFixture();
    const set = f.host.storage.session.set;
    let late!: () => void;
    f.host.storage.session.set = (values, done) => {
      set(values, () => {});
      late = done;
      f.host.storage.session.set = set;
    };
    const coordinator = installChromeManagement(f.api);
    let response: unknown;
    const request = f.message({
      type: "managementNavigate",
      handoff: { id: "write-uncertain", destination: { kind: "requests" } },
    });
    void request.result.then((value) => {
      response = value;
    });
    await jest.advanceTimersByTimeAsync(5000);
    expect(response).toEqual({
      ok: false,
      error: "management_storage_unavailable",
    });
    const status = await f.message({ type: "managementStatus" }).result;
    expect(status).toMatchObject({
      ok: true,
      records: [{ id: "write-uncertain", status: "pending" }],
    });
    late();
    await coordinator.flush();
    expect(await request.result).toEqual({
      ok: false,
      error: "management_storage_unavailable",
    });
    expect(Object.values(f.records())).toContainEqual([
      expect.objectContaining({
        id: "write-uncertain",
        target: 1,
        attempts: 1,
      }),
    ]);
  } finally {
    jest.useRealTimers();
  }
});

it("a missing creation callback retains uncertain creation evidence and releases the mailbox queue", async () => {
  jest.useFakeTimers();
  try {
    const f = chromeFixture();
    let late!: (value: unknown) => void;
    f.host.tabs.create = (_options, done) => {
      late = done;
    };
    const coordinator = installChromeManagement(f.api);
    expect(
      await f.message({
        type: "managementNavigate",
        handoff: { id: "create-uncertain", destination: { kind: "requests" } },
      }).result
    ).toMatchObject({ ok: true, status: "pending" });
    await jest.advanceTimersByTimeAsync(5000);
    await coordinator.flush();
    expect(await f.message({ type: "managementStatus" }).result).toMatchObject({
      ok: true,
      records: [
        {
          id: "create-uncertain",
          status: "unconfirmed",
          creating: true,
          attempts: 1,
        },
      ],
    });
    late({ id: 99 });
    expect(await f.message({ type: "managementStatus" }).result).toMatchObject({
      records: [
        { id: "create-uncertain", status: "unconfirmed", creating: true },
      ],
    });
  } finally {
    jest.useRealTimers();
  }
});

it.each(["tab", "window"])(
  "missing %s activation callback preserves applied delivery and exposes recoverable focus failure",
  async (operation) => {
    jest.useFakeTimers();
    try {
      const f = chromeFixture();
      const coordinator = installChromeManagement(f.api);
      await f.message({
        type: "managementNavigate",
        handoff: { id: "focus-uncertain", destination: { kind: "requests" } },
      }).result;
      await coordinator.flush();
      let receive!: (value: unknown) => void;
      f.connect({
        name: "clipp-management-page-v1",
        sender: {
          id: "extension",
          url: f.api.runtime.getURL("src/options.html"),
          frameId: 0,
          tab: {
            id: 1,
            windowId: 2,
            url: f.api.runtime.getURL("src/options.html"),
          },
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
      await Promise.resolve();
      await coordinator.flush();
      const tabUpdate = f.host.tabs.update,
        windowUpdate = f.host.windows.update;
      let late!: (value: unknown) => void;
      if (operation === "tab")
        f.host.tabs.update = (_id, _options, done) => {
          late = done;
        };
      else
        f.host.windows.update = (_id, _options, done) => {
          late = done;
        };
      receive({ type: "ack", id: "focus-uncertain", status: "applied" });
      await jest.advanceTimersByTimeAsync(5000);
      await coordinator.flush();
      expect(
        await f.message({ type: "managementStatus" }).result
      ).toMatchObject({
        records: [
          {
            id: "focus-uncertain",
            status: "applied",
            target: 1,
            error:
              "The destination opened, but its window could not be activated.",
          },
        ],
      });
      late({ id: 99 });
      f.host.tabs.update = tabUpdate;
      f.host.windows.update = windowUpdate;
      expect(
        await f.message({ type: "managementRetry", id: "focus-uncertain" })
          .result
      ).toEqual({ ok: true });
      const status = await f.message({ type: "managementStatus" }).result;
      expect(status.records[0].status).toBe("applied");
      expect(status.records[0].error).toBeUndefined();
    } finally {
      jest.useRealTimers();
    }
  }
);

it.each(["callback error", "synchronous throw"])(
  "transient tab lookup %s does not treat an uncertain target as removed",
  async (failure) => {
    const f = chromeFixture();
    const coordinator = installChromeManagement(f.api);
    await f.message({
      type: "managementNavigate",
      handoff: { id: "transient", destination: { kind: "requests" } },
    }).result;
    await coordinator.flush();
    const get = f.host.tabs.get;
    f.host.tabs.get = (_id, done) => {
      if (failure === "synchronous throw") throw new Error("host unavailable");
      f.host.runtime.lastError = { message: "host unavailable" };
      done(undefined);
      f.host.runtime.lastError = undefined;
    };
    await expect(coordinator.route("transient")).rejects.toThrow(
      "host unavailable"
    );
    f.host.tabs.get = get;
    expect(await f.message({ type: "managementStatus" }).result).toMatchObject({
      records: [{ id: "transient", target: 1, attempts: 1 }],
    });
    await coordinator.flush();
  }
);
