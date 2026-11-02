import { createChromeManagement } from "../../apps/extension/src/chromeManagement";
function fixture() {
  let records: any[] = [];
  let created = 100;
  const activated: number[] = [];
  const host = createChromeManagement({
    extensionId: "extension",
    popupUrl: "chrome-extension://extension/src/popup.html",
    pageUrl: "chrome-extension://extension/src/options.html",
    read: async () => structuredClone(records),
    write: async (values) => {
      records = structuredClone(values);
    },
    create: async () => ({ id: ++created, windowId: 1 }),
    exists: async () => true,
    activate: async (id) => {
      activated.push(id);
    },
    now: () => 10,
  });
  return { host, activated, records: () => records };
}
it("rejects noncanonical navigation sources and persists acceptance before popup disappearance", async () => {
  const f = fixture();
  const request = { id: "handoff-one", destination: { kind: "requests" } };
  for (const url of [
    "https://site.example",
    "chrome-extension://extension/src/options.html#requests",
    "chrome-extension://extension/offscreen.html",
  ]) {
    expect(
      await f.host.request({ id: "extension", url }, request)
    ).toMatchObject({ ok: false });
  }
  expect(
    await f.host.request(
      { id: "extension", url: "chrome-extension://extension/src/popup.html" },
      request
    )
  ).toMatchObject({ ok: true, status: "pending" });
  expect(f.records()).toEqual([
    expect.objectContaining({
      id: "handoff-one",
      status: "pending",
      destination: { kind: "requests" },
    }),
  ]);
});
function page(id: number, windowId = 1) {
  let receive!: (value: any) => void;
  let disconnect!: () => void;
  const sent: any[] = [];
  const port = {
    name: "clipp-management-page-v1",
    sender: {
      id: "extension",
      url: "chrome-extension://extension/src/options.html",
      tab: {
        id,
        windowId,
        url: "chrome-extension://extension/src/options.html",
      },
      frameId: 0,
    },
    postMessage: (v: any) => sent.push(v),
    disconnect: jest.fn(),
    onMessage: {
      addListener: (f: typeof receive) => {
        receive = f;
      },
    },
    onDisconnect: {
      addListener: (f: typeof disconnect) => {
        disconnect = f;
      },
    },
  };
  return {
    port,
    sent,
    receive: (v: any) => receive(v),
    disconnect: () => disconnect(),
  };
}
it("delivers only to authenticated ready page, reuses same-window idle then reconciles duplicate ack", async () => {
  const f = fixture();
  const p = page(7);
  f.host.register(p.port);
  p.receive({ type: "ready", idle: true });
  await f.host.flush();
  await f.host.accept(
    { id: "handoff-two", destination: { kind: "pairing" } },
    1
  );
  await f.host.route("handoff-two");
  expect(p.sent).toContainEqual(
    expect.objectContaining({
      type: "destination",
      handoff: expect.objectContaining({ id: "handoff-two" }),
    })
  );
  p.receive({ type: "ack", id: "handoff-two", status: "applied" });
  await f.host.flush();
  await f.host.route("handoff-two");
  expect(f.records()[0].status).toBe("applied");
  expect(f.activated).toContain(7);
});
it("stale-idle decline preserves page work and creates a new pending target", async () => {
  const f = fixture();
  const p = page(7);
  f.host.register(p.port);
  p.receive({ type: "ready", idle: true });
  await f.host.flush();
  await f.host.accept({
    id: "handoff-stale",
    destination: { kind: "requests" },
  });
  await f.host.route("handoff-stale");
  p.receive({ type: "ack", id: "handoff-stale", status: "declined" });
  await f.host.flush();
  expect(f.records()[0]).toMatchObject({ target: 101, status: "pending" });
});
it("refuses credential/offscreen and content-script registrations", () => {
  const f = fixture();
  const p = page(8);
  p.port.sender.url += "?task=pairing";
  f.host.register(p.port);
  expect(p.port.disconnect).toHaveBeenCalled();
});
it("two rapid destinations reserve separate targets and matching occupied task focuses without replacement", async () => {
  const f = fixture(),
    sameWindow = page(7),
    other = page(8, 2);
  f.host.register(other.port);
  f.host.register(sameWindow.port);
  other.receive({ type: "ready", idle: true });
  sameWindow.receive({ type: "ready", idle: true });
  await f.host.flush();
  await f.host.accept({ id: "rapid-one", destination: { kind: "history" } }, 1);
  await f.host.accept(
    { id: "rapid-two", destination: { kind: "requests" } },
    1
  );
  await Promise.all([f.host.route("rapid-one"), f.host.route("rapid-two")]);
  expect(f.records().map((r) => r.target)).toEqual([7, 8]);
  sameWindow.receive({ type: "ack", id: "rapid-one", status: "applied" });
  await f.host.flush();
  sameWindow.receive({
    type: "ready",
    idle: false,
    current: { kind: "pairing" },
  });
  await f.host.flush();
  await f.host.accept({ id: "matching", destination: { kind: "pairing" } }, 1);
  await f.host.route("matching");
  expect(f.records().find((r) => r.id === "matching")?.target).toBe(7);
});
it("restart reconciles the original target and lost ack without creating another tab", async () => {
  let records: any[] = [];
  let creates = 0;
  const options = {
    extensionId: "extension",
    popupUrl: "chrome-extension://extension/src/popup.html",
    pageUrl: "chrome-extension://extension/src/options.html",
    read: async () => structuredClone(records),
    write: async (v: any[]) => {
      records = structuredClone(v);
    },
    create: async () => ({ id: ++creates, windowId: 1 }),
    exists: async () => true,
    activate: async () => {},
    now: () => 10,
  };
  const first = createChromeManagement(options);
  await first.accept({ id: "restart", destination: { kind: "requests" } });
  await first.route("restart");
  expect(creates).toBe(1);
  const second = createChromeManagement(options),
    p = page(1);
  second.register(p.port);
  p.receive({ type: "ready", idle: true });
  await second.flush();
  expect(p.sent).toContainEqual(
    expect.objectContaining({ type: "destination" })
  );
  expect(creates).toBe(1);
  p.receive({ type: "ack", id: "restart", status: "applied" });
  await second.flush();
  expect(records[0].status).toBe("applied");
});
it("uncertain creation reconciles a new canonical tab before retry and retains expiry failure until dismissal", async () => {
  let records: any[] = [];
  let now = 10;
  let creates = 0;
  const host = createChromeManagement({
    extensionId: "extension",
    popupUrl: "chrome-extension://extension/src/popup.html",
    pageUrl: "chrome-extension://extension/src/options.html",
    read: async () => structuredClone(records),
    write: async (v) => {
      records = structuredClone(v);
    },
    create: async () => {
      creates++;
      throw new Error("lost callback");
    },
    exists: async () => true,
    canonicalTabs: async () => (creates ? [101] : []),
    activate: async () => {},
    now: () => now,
  });
  const sender = {
    id: "extension",
    url: "chrome-extension://extension/src/popup.html",
  };
  await host.accept({ id: "uncertain", destination: { kind: "requests" } });
  await host.route("uncertain");
  expect(records[0].status).toBe("unconfirmed");
  await host.retry(sender, "uncertain");
  expect(records[0]).toMatchObject({ target: 101, status: "pending" });
  expect(creates).toBe(1);
  now = 130000;
  expect(await host.status(sender)).toMatchObject({
    records: [expect.objectContaining({ status: "failed" })],
  });
  now = 999999;
  expect((await host.status(sender)).records).toHaveLength(1);
  await host.dismiss(sender, "uncertain");
  expect(records).toHaveLength(0);
});
it("retry retains an unseen uncertain creation across worker restart until the original tab appears", async () => {
  let records: any[] = [];
  let creates = 0;
  const tabs: number[] = [];
  const options = {
    extensionId: "extension",
    popupUrl: "chrome-extension://extension/src/popup.html",
    pageUrl: "chrome-extension://extension/src/options.html",
    read: async () => structuredClone(records),
    write: async (values: any[]) => {
      records = structuredClone(values);
    },
    create: async () => {
      creates++;
      if (creates === 1) throw new Error("lost callback before tab appears");
      tabs.push(102);
      return { id: 102, windowId: 1 };
    },
    exists: async (id: number) => tabs.includes(id),
    canonicalTabs: async () => [...tabs],
    activate: async () => {},
    now: () => 10,
  };
  const sender = { id: "extension", url: options.popupUrl };
  const first = createChromeManagement(options);
  await first.accept({
    id: "delayed-create",
    destination: { kind: "requests" },
  });
  await first.route("delayed-create");
  const restarted = createChromeManagement(options);
  await restarted.retry(sender, "delayed-create");
  expect((await restarted.status(sender)).records).toEqual([
    expect.objectContaining({ id: "delayed-create", status: "unconfirmed" }),
  ]);
  expect(creates).toBe(1);

  tabs.push(101);
  await restarted.retry(sender, "delayed-create");
  const original = page(101);
  restarted.register(original.port);
  original.receive({ type: "ready", idle: true });
  await restarted.flush();
  expect(original.sent).toContainEqual({
    type: "destination",
    handoff: expect.objectContaining({ id: "delayed-create", target: 101 }),
  });
  original.receive({ type: "ack", id: "delayed-create", status: "applied" });
  await restarted.flush();
  expect((await restarted.status(sender)).records[0]).toMatchObject({
    id: "delayed-create",
    status: "applied",
    target: 101,
  });
  expect(creates).toBe(1);
});
it("a failed tab query keeps uncertain creation recoverable through its original handoff", async () => {
  let records: any[] = [];
  let queryFails = false;
  let creates = 0;
  const host = createChromeManagement({
    extensionId: "extension",
    popupUrl: "popup",
    pageUrl: "page",
    read: async () => structuredClone(records),
    write: async (values) => {
      records = structuredClone(values);
    },
    create: async () => {
      creates++;
      throw new Error("lost create callback");
    },
    exists: async () => true,
    canonicalTabs: async () => {
      if (queryFails) throw new Error("tab query unavailable");
      return creates ? [101] : [];
    },
    activate: async () => {},
    now: () => 10,
  });
  const sender = { id: "extension", url: "popup" };
  await host.accept({ id: "query", destination: { kind: "requests" } });
  await host.route("query");
  queryFails = true;
  await expect(host.retry(sender, "query")).resolves.toMatchObject({
    ok: true,
  });
  expect((await host.status(sender)).records[0]).toMatchObject({
    id: "query",
    status: "unconfirmed",
  });
  queryFails = false;
  await host.retry(sender, "query");
  expect((await host.status(sender)).records[0]).toMatchObject({
    id: "query",
    status: "pending",
    target: 101,
  });
  expect(creates).toBe(1);
});
it("rejects non-navigation payloads and storage failures before acceptance", async () => {
  const f = fixture();
  for (const destination of [
    { kind: "clip-details", entity: "id", body: "secret" },
    { kind: "history", context: { url: "https://example.com" } },
    { kind: "settings", credentials: "private" },
    { kind: "relay", url: "https://example.com" },
  ])
    expect(await f.host.accept({ id: "invalid", destination })).toMatchObject({
      ok: false,
    });
  const host = createChromeManagement({
    extensionId: "e",
    popupUrl: "popup",
    pageUrl: "page",
    read: async () => [],
    write: async () => {
      throw new Error("storage");
    },
    create: async () => ({ id: 1 }),
    exists: async () => true,
    activate: async () => {},
    now: () => 0,
  });
  await expect(
    host.request(
      { id: "e", url: "popup" },
      { id: "failure", destination: { kind: "requests" } }
    )
  ).rejects.toThrow("storage");
});
it("readback failure never claims accepted ownership and removed target gets a fresh canonical route", async () => {
  const unconfirmed = createChromeManagement({
    extensionId: "e",
    popupUrl: "popup",
    pageUrl: "page",
    read: async () => [],
    write: async () => {},
    create: async () => ({ id: 1 }),
    exists: async () => true,
    activate: async () => {},
    now: () => 0,
  });
  await expect(
    unconfirmed.accept({ id: "readback", destination: { kind: "requests" } })
  ).rejects.toThrow("management_acceptance_unconfirmed");
  let records: any[] = [];
  let created = 0;
  const host = createChromeManagement({
    extensionId: "e",
    popupUrl: "popup",
    pageUrl: "page",
    read: async () => structuredClone(records),
    write: async (values) => {
      records = structuredClone(values);
    },
    create: async () => ({ id: ++created }),
    exists: async () => false,
    activate: async () => {},
    now: () => 0,
  });
  await host.accept({ id: "closed", destination: { kind: "requests" } });
  await host.route("closed");
  await host.route("closed");
  expect(records[0].target).toBe(2);
});
it("an uncertain target lookup retains the original handoff for a later retry", async () => {
  let records: any[] = [];
  let lookupFails = true;
  let creates = 0;
  const host = createChromeManagement({
    extensionId: "extension",
    popupUrl: "chrome-extension://extension/src/popup.html",
    pageUrl: "chrome-extension://extension/src/options.html",
    read: async () => structuredClone(records),
    write: async (values) => {
      records = structuredClone(values);
    },
    create: async () => ({ id: ++creates, windowId: 1 }),
    exists: async () => {
      if (lookupFails) throw new Error("tab lookup callback unavailable");
      return true;
    },
    activate: async () => {},
    now: () => 10,
  });
  const sender = {
    id: "extension",
    url: "chrome-extension://extension/src/popup.html",
  };
  await host.accept({ id: "lookup", destination: { kind: "requests" } });
  await host.route("lookup");
  await expect(host.retry(sender, "lookup")).resolves.toMatchObject({
    ok: true,
  });
  expect((await host.status(sender)).records).toEqual([
    expect.objectContaining({ id: "lookup", status: "unconfirmed", target: 1 }),
  ]);

  lookupFails = false;
  await host.retry(sender, "lookup");
  const original = page(1);
  host.register(original.port);
  original.receive({ type: "ready", idle: true });
  await host.flush();
  expect(original.sent).toContainEqual({
    type: "destination",
    handoff: expect.objectContaining({ id: "lookup", target: 1 }),
  });
  original.receive({ type: "ack", id: "lookup", status: "applied" });
  await host.flush();
  expect((await host.status(sender)).records[0]).toMatchObject({
    id: "lookup",
    status: "applied",
    target: 1,
  });
  expect(creates).toBe(1);
});
it("rejects inconsistent page/tab identity, wrong extension and stale replaced document acknowledgement", async () => {
  const f = fixture();
  const request = { id: "identity", destination: { kind: "requests" } };
  expect(
    await f.host.request(
      { id: "foreign", url: "chrome-extension://extension/src/popup.html" },
      request
    )
  ).toMatchObject({ ok: false });
  expect(
    await f.host.request(
      {
        id: "extension",
        url: "chrome-extension://extension/src/options.html",
        tab: { id: 7, url: "https://content.example" },
        frameId: 0,
      },
      request
    )
  ).toMatchObject({ ok: false });
  const first = page(7),
    replacement = page(7);
  f.host.register(first.port);
  first.receive({ type: "ready", idle: true });
  await f.host.flush();
  await f.host.accept(request);
  await f.host.route("identity");
  first.receive({ type: "ack", id: "identity", status: "applied" });
  f.host.register(replacement.port);
  await f.host.flush();
  expect(f.records()[0].status).toBe("pending");
});
it("a duplicate handoff with equivalent filter context is idempotent regardless of object property order", async () => {
  const f = fixture();
  await f.host.accept({
    id: "context-order",
    destination: {
      kind: "history",
      context: { search: "query", filterMode: "pinned" },
    },
  });
  expect(
    await f.host.accept({
      id: "context-order",
      destination: {
        context: { filterMode: "pinned", search: "query" },
        kind: "history",
      },
    })
  ).toMatchObject({ ok: true, status: "pending" });
  expect(f.records()).toHaveLength(1);
  expect(
    await f.host.accept({
      id: "context-order",
      destination: {
        kind: "history",
        context: { search: "changed", filterMode: "pinned" },
      },
    })
  ).toMatchObject({ ok: false, error: "handoff_id_conflict" });
});
it("identity reset durably invalidates accepted navigation and tells surviving documents to forget it", async () => {
  const f = fixture(),
    p = page(7);
  f.host.register(p.port);
  p.receive({ type: "ready", idle: true });
  await f.host.flush();
  await f.host.accept({
    id: "old-identity",
    destination: { kind: "requests" },
  });
  await f.host.route("old-identity");
  await f.host.invalidate();
  expect(f.records()).toEqual([]);
  expect(p.sent).toContainEqual({ type: "identity-reset" });
  p.receive({ type: "ack", id: "old-identity", status: "applied" });
  await f.host.flush();
  expect(f.activated).toEqual([]);
  expect(
    await f.host.accept({
      id: "during-reset",
      destination: { kind: "requests" },
    })
  ).toMatchObject({ ok: false });
});
it("requires canonical top-level page identity for options-origin navigation", async () => {
  const f = fixture();
  const request = { id: "page-identity", destination: { kind: "requests" } };
  for (const sender of [
    {
      id: "extension",
      url: "chrome-extension://extension/src/options.html",
      frameId: 0,
    },
    {
      id: "extension",
      url: "chrome-extension://extension/src/options.html",
      frameId: 0,
      tab: { id: -1, url: "chrome-extension://extension/src/options.html" },
    },
    {
      id: "extension",
      url: "chrome-extension://extension/src/options.html",
      frameId: 2,
      tab: { id: 7, url: "chrome-extension://extension/src/options.html" },
    },
  ])
    expect(await f.host.request(sender, request)).toMatchObject({ ok: false });
  expect(await f.host.request(page(7).port.sender, request)).toMatchObject({
    ok: true,
  });
});
it("retry clears a retained activation failure after the original page is focused", async () => {
  let records: any[] = [],
    fail = true;
  const host = createChromeManagement({
    extensionId: "extension",
    popupUrl: "popup",
    pageUrl: "page",
    read: async () => structuredClone(records),
    write: async (values) => {
      records = structuredClone(values);
    },
    create: async () => ({ id: 1 }),
    exists: async () => true,
    activate: async () => {
      if (fail) throw new Error("window unavailable");
    },
    now: () => 10,
  });
  const target = page(7);
  target.port.sender.url = "page";
  target.port.sender.tab.url = "page";
  host.register(target.port);
  target.receive({ type: "ready", idle: true });
  await host.flush();
  await host.accept({ id: "activation", destination: { kind: "requests" } });
  await host.route("activation");
  target.receive({ type: "ack", id: "activation", status: "applied" });
  await host.flush();
  expect(records[0].error).toContain("could not be activated");
  fail = false;
  expect(
    await host.retry({ id: "extension", url: "popup" }, "activation")
  ).toMatchObject({ ok: true });
  expect(
    (await host.status({ id: "extension", url: "popup" })).records[0]
  ).toMatchObject({ status: "applied", error: undefined });
});
it("failed durable reset cleanup still retires surviving page navigation", async () => {
  const p = page(7);
  const host = createChromeManagement({
    extensionId: "extension",
    popupUrl: "popup",
    pageUrl: "chrome-extension://extension/src/options.html",
    read: async () => [],
    write: async () => {
      throw new Error("mailbox unavailable");
    },
    create: async () => ({ id: 1 }),
    exists: async () => true,
    activate: async () => {},
    now: () => 10,
  });
  host.register(p.port);
  await expect(host.invalidate()).rejects.toThrow("mailbox unavailable");
  expect(p.sent).toContainEqual({ type: "identity-reset" });
  expect(
    await host.accept({ id: "retired", destination: { kind: "requests" } })
  ).toMatchObject({ ok: false });
});
it("reset cannot confirm durable navigation cleanup from an unverified write callback", async () => {
  const host = createChromeManagement({
    extensionId: "extension",
    popupUrl: "popup",
    pageUrl: "page",
    read: async () => [
      {
        id: "old",
        destination: { kind: "requests" },
        status: "pending",
        createdAt: 10,
        attempts: 0,
      },
    ],
    write: async () => {},
    create: async () => ({ id: 1 }),
    exists: async () => true,
    activate: async () => {},
    now: () => 10,
  });
  await expect(host.invalidate()).rejects.toThrow(
    "management_reset_cleanup_unconfirmed"
  );
});
it("an explicit Retry gives a failed handoff another bounded opportunity without changing its ID", async () => {
  let records: any[] = [],
    created = 0;
  const host = createChromeManagement({
    extensionId: "extension",
    popupUrl: "popup",
    pageUrl: "page",
    read: async () => structuredClone(records),
    write: async (values) => {
      records = structuredClone(values);
    },
    create: async () => ({ id: ++created }),
    exists: async () => false,
    activate: async () => {},
    now: () => 10,
  });
  await host.accept({ id: "retry-bounded", destination: { kind: "requests" } });
  for (let attempt = 0; attempt < 4; attempt++)
    await host.route("retry-bounded");
  const sender = { id: "extension", url: "popup" };
  expect((await host.status(sender)).records[0].status).toBe("failed");
  await host.retry(sender, "retry-bounded");
  expect((await host.status(sender)).records).toEqual([
    expect.objectContaining({
      id: "retry-bounded",
      status: "pending",
      target: 4,
    }),
  ]);
});
