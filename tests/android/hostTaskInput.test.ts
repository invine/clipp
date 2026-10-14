jest.mock("@capacitor/core", () => ({
  Capacitor: { getPlatform: () => "android" },
  registerPlugin: () => ({}),
}));
jest.mock(
  "@multiformats/multiaddr",
  () => ({ multiaddr: (value: string) => ({ toString: () => value }) }),
  { virtual: true }
);
import {
  bindAndroidHostTaskInput,
  type AndroidTaskInputSource,
} from "../../apps/android/src/hostTaskInputNative";
import {
  createHostTaskInput,
  type NativeBackEvent,
} from "../../packages/ui/src/hostTaskInput";
import { createUiSession } from "../../packages/ui/src/uiSession";

it("the native bridge acknowledges one task level and root separately, rejecting repeats and late callbacks after disposal", async () => {
  const session = createUiSession();
  session.open({ kind: "pairing", origin: "add-device" });
  session.open({ kind: "paste", origin: "paste-choice" });
  session.pairing.change("retained draft");
  let event!: (event: NativeBackEvent & { owner: string }) => void;
  const acknowledgments: boolean[] = [];
  const source: AndroidTaskInputSource = {
    addListener: async (_name, callback) => {
      event = callback;
      return { remove: async () => {} };
    },
    setReady: async () => {},
    completeBack: async ({ handled }) => {
      acknowledgments.push(handled);
    },
  };
  const dispose = bindAndroidHostTaskInput(
    createHostTaskInput(session),
    source,
    "document"
  );
  await Promise.resolve();
  await Promise.resolve();
  event({ owner: "document", sequence: 1, imeVisible: false });
  await Promise.resolve();
  expect(session.getSnapshot().tasks.map((task) => task.kind)).toEqual([
    "pairing",
  ]);
  event({ owner: "document", sequence: 1, imeVisible: false });
  event({ owner: "old-document", sequence: 9, imeVisible: false });
  await Promise.resolve();
  expect(session.getSnapshot().tasks.map((task) => task.kind)).toEqual([
    "pairing",
  ]);
  event({ owner: "document", sequence: 2, imeVisible: false });
  await Promise.resolve();
  event({ owner: "document", sequence: 3, imeVisible: false });
  await Promise.resolve();
  expect(acknowledgments).toEqual([true, true, true, false]);
  session.open({ kind: "paste", origin: "paste-choice" });
  dispose();
  event({ owner: "document", sequence: 4, imeVisible: false });
  await Promise.resolve();
  expect(session.getSnapshot().tasks.map((task) => task.kind)).toEqual([
    "paste",
  ]);
  expect(session.pairing.getSnapshot().raw).toBe("retained draft");
});

it("a root Back cannot leave after a task opens before the bridge acknowledges it", async () => {
  const session = createUiSession();
  let event!: (event: NativeBackEvent & { owner: string }) => void;
  const acknowledgments: boolean[] = [];
  const dispose = bindAndroidHostTaskInput(
    createHostTaskInput(session),
    {
      addListener: async (_name, callback) => {
        event = callback;
        return { remove: async () => {} };
      },
      setReady: async () => {},
      completeBack: async ({ handled }) => {
        acknowledgments.push(handled);
      },
    },
    "document"
  );
  await Promise.resolve();
  await Promise.resolve();
  event({ owner: "document", sequence: 1, imeVisible: false });
  session.open({ kind: "pairing", origin: "add-device" });
  await Promise.resolve();
  expect(acknowledgments).toEqual([true]);
  expect(session.getSnapshot().tasks.map((task) => task.kind)).toEqual([
    "pairing",
  ]);
  dispose();
});

it("disposal before native listener readiness removes the late subscription without activating input", async () => {
  const session = createUiSession();
  session.open({ kind: "pairing", origin: "add-device" });
  let registered!: (handle: { remove(): Promise<void> }) => void;
  let event!: (event: NativeBackEvent & { owner: string }) => void;
  const readiness: boolean[] = [];
  let removed = false;
  const dispose = bindAndroidHostTaskInput(
    createHostTaskInput(session),
    {
      addListener: (_name, callback) => {
        event = callback;
        return new Promise((resolve) => {
          registered = resolve;
        });
      },
      setReady: async ({ ready }) => {
        readiness.push(ready);
      },
      completeBack: async () => {
        throw new Error("stale_ack");
      },
    },
    "document"
  );
  dispose();
  registered({
    async remove() {
      removed = true;
    },
  });
  event({ owner: "document", sequence: 1, imeVisible: false });
  await Promise.resolve();
  await Promise.resolve();
  expect({ readiness, removed }).toEqual({ readiness: [false], removed: true });
  expect(session.getSnapshot().tasks.map((task) => task.kind)).toEqual([
    "pairing",
  ]);
});
