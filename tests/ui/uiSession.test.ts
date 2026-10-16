jest.mock(
  "@multiformats/multiaddr",
  () => ({ multiaddr: (value: string) => ({ toString: () => value }) }),
  { virtual: true }
);
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createUiSession } from "../../packages/ui/src/uiSession";
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
it("Back leaves the parent Pairing task and retains input, while Discard only clears unsubmitted input", () => {
  const session = createUiSession();
  session.open({ kind: "pairing", origin: "add-device" });
  session.open({ kind: "paste", origin: "paste-choice" });
  session.pairing.change("raw invalid target");
  session.back();
  expect(session.getSnapshot().tasks).toEqual([
    { kind: "pairing", origin: "add-device" },
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
