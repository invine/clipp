import { createElectronTaskActivation } from "../../apps/electron/src/hostTaskActivation";
import {
  bindElectronHostTaskInput,
  type ElectronTaskInputBridge,
} from "../../apps/electron/src/hostTaskInput";
import { createUiSession } from "../../packages/ui/src/uiSession";

const mockListeners = new Map<string, Set<() => void>>();
let mockBridge: ElectronTaskInputBridge;
let mockReady: (owner: string, ready: boolean) => void;
jest.mock(
  "electron",
  () => ({
    contextBridge: {
      exposeInMainWorld(_name: string, api: ElectronTaskInputBridge) {
        mockBridge = api;
      },
    },
    ipcRenderer: {
      async invoke(channel: string, value: { owner: string; ready: boolean }) {
        if (channel === "clipp:task-input-ready")
          mockReady(value.owner, value.ready);
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

afterEach(() => mockListeners.clear());
jest.mock(
  "@multiformats/multiaddr",
  () => ({ multiaddr: (value: string) => ({ toString: () => value }) }),
  { virtual: true }
);

it("the actual preload exposes readiness and activation to the mounted consumer and removes delivery on disposal", async () => {
  const delivery = createElectronTaskActivation(() => {
    mockListeners
      .get("clipp:task-activation")
      ?.forEach((listener) => listener());
    return true;
  });
  mockReady = delivery.setReady;
  await import("../../apps/electron/src/preload");
  const session = createUiSession();
  session.open({ kind: "pairing", origin: "pairing-start" });
  session.pairing.change("live draft");
  let focusEntries = 0;
  delivery.activate();
  const dispose = bindElectronHostTaskInput(
    mockBridge,
    session,
    () => {
      focusEntries++;
    },
    "live-renderer"
  );
  expect(focusEntries).toBe(1);
  delivery.activate();
  expect(focusEntries).toBe(2);
  expect(session.pairing.getSnapshot().raw).toBe("live draft");
  dispose();
  delivery.activate();
  expect(focusEntries).toBe(2);
});

it.each(["declined", "thrown"] as const)(
  "a %s activation delivery waits for a newly subscribed renderer without losing its pending entry",
  async (failure) => {
    let available = false;
    const delivery = createElectronTaskActivation(() => {
      if (!available) {
        if (failure === "thrown") throw new Error("renderer disappeared");
        return false;
      }
      mockListeners
        .get("clipp:task-activation")
        ?.forEach((listener) => listener());
      return true;
    });
    mockReady = delivery.setReady;
    await import("../../apps/electron/src/preload");
    const session = createUiSession();
    session.open({ kind: "pairing", origin: "pairing-start" });
    session.open({ kind: "paste", origin: "paste-choice" });
    session.pairing.change("retained target");
    let focusEntries = 0;
    const enter = () => {
      focusEntries++;
    };
    const disposeOld = bindElectronHostTaskInput(
      mockBridge,
      session,
      enter,
      "departing-renderer"
    );

    expect(() => delivery.activate()).not.toThrow();
    available = true;
    expect(focusEntries).toBe(0);
    disposeOld();
    const disposeCurrent = bindElectronHostTaskInput(
      mockBridge,
      session,
      enter,
      "current-renderer"
    );
    expect(focusEntries).toBe(1);
    delivery.setReady("departing-renderer", false);
    delivery.setReady("current-renderer", true);
    expect(focusEntries).toBe(1);

    available = false;
    delivery.activate();
    delivery.activate();
    available = true;
    delivery.activate();
    expect(focusEntries).toBe(1);
    delivery.setReady("current-renderer", true);
    expect(focusEntries).toBe(2);
    delivery.setReady("current-renderer", true);
    expect(focusEntries).toBe(2);
    expect(session.pairing.getSnapshot().raw).toBe("retained target");
    expect(session.getSnapshot().tasks.map((task) => task.kind)).toEqual([
      "pairing",
      "paste",
    ]);
    disposeCurrent();
  }
);
