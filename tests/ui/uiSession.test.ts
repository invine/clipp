jest.mock(
  "@multiformats/multiaddr",
  () => ({ multiaddr: (value: string) => ({ toString: () => value }) }),
  { virtual: true }
);
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createUiSession } from "../../packages/ui/src/uiSession";
import { createHostTaskInput } from "../../packages/ui/src/hostTaskInput";
import { ManagedRelaySettings } from "../../packages/ui/src/ManagedRelaySettings";
const a = {
  key: "a",
  name: "A",
  kind: "managed" as const,
  discoveryUrl: "https://a.example/v1/relay",
};
it("re-presents a failed relay draft with one live owner and retains query, scroll and task context", async () => {
  const session = createUiSession();
  session.update({
    search: "query",
    filterMode: "pinned",
    sourceFilter: "device",
    scroll: { navigation: 140 },
    destination: "settings",
  });
  session.open({ kind: "relay", entity: "a", origin: "relay:a" });
  session.relay.begin(a);
  session.relay.change("name", "Retained name");
  await session.relay.save(async () => ({
    status: "rejected",
    configurations: [a],
    configurationApplied: false,
    credentialsRemoved: [],
    error: "disk_full",
  }));
  const render = () =>
    renderToStaticMarkup(
      React.createElement(ManagedRelaySettings, {
        session,
        configurations: [a],
        states: [],
        onMutate: async (): Promise<
          import("../../packages/core/network/relayMutations").RelayMutationResult
        > => ({
          status: "applied",
          configurations: [a],
          configurationApplied: true,
          credentialsRemoved: [],
        }),
      })
    );
  expect(render()).toContain('value="Retained name"');
  session.back();
  expect(render()).not.toContain('value="Retained name"');
  session.relay.begin(a);
  session.open({ kind: "relay", entity: "a", origin: "relay:a" });
  expect(render()).toContain("disk_full");
  expect(session.getSnapshot()).toMatchObject({
    search: "query",
    filterMode: "pinned",
    destination: "settings",
    scroll: { navigation: 140 },
  });
  session.discard();
  session.relay.begin(a);
  expect(session.relay.getSnapshot()?.raw.name).toBe("A");
});
it("Back restores the parent Pairing invoker and retains input, while Discard only clears unsubmitted input", () => {
  const session = createUiSession();
  session.open({ kind: "pairing", origin: "add-device" });
  expect(session.getSnapshot().tasks).toEqual([
    { kind: "pairing", origin: "add-device" },
  ]);
  session.open({ kind: "paste", origin: "paste-choice" });
  session.pairing.change("raw invalid target");
  session.back();
  expect(session.getSnapshot().tasks).toEqual([
    {
      kind: "pairing",
      origin: "add-device",
      initialFocusKey: "paste-choice",
    },
  ]);
  session.update({ focusKey: "another-chooser-control" });
  expect(session.getSnapshot().tasks).toEqual([
    {
      kind: "pairing",
      origin: "add-device",
      initialFocusKey: "paste-choice",
    },
  ]);
  expect(session.pairing.getSnapshot().raw).toBe("raw invalid target");
  session.discard();
  expect(session.pairing.getSnapshot().raw).toBe("");
});
it("one relay can fail while another action completes, without pretending portal opening is login", async () => {
  const session = createUiSession();
  let fail!: () => void;
  const a = session.relayAction(
    "a",
    () =>
      new Promise((_, reject) => {
        fail = () => reject(new Error("cancelled"));
      })
  );
  await session.relayAction("b", async () => ({ status: "portal-opened" }));
  expect(session.getSnapshot().relayActions).toMatchObject({
    a: { pending: true },
    b: { pending: false, result: { status: "portal-opened" } },
  });
  fail();
  await a;
  expect(session.getSnapshot().relayActions.a.result?.status).toBe(
    "unconfirmed"
  );
});
it("an Auto Sync unconfirmed result prevents repeat Save until current state is refreshed", async () => {
  const session = createUiSession();
  await session.saveAutoSync(async () => ({
    status: "unconfirmed",
    autoSync: true,
    error: "lost_reply",
  }));
  const repeated = jest.fn();
  await session.saveAutoSync(repeated);
  expect(repeated).not.toHaveBeenCalled();
  await session.refreshAutoSync(async () => true);
  expect(session.getSnapshot().autoSync).toMatchObject({
    recoveryRequired: false,
    refreshed: true,
    feedback: { status: "unconfirmed" },
  });
});
it("opening an unrelated editor suspends its former task and retains the former draft", () => {
  const session = createUiSession();
  session.open({
    kind: "device-name",
    entity: "local",
    origin: "rename-local",
  });
  session.name.begin("local", "Desktop");
  session.name.change("Retained desk");
  session.open({ kind: "relay", entity: "a", origin: "relay:a" });
  session.relay.begin(a);
  expect(session.name.getSnapshot()).toMatchObject({
    active: false,
    raw: "Retained desk",
  });
  expect(session.getSnapshot().tasks).toEqual([
    { kind: "relay", entity: "a", origin: "relay:a" },
  ]);
});
it("atomically declines destination reuse with a suspended failed draft, while matching task retains context", async () => {
  const session = createUiSession();
  session.open({ kind: "device-name", entity: "local", origin: "device-name" });
  session.name.begin("local", "Original");
  session.name.change("Retained edit");
  await session.name.save(async () => {
    throw new Error("disk_full");
  });
  session.back();
  expect(
    session.acceptDestination(
      "incoming",
      { kind: "requests" },
      { ready: true, clipIds: [], requestIds: [] }
    )
  ).toBe("declined");
  expect(session.name.getSnapshot().raw).toBe("Retained edit");
  session.open({ kind: "device-name", entity: "local", origin: "device-name" });
  session.update({ search: "retained" });
  session.name.cancel();
  session.close();
  expect(
    session.acceptDestination(
      "pair",
      { kind: "pairing" },
      { ready: true, clipIds: [], requestIds: [] }
    )
  ).toBe("applied");
  session.open({ kind: "paste", origin: "paste-choice" });
  session.pairing.change("draft");
  expect(
    session.acceptDestination(
      "pair2",
      { kind: "pairing" },
      { ready: true, clipIds: [], requestIds: [] }
    )
  ).toBe("applied");
  expect(session.pairing.getSnapshot().raw).toBe("draft");
  expect(session.getSnapshot().tasks).toHaveLength(2);
});
it("destination admission waits for authority, validates vanished Clip and is idempotent", () => {
  const session = createUiSession();
  const destination = { kind: "clip-details" as const, entity: "gone" };
  expect(
    session.acceptDestination("clip", destination, {
      ready: false,
      clipIds: [],
      requestIds: [],
    })
  ).toBe("waiting");
  expect(
    session.acceptDestination("clip", destination, {
      ready: true,
      clipIds: [],
      requestIds: [],
    })
  ).toBe("unavailable");
  expect(session.getSnapshot()).toMatchObject({
    destination: "history",
    taskNotice: expect.stringContaining("no longer available"),
  });
  session.update({ search: "later" });
  expect(
    session.acceptDestination("clip", destination, {
      ready: true,
      clipIds: [],
      requestIds: [],
    })
  ).toBe("unavailable");
  expect(session.getSnapshot().search).toBe("later");
});
it("an incoming Devices destination focuses its navigation and retains the History query", () => {
  const session = createUiSession();
  session.update({ search: "retained query", focusKey: "history-query" });
  expect(
    session.acceptDestination(
      "devices-incoming",
      { kind: "devices" },
      { ready: true, clipIds: [], requestIds: [] }
    )
  ).toBe("applied");
  expect(session.getSnapshot()).toMatchObject({
    destination: "devices",
    focusKey: "destination:devices",
    search: "retained query",
  });
});
it("generic page destination never qualifies as matching a different active task or pending operation", () => {
  const session = createUiSession();
  session.update({ destination: "settings" });
  session.open({ kind: "relay", entity: "new", origin: "relay:add" });
  session.relay.begin();
  expect(
    session.acceptDestination(
      "settings-incoming",
      { kind: "settings" },
      { ready: true, clipIds: [], requestIds: [] }
    )
  ).toBe("declined");
  session.discard();
  session.setActivity("settings-save", true);
  expect(
    session.acceptDestination(
      "pending-incoming",
      { kind: "settings" },
      { ready: true, clipIds: [], requestIds: [] }
    )
  ).toBe("declined");
  session.setActivity("settings-save", false);
  expect(
    session.acceptDestination(
      "idle-incoming",
      { kind: "settings", category: "general" },
      { ready: true, clipIds: [], requestIds: [] }
    )
  ).toBe("applied");
  expect(session.getSnapshot()).toMatchObject({
    settingsCategory: "general",
    navigationVersion: 1,
  });
});
it("unconfirmed Copy cannot be directly repeated or retried before explicit acknowledgement", async () => {
  const session = createUiSession();
  let copies = 0;
  const action = async () => {
    copies++;
    return {
      message: "Copy may already have happened.",
      action: "dismiss" as const,
      requiresAcknowledgement: true,
    };
  };
  await session.runHistoryAction("copy:clip", action);
  await session.retryHistoryAction("copy:clip");
  await session.runHistoryAction("copy:clip", action);
  expect(copies).toBe(1);
  expect(
    session.getSnapshot().historyActions["copy:clip"].feedback
      ?.requiresAcknowledgement
  ).toBe(true);
  session.dismissHistoryAction("copy:clip");
  await session.runHistoryAction("copy:clip", action);
  expect(copies).toBe(2);
});
it("a new Copy clears earlier success while pending and does not start a duplicate action", async () => {
  const session = createUiSession();
  await session.runHistoryAction("copy:clip", async () => ({
    message: "Copied to clipboard.",
    action: "dismiss",
    status: "success",
  }));
  let finish!: (value: null) => void;
  let copies = 0;
  const copy = () => {
    copies++;
    return new Promise<null>((resolve) => {
      finish = resolve;
    });
  };
  const pending = session.runHistoryAction("copy:clip", copy);
  await session.runHistoryAction("copy:clip", copy);
  expect(copies).toBe(1);
  expect(session.getSnapshot().historyActions["copy:clip"]).toEqual({
    pending: true,
    feedback: null,
  });
  finish(null);
  await pending;
});
it("publishes destination availability as suspended editor work starts and is discarded", () => {
  const session = createUiSession();
  const availability: boolean[] = [];
  session.subscribe(() =>
    availability.push(session.destinationAvailability().idle)
  );
  session.name.begin("local", "Desktop");
  session.name.change("Retained draft");
  expect(availability.at(-1)).toBe(false);
  session.name.cancel();
  expect(availability.at(-1)).toBe(true);
});
it("Identity Rotation invalidates applied handoffs and identity-bound History context", () => {
  const session = createUiSession();
  const authority = { ready: true, clipIds: ["old"], requestIds: [] };
  session.acceptDestination(
    "old-handoff",
    { kind: "clip-details", entity: "old" },
    authority
  );
  session.update({
    search: "old search",
    sourceFilter: "old-peer",
    focusKey: "more:old",
    historyAnchor: { clipId: "old", offset: 20 },
  });
  session.rotateIdentity();
  expect(session.getSnapshot()).toMatchObject({
    tasks: [],
    search: "",
    sourceFilter: "all",
    focusKey: "workspace",
    historyAnchor: null,
  });
  expect(
    session.acceptDestination(
      "old-handoff",
      { kind: "clip-details", entity: "old" },
      { ...authority, clipIds: [] }
    )
  ).toBe("unavailable");
});
it("retains failed Pairing image import across task dismissal and retries through the document owner", async () => {
  const session = createUiSession();
  session.open({ kind: "pairing", origin: "pairing-start" });
  let available = false;
  const received: string[] = [];
  await session.importPairing(
    async () => {
      if (!available) throw new Error("No QR code found.");
      return "target";
    },
    async (text) => {
      received.push(text);
    }
  );
  session.close();
  expect(session.getSnapshot().pairingImport.error).toBe("No QR code found.");
  expect(session.destinationAvailability().idle).toBe(false);
  session.open({ kind: "pairing", origin: "pairing-start" });
  available = true;
  await session.retryPairingImport();
  expect(received).toEqual(["target"]);
  expect(session.getSnapshot().pairingImport).toEqual({
    pending: false,
    error: null,
  });
});
it("late Pairing imports cannot replace newer input or cross Identity Rotation", async () => {
  const session = createUiSession();
  let finish!: (text: string) => void;
  const received: string[] = [];
  const read = () =>
    new Promise<string>((resolve) => {
      finish = resolve;
    });
  const submit = async (text: string) => {
    received.push(text);
  };
  const importing = session.importPairing(read, submit);
  session.pairing.change("newer input");
  finish("old import");
  await importing;
  expect(received).toEqual([]);
  expect(session.getSnapshot().pairingImport.error).toContain("changed");
  const next = session.importPairing(read, submit);
  session.rotateIdentity();
  finish("former identity target");
  await next;
  expect(received).toEqual([]);
  expect(session.getSnapshot().pairingImport).toEqual({
    pending: false,
    error: null,
  });
});
it("matching incoming Pairing requests focus its current subtask while preserving draft and query", () => {
  const session = createUiSession();
  const authority = { ready: true, clipIds: [], requestIds: [] };
  session.acceptDestination("first-pairing", { kind: "pairing" }, authority);
  session.open({ kind: "paste", origin: "pairing-paste" });
  session.pairing.change("retained target");
  session.update({ search: "retained query" });
  const before = session.getSnapshot().navigationVersion;
  session.acceptDestination("focus-pairing", { kind: "pairing" }, authority);
  expect(session.getSnapshot().navigationVersion).toBe((before ?? 0) + 1);
  expect(session.getSnapshot()).toMatchObject({
    search: "retained query",
    tasks: [{ kind: "pairing" }, { kind: "paste" }],
  });
  expect(session.pairing.getSnapshot().raw).toBe("retained target");
});
it.each(["success", "failure"])(
  "Discard retires an unread Pairing import and its late %s cannot displace a new import",
  async (outcome) => {
    const session = createUiSession();
    session.open({ kind: "pairing", origin: "pairing-start" });
    let finishOld!: (value: string) => void;
    let failOld!: (error: Error) => void;
    let reads = 0;
    const received: string[] = [];
    const submit = async (text: string) => {
      received.push(text);
    };
    const oldImport = session.importPairing(() => {
      reads++;
      return new Promise<string>((resolve, reject) => {
        finishOld = resolve;
        failOld = reject;
      });
    }, submit);
    session.open({ kind: "paste", origin: "pairing-paste" });
    session.discard();
    expect(session.getSnapshot().pairingImport).toEqual({
      pending: false,
      error: null,
    });
    await session.retryPairingImport();
    expect(reads).toBe(1);
    let finishNew!: (value: string) => void;
    const newImport = session.importPairing(
      () =>
        new Promise<string>((resolve) => {
          finishNew = resolve;
        }),
      submit
    );
    if (outcome === "success") finishOld("discarded target");
    else failOld(new Error("discarded read failure"));
    await oldImport;
    expect(received).toEqual([]);
    expect(session.getSnapshot().pairingImport).toEqual({
      pending: true,
      error: null,
    });
    finishNew("deliberate new target");
    await newImport;
    expect(received).toEqual(["deliberate new target"]);
    expect(session.getSnapshot().pairingImport).toEqual({
      pending: false,
      error: null,
    });
  }
);
it.each(["success", "failure"])(
  "a discarded import's late %s preserves a newer import error and its retry",
  async (outcome) => {
    const session = createUiSession();
    session.open({ kind: "pairing", origin: "pairing-start" });
    let finishOld!: (value: string) => void;
    let failOld!: (error: Error) => void;
    const received: string[] = [];
    const submit = async (text: string) => {
      received.push(text);
    };
    const oldImport = session.importPairing(
      () =>
        new Promise<string>((resolve, reject) => {
          finishOld = resolve;
          failOld = reject;
        }),
      submit
    );
    session.discard();
    let newInputAvailable = false;
    await session.importPairing(async () => {
      if (!newInputAvailable) throw new Error("New image has no QR code.");
      return "new retry target";
    }, submit);
    if (outcome === "success") finishOld("discarded target");
    else failOld(new Error("discarded failure"));
    await oldImport;
    expect(session.getSnapshot().pairingImport).toEqual({
      pending: false,
      error: "New image has no QR code.",
    });
    expect(received).toEqual([]);
    newInputAvailable = true;
    await session.retryPairingImport();
    expect(received).toEqual(["new retry target"]);
  }
);
it("Close retains a pending import, and Discard does not cancel its already submitted Trust Request", async () => {
  const session = createUiSession();
  session.open({ kind: "pairing", origin: "pairing-start" });
  let finishRead!: (text: string) => void;
  let finishRequest!: (result: { ok: true }) => void;
  let notifySubmitted!: () => void;
  const submitted = new Promise<void>((resolve) => {
    notifySubmitted = resolve;
  });
  const importing = session.importPairing(
    () =>
      new Promise<string>((resolve) => {
        finishRead = resolve;
      }),
    async (text) => {
      session.pairing.change(text);
      await session.pairing.submit(
        () =>
          new Promise((resolve) => {
            finishRequest = resolve;
            notifySubmitted();
          })
      );
    }
  );
  session.close();
  expect(session.getSnapshot().pairingImport.pending).toBe(true);
  finishRead("retained target");
  await submitted;
  session.open({ kind: "pairing", origin: "pairing-start" });
  session.open({ kind: "paste", origin: "pairing-paste" });
  session.discard();
  expect(session.pairing.getSnapshot()).toMatchObject({
    raw: "retained target",
    pending: true,
  });
  expect(session.getSnapshot().pairingImport.pending).toBe(true);
  finishRequest({ ok: true });
  await importing;
  expect(session.pairing.getSnapshot()).toMatchObject({
    pending: false,
    result: { ok: true },
  });
  expect(session.getSnapshot().pairingImport).toEqual({
    pending: false,
    error: null,
  });
});

it("notification selection opens reconciled Requests and Back restores the pending editor and query", async () => {
  const session = createUiSession();
  session.update({
    destination: "devices",
    search: "retained query",
    scroll: { devices: 88 },
    focusKey: "rename-local",
  });
  session.open({
    kind: "device-name",
    entity: "local",
    origin: "rename-local",
  });
  session.name.begin("local", "Desktop");
  session.name.change("unsaved name");
  let finish!: () => void;
  const saving = session.name.save(async () => {
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
    throw new Error("disk_full");
  });
  const authority = { ready: false, clipIds: [], requestIds: ["incoming"] };
  expect(
    session.acceptDestination(
      "selected",
      { kind: "requests", entity: "incoming" },
      authority,
      "notification"
    )
  ).toBe("waiting");
  expect(session.getSnapshot().tasks[0]?.kind).toBe("device-name");
  authority.ready = true;
  expect(
    session.acceptDestination(
      "selected",
      { kind: "requests", entity: "incoming" },
      authority,
      "notification"
    )
  ).toBe("applied");
  expect(session.getSnapshot()).toMatchObject({
    destination: "requests",
    tasks: [],
    search: "retained query",
  });
  expect(session.name.getSnapshot()).toMatchObject({
    raw: "unsaved name",
    pending: true,
  });
  finish();
  await saving;
  expect(
    session.acceptDestination(
      "selected",
      { kind: "requests", entity: "incoming" },
      authority,
      "notification"
    )
  ).toBe("applied");
  session.back();
  expect(session.getSnapshot()).toMatchObject({
    destination: "devices",
    search: "retained query",
    scroll: { devices: 88 },
    tasks: [{ kind: "device-name" }],
    focusKey: "rename-local",
  });
  expect(session.name.getSnapshot()).toMatchObject({
    raw: "unsaved name",
    pending: false,
    error: "disk_full",
  });
});

it.each(["issues", "relay"] as const)(
  "a distinct notification reveals Requests over a newer %s task and retains both return contexts",
  async (kind) => {
    const session = createUiSession();
    session.update({ destination: "devices", search: "retained query" });
    session.open({
      kind: "device-name",
      entity: "local",
      origin: "rename-local",
    });
    session.name.begin("local", "Desktop");
    session.name.change("original pending name");
    let finish!: () => void;
    const saving = session.name.save(async () => {
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      throw new Error("disk_full");
    });
    const authority = {
      ready: true,
      clipIds: [],
      requestIds: ["first", "second"],
    };
    session.acceptDestination(
      "selection-a",
      { kind: "requests", entity: "first" },
      authority,
      "notification"
    );
    if (kind === "relay") {
      session.update({ destination: "settings" });
      session.open({ kind: "relay", entity: "a", origin: "relay:a" });
      session.relay.begin(a);
      session.relay.change("name", "newest relay draft");
    } else session.open({ kind: "issues", origin: "issues-summary" });
    // Re-delivery of the handled first selection must not interrupt newer work.
    session.acceptDestination(
      "selection-a",
      { kind: "requests", entity: "first" },
      authority,
      "notification"
    );
    expect(session.getSnapshot().tasks.at(-1)?.kind).toBe(kind);
    expect(
      session.acceptDestination(
        "selection-b",
        { kind: "requests", entity: "second" },
        authority,
        "notification"
      )
    ).toBe("applied");
    expect(session.getSnapshot()).toMatchObject({
      destination: "requests",
      tasks: [],
      search: "retained query",
    });
    finish();
    await saving;
    session.back();
    expect(session.getSnapshot()).toMatchObject({
      destination: kind === "relay" ? "settings" : "requests",
      tasks: [{ kind }],
    });
    if (kind === "relay")
      expect(session.relay.getSnapshot()?.raw.name).toBe("newest relay draft");
    session.back(); // Close the newer task; the original notification return remains.
    session.back();
    expect(session.getSnapshot()).toMatchObject({
      destination: "devices",
      tasks: [{ kind: "device-name" }],
      search: "retained query",
    });
    expect(session.name.getSnapshot()).toMatchObject({
      raw: "original pending name",
      pending: false,
      error: "disk_full",
    });
    // A handled second selection must not resurrect Requests after returning.
    session.acceptDestination(
      "selection-b",
      { kind: "requests", entity: "second" },
      authority,
      "notification"
    );
    expect(session.getSnapshot().tasks.at(-1)?.kind).toBe("device-name");
  }
);

it("an authoritative completion removes an older task suspended by repeated notification entries", () => {
  const session = createUiSession();
  session.update({ destination: "devices" });
  session.open({
    kind: "device-name",
    entity: "local",
    origin: "rename-local",
  });
  const authority = { ready: true, clipIds: [], requestIds: [] };
  session.acceptDestination(
    "selection-a",
    { kind: "requests" },
    authority,
    "notification"
  );
  session.open({ kind: "issues", origin: "issues-summary" });
  session.acceptDestination(
    "selection-b",
    { kind: "requests" },
    authority,
    "notification"
  );
  session.complete("device-name", "local");
  session.back();
  expect(session.getSnapshot().tasks.at(-1)?.kind).toBe("issues");
  session.back();
  session.back();
  expect(session.getSnapshot()).toMatchObject({
    destination: "devices",
    tasks: [],
  });
});

it("Identity Rotation retires every notification return while retaining the relay draft for deliberate reopen", () => {
  const session = createUiSession();
  session.update({ destination: "settings" });
  session.open({ kind: "relay", entity: "a", origin: "relay:a" });
  session.relay.begin(a);
  session.relay.change("name", "retained relay draft");
  const authority = { ready: true, clipIds: [], requestIds: [] };
  session.acceptDestination(
    "selection-a",
    { kind: "requests" },
    authority,
    "notification"
  );
  session.open({ kind: "issues", origin: "issues-summary" });
  session.acceptDestination(
    "selection-b",
    { kind: "requests" },
    authority,
    "notification"
  );
  session.rotateIdentity();
  expect(session.getSnapshot()).toMatchObject({
    notificationReturn: null,
    tasks: [],
  });
  expect(session.relay.getSnapshot()).toMatchObject({
    active: false,
    raw: { name: "retained relay draft" },
  });
  session.back();
  expect(session.getSnapshot().tasks).toEqual([]);
});

it("a stale second selection reconciles Requests and cannot replay over restored newer work", () => {
  const session = createUiSession();
  session.open({ kind: "pairing", origin: "add-device" });
  session.pairing.change("original retained input");
  const authority = { ready: true, clipIds: [], requestIds: ["first"] };
  session.acceptDestination(
    "selection-a",
    { kind: "requests", entity: "first" },
    authority,
    "notification"
  );
  session.open({ kind: "issues", origin: "issues-summary" });
  expect(
    session.acceptDestination(
      "selection-stale",
      { kind: "requests", entity: "expired" },
      authority,
      "notification"
    )
  ).toBe("unavailable");
  expect(session.getSnapshot()).toMatchObject({
    destination: "requests",
    tasks: [],
    taskNotice: "This Request is no longer available. Open Requests.",
  });
  session.back();
  expect(session.getSnapshot().tasks.at(-1)?.kind).toBe("issues");
  session.acceptDestination(
    "selection-stale",
    { kind: "requests", entity: "expired" },
    authority,
    "notification"
  );
  expect(session.getSnapshot().tasks.at(-1)?.kind).toBe("issues");
  session.back();
  session.back();
  expect(session.getSnapshot().tasks.at(-1)?.kind).toBe("pairing");
  expect(session.pairing.getSnapshot().raw).toBe("original retained input");
});

it.each(["alias", "relay"] as const)(
  "returning through notification entries reactivates the retained %s draft for each task target",
  (kind) => {
    const session = createUiSession();
    session.update({ destination: kind === "alias" ? "devices" : "settings" });
    const edit = (entity: string, raw: string) => {
      session.open({ kind, entity, origin: `${kind}:${entity}` });
      if (kind === "alias") {
        session.alias.begin(entity, `Reported ${entity}`);
        session.alias.change(raw);
      } else {
        session.relay.begin({ ...a, key: entity, name: `Relay ${entity}` });
        session.relay.change("name", raw);
      }
    };
    const authority = { ready: true, clipIds: [], requestIds: [] };
    edit("a", "original target draft");
    session.acceptDestination(
      "selection-a",
      { kind: "requests" },
      authority,
      "notification"
    );
    edit("b", "newest target draft");
    session.acceptDestination(
      "selection-b",
      { kind: "requests" },
      authority,
      "notification"
    );
    session.back();
    if (kind === "alias")
      expect(session.alias.getSnapshot()).toMatchObject({
        targetId: "b",
        raw: "newest target draft",
        active: true,
      });
    else
      expect(session.relay.getSnapshot()).toMatchObject({
        key: "b",
        raw: { name: "newest target draft" },
        active: true,
      });
    session.back();
    session.back();
    expect(session.getSnapshot().tasks.at(-1)).toMatchObject({
      kind,
      entity: "a",
    });
    if (kind === "alias")
      expect(session.alias.getSnapshot()).toMatchObject({
        targetId: "a",
        raw: "original target draft",
        active: true,
      });
    else
      expect(session.relay.getSnapshot()).toMatchObject({
        key: "a",
        raw: { name: "original target draft" },
        active: true,
      });
  }
);

it("notification return uses the newest same-key draft and refuses a removed retained target", () => {
  const session = createUiSession();
  const authority = { ready: true, clipIds: [], requestIds: [] };
  const edit = (raw: string) => {
    session.open({ kind: "alias", entity: "a", origin: "alias:a" });
    session.alias.begin("a", "Reported A");
    session.alias.change(raw);
  };
  edit("original draft");
  session.acceptDestination(
    "selection-a",
    { kind: "requests" },
    authority,
    "notification"
  );
  edit("newest same-key draft");
  session.acceptDestination(
    "selection-b",
    { kind: "requests" },
    authority,
    "notification"
  );
  session.back();
  expect(session.alias.getSnapshot()).toMatchObject({
    targetId: "a",
    raw: "newest same-key draft",
  });
  session.back();
  session.back();
  expect(session.alias.getSnapshot()).toMatchObject({
    targetId: "a",
    raw: "newest same-key draft",
  });
  session.acceptDestination(
    "selection-c",
    { kind: "requests" },
    authority,
    "notification"
  );
  session.alias.removeTarget("a");
  session.back();
  expect(session.getSnapshot().tasks).toEqual([]);
  expect(session.alias.getSnapshot().targetId).toBeNull();
});

it("notification Back restores a pending Add Relay after partial save adopts its authoritative key", async () => {
  const session = createUiSession();
  const input = createHostTaskInput(session);
  input.setReady(true);
  session.update({ destination: "settings", settingsCategory: "relays" });
  session.open({ kind: "relay", entity: "new", origin: "relay:add" });
  session.relay.begin();
  session.relay.change("name", "Retained Add");
  session.relay.change("endpoint", "https://retained.example/v1/relay");
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let applied = a;
  const saving = session.relay.save(async (mutation) => {
    if (mutation.type !== "add" || mutation.configuration.kind !== "managed")
      throw Error("expected_add");
    applied = mutation.configuration;
    await gate;
    return {
      status: "partial",
      configurationApplied: true,
      configurations: [applied],
      credentialsRemoved: [],
      error: "resource_refresh_failed",
    };
  });
  session.acceptDestination(
    "pending-add",
    { kind: "requests" },
    { ready: true, clipIds: [], requestIds: [] },
    "notification"
  );
  expect(session.relay.getSnapshot()).toMatchObject({
    key: "new",
    pending: true,
  });
  release();
  await saving;
  expect(session.relay.getSnapshot()).toMatchObject({
    key: applied.key,
    pending: false,
    raw: { name: "Retained Add" },
    error: expect.stringContaining("resource_refresh_failed"),
  });
  expect(await input.back({ sequence: 1, imeVisible: false })).toBe("task");
  expect(session.getSnapshot().tasks).toEqual([
    expect.objectContaining({ kind: "relay", entity: applied.key }),
  ]);
  const render = () =>
    renderToStaticMarkup(
      React.createElement(ManagedRelaySettings, {
        session,
        configurations: [applied],
        states: [],
        onMutate: async () => {
          throw Error("unexpected_mutation_without_user_save");
        },
      })
    );
  expect(render()).toContain('value="Retained Add"');
  expect(render()).toContain("resource_refresh_failed");
  expect(input.atRoot()).toBe(false);
  expect(await input.back({ sequence: 2, imeVisible: false })).toBe("task");
  expect(render()).not.toContain('value="Retained Add"');
  expect(input.atRoot()).toBe(true);
  input.dispose();
});

it.each(["partial", "applied", "completed"] as const)(
  "an older Add return cannot select a later new editor after key adoption (%s)",
  async (outcome) => {
    const session = createUiSession();
    const authority = { ready: true, clipIds: [], requestIds: [] };
    session.update({ destination: "settings", settingsCategory: "relays" });
    session.open({ kind: "relay", entity: "new", origin: "relay:add" });
    session.relay.begin();
    session.relay.change("name", "First Add");
    session.relay.change("endpoint", "https://first.example/v1/relay");
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let applied = a;
    const saving = session.relay.save(async (mutation) => {
      if (mutation.type !== "add" || mutation.configuration.kind !== "managed")
        throw Error("expected_add");
      applied = mutation.configuration;
      await gate;
      return {
        status: outcome === "partial" ? "partial" : "applied",
        configurations: [applied],
        configurationApplied: true,
        credentialsRemoved: [],
        error: outcome === "partial" ? "refresh_failed" : undefined,
      };
    });
    if (outcome !== "completed")
      session.relay.change("name", "Newest First Add");
    session.acceptDestination(
      "first-add",
      { kind: "requests" },
      authority,
      "notification"
    );
    release();
    await saving;
    session.open({ kind: "relay", entity: "new", origin: "relay:add" });
    session.relay.begin();
    session.relay.change("name", "Separate Second Add");
    session.acceptDestination(
      "second-add",
      { kind: "requests" },
      authority,
      "notification"
    );
    session.back();
    expect(session.getSnapshot().tasks.at(-1)).toMatchObject({
      kind: "relay",
      entity: "new",
    });
    expect(session.relay.getSnapshot()).toMatchObject({
      raw: { name: "Separate Second Add" },
      active: true,
    });
    session.back();
    session.back();
    if (outcome === "completed") {
      expect(session.getSnapshot().tasks).toEqual([]);
      expect(session.relay.getSnapshot()).toMatchObject({
        key: "new",
        active: false,
        raw: { name: "Separate Second Add" },
      });
    } else {
      expect(session.getSnapshot().tasks.at(-1)).toMatchObject({
        kind: "relay",
        entity: applied.key,
      });
      expect(session.relay.getSnapshot()).toMatchObject({
        key: applied.key,
        active: true,
        pending: false,
        raw: { name: "Newest First Add" },
        error:
          outcome === "partial"
            ? expect.stringContaining("refresh_failed")
            : null,
      });
      session.back();
      expect(session.relay.getSnapshot()?.active).toBe(false);
    }
  }
);
