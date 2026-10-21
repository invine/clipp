import { createRuntimeApprovalEntries } from "../../packages/core/runtime/notifications";
import {
  bindNotificationRequests,
  type NotificationRequestsBridge,
} from "../../packages/ui/src/notificationRequests";
import { createUiSession } from "../../packages/ui/src/uiSession";
let mockBridge: NotificationRequestsBridge;
const mockListeners = new Map<string, Set<() => void>>();
const mockEntries = createRuntimeApprovalEntries();
jest.mock(
  "electron",
  () => ({
    contextBridge: {
      exposeInMainWorld(_name: string, api: NotificationRequestsBridge) {
        mockBridge = api;
      },
    },
    ipcRenderer: {
      async invoke(channel: string, id?: string) {
        if (channel === "clipp:approval-entries") return mockEntries.read();
        if (channel === "clipp:acknowledge-approval-entry")
          mockEntries.acknowledge(id!);
      },
      on(channel: string, listener: () => void) {
        if (!mockListeners.has(channel)) mockListeners.set(channel, new Set());
        mockListeners.get(channel)!.add(listener);
      },
      removeListener(channel: string, listener: () => void) {
        mockListeners.get(channel)?.delete(listener);
      },
    },
  }),
  { virtual: true }
);
jest.mock(
  "@multiformats/multiaddr",
  () => ({ multiaddr: (value: string) => ({ toString: () => value }) }),
  { virtual: true }
);
it("actual preload retains cold notification entry until authoritative Requests are ready and preserves the editor", async () => {
  await import("../../apps/electron/src/preload");
  mockEntries.select({ id: "selection-1", requestId: "expired-peer" });
  const session = createUiSession();
  session.open({ kind: "pairing", origin: "add-device" });
  session.pairing.change("retained input");
  const authority = { ready: false, clipIds: [], requestIds: [] };
  const consumer = bindNotificationRequests(
    mockBridge,
    session,
    () => authority
  );
  await consumer.refresh();
  expect(session.getSnapshot().destination).toBe("history");
  expect(mockEntries.read()).toHaveLength(1);
  authority.ready = true;
  await consumer.refresh();
  expect(session.getSnapshot()).toMatchObject({
    destination: "requests",
    tasks: [],
    taskNotice: "This Request is no longer available. Open Requests.",
  });
  expect(mockEntries.read()).toEqual([]);
  expect(session.pairing.getSnapshot().raw).toBe("retained input");
  session.back();
  expect(session.getSnapshot().tasks[0]?.kind).toBe("pairing");
  consumer.dispose();
  mockEntries.select({ id: "selection-2" });
  mockListeners
    .get("clipp:approval-entries-changed")
    ?.forEach((listener) => listener());
  await Promise.resolve();
  expect(session.getSnapshot().destination).toBe("history");
});
