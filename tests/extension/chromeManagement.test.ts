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
