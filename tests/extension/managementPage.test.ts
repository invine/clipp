/// <reference types="chrome" />
import { bindManagementPage } from "../../apps/extension/src/managementPage";
import { createUiSession } from "../../packages/ui/src/uiSession";
function portFixture() {
  let message!: (value: any) => void, disconnected!: () => void;
  const sent: any[] = [];
  const port = {
    postMessage: (v: any) => sent.push(v),
    onMessage: {
      addListener: (f: typeof message) => {
        message = f;
      },
    },
    onDisconnect: {
      addListener: (f: typeof disconnected) => {
        disconnected = f;
      },
    },
    disconnect: jest.fn(),
  } as unknown as chrome.runtime.Port;
  return {
    port,
    sent,
    message: (v: any) => message(v),
    disconnected: () => disconnected(),
  };
}
it("actual page binder waits for authority then applies once across worker reconnect and lost acknowledgement", () => {
  const session = createUiSession();
  let ready = false,
    refresh!: () => void,
    reconnect!: () => void;
  const first = portFixture(),
    second = portFixture();
  let connections = 0;
  const dispose = bindManagementPage({
    connect: () => (connections++ ? second.port : first.port),
    session,
    authority: () => ({ ready, clipIds: ["clip-a"], requestIds: [] }),
    subscribeAuthority: (f) => {
      refresh = f;
      return () => {};
    },
    schedule: (f) => {
      reconnect = f;
      return () => {};
    },
  });
  const delivery = {
    type: "destination",
    handoff: {
      id: "one",
      destination: { kind: "clip-details", entity: "clip-a" },
    },
  };
  first.message(delivery);
  expect(session.getSnapshot().tasks).toEqual([]);
  ready = true;
  refresh();
  expect(session.getSnapshot().tasks).toEqual([
    { kind: "clip-details", entity: "clip-a", origin: "details:clip-a" },
  ]);
  expect(first.sent).toContainEqual({
    type: "ready",
    ready: true,
    idle: false,
    current: { kind: "clip-details", entity: "clip-a" },
  });
  expect(first.sent).toContainEqual({
    type: "ack",
    id: "one",
    status: "applied",
  });
  session.update({ search: "kept" });
  first.disconnected();
  reconnect();
  second.message(delivery);
  expect(session.getSnapshot().tasks).toHaveLength(1);
  expect(session.getSnapshot().search).toBe("kept");
  expect(second.sent).toContainEqual({
    type: "ack",
    id: "one",
    status: "applied",
  });
  dispose();
  second.message({
    type: "destination",
    handoff: { id: "two", destination: { kind: "requests" } },
  });
  expect(session.getSnapshot().destination).toBe("history");
});
it("surviving page drops pending old-identity handoffs on reset and detects rotation across worker interruption", () => {
  const session = createUiSession();
  const first = portFixture(),
    second = portFixture();
  let ready = false,
    identityId = "old",
    refresh!: () => void,
    reconnect!: () => void,
    connections = 0;
  bindManagementPage({
    connect: () => (connections++ ? second.port : first.port),
    session,
    authority: () => ({ ready, identityId, clipIds: [], requestIds: [] }),
    subscribeAuthority: (listener) => {
      refresh = listener;
      return () => {};
    },
    schedule: (listener) => {
      reconnect = listener;
      return () => {};
    },
  });
  first.message({
    type: "destination",
    handoff: { id: "old-handoff", destination: { kind: "pairing" } },
  });
  first.message({ type: "identity-reset" });
  ready = true;
  refresh();
  expect(session.getSnapshot().tasks).toEqual([]);
  session.open({ kind: "pairing", origin: "devices" });
  first.disconnected();
  identityId = "new";
  reconnect();
  expect(session.getSnapshot().tasks).toEqual([]);
  expect(second.sent).not.toContainEqual(
    expect.objectContaining({ type: "ack", id: "old-handoff" })
  );
});
