jest.mock(
  "@multiformats/multiaddr",
  () => ({ multiaddr: (value: string) => ({ toString: () => value }) }),
  { virtual: true }
);
import { createElectronTaskActivation } from "../../apps/electron/src/hostTaskActivation";
import { bindElectronHostTaskInput } from "../../apps/electron/src/hostTaskInput";
import { createUiSession } from "../../packages/ui/src/uiSession";

it("Electron activation waits for the subscribed renderer and reuses its live session across hide/reopen", async () => {
  const session = createUiSession();
  session.open({ kind: "pairing", origin: "add-device" });
  session.open({ kind: "paste", origin: "paste-choice" });
  session.pairing.change("retained target");
  let listener: (() => void) | undefined;
  let entries = 0;
  const delivery = createElectronTaskActivation(() => listener?.());
  delivery.activate();
  delivery.activate();
  expect(entries).toBe(0);
  const dispose = bindElectronHostTaskInput(
    {
      onTaskActivation(callback) {
        listener = callback;
        return () => {
          listener = undefined;
        };
      },
      async setTaskInputReady(owner, ready) {
        delivery.setReady(owner, ready);
      },
    },
    session,
    () => {
      entries++;
    },
    "renderer"
  );
  await Promise.resolve();
  expect(entries).toBe(1);
  delivery.activate(); // hide/reopen preserves the same mounted owner
  expect(entries).toBe(2);
  expect(session.pairing.getSnapshot().raw).toBe("retained target");
  expect(session.getSnapshot().tasks.map((task) => task.kind)).toEqual([
    "pairing",
    "paste",
  ]);
  dispose();
  delivery.activate();
  expect(entries).toBe(2);
});

it("a replaced renderer keeps activation pending and ignores the old owner's disposal", () => {
  let entries = 0;
  const delivery = createElectronTaskActivation(() => {
    entries++;
  });
  delivery.setReady("old", true);
  delivery.invalidate();
  delivery.activate();
  delivery.activate();
  expect(entries).toBe(0);
  delivery.setReady("current", true);
  delivery.setReady("old", false);
  delivery.activate();
  expect(entries).toBe(2);
});
