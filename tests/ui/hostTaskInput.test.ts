jest.mock(
  "@multiformats/multiaddr",
  () => ({ multiaddr: (value: string) => ({ toString: () => value }) }),
  { virtual: true }
);
import { createUiSession } from "../../packages/ui/src/uiSession";
import { createHostTaskInput } from "../../packages/ui/src/hostTaskInput";

it("native IME Back keeps the task, then one hidden-IME Back returns from QR without discarding a failed draft", async () => {
  const session = createUiSession();
  session.open({ kind: "pairing", origin: "add-device" });
  session.pairing.change("retained invalid target");
  await session.pairing.submit(async () => ({
    ok: false,
    error: "invalid_target",
  }));
  session.open({ kind: "qr", origin: "show-code" });
  const input = createHostTaskInput(session);
  input.setReady(true);
  expect(await input.back({ sequence: 1, imeVisible: true })).toBe("ime");
  expect(session.getSnapshot().tasks.map((task) => task.kind)).toEqual([
    "pairing",
    "qr",
  ]);
  expect(await input.back({ sequence: 2, imeVisible: false })).toBe("task");
  expect(session.getSnapshot().tasks.map((task) => task.kind)).toEqual([
    "pairing",
  ]);
  await input.back({ sequence: 2, imeVisible: false });
  await input.back({ sequence: 1, imeVisible: false });
  expect(session.getSnapshot().tasks.map((task) => task.kind)).toEqual([
    "pairing",
  ]);
  expect(session.pairing.getSnapshot().raw).toBe("retained invalid target");
});

it("an active overlay consumes Back until its capture owner releases it, including cancellation still in flight", async () => {
  const session = createUiSession();
  session.open({ kind: "pairing", origin: "add-device" });
  const input = createHostTaskInput(session);
  input.setReady(true);
  let finish!: () => void;
  const release = input.registerOverlay({
    dismiss: () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  });
  const first = input.back({ sequence: 1, imeVisible: false });
  release();
  expect(await input.back({ sequence: 2, imeVisible: false })).toBe("overlay");
  expect(session.getSnapshot().tasks.map((task) => task.kind)).toEqual([
    "pairing",
  ]);
  finish();
  await first;
  expect(await input.back({ sequence: 3, imeVisible: false })).toBe("task");
});

it("an unavailable or disposed task consumer cannot apply delayed host input", async () => {
  const session = createUiSession();
  session.open({ kind: "pairing", origin: "add-device" });
  const input = createHostTaskInput(session);
  expect(await input.back({ sequence: 1, imeVisible: false })).toBe("ignored");
  input.setReady(true);
  input.dispose();
  input.setReady(true);
  expect(await input.back({ sequence: 2, imeVisible: false })).toBe("ignored");
  expect(session.getSnapshot().tasks.map((task) => task.kind)).toEqual([
    "pairing",
  ]);
});

it("native dismissal preserves newer typing across a late failed Save and the workspace context", async () => {
  const session = createUiSession();
  session.update({
    search: "query",
    sourceFilter: "local",
    filterMode: "pinned",
    scroll: { navigation: 240 },
  });
  session.open({
    kind: "device-name",
    entity: "local",
    origin: "rename-local",
  });
  session.name.begin("local", "Desktop");
  session.name.change("Submitted");
  let fail!: (error: Error) => void;
  const saving = session.name.save(
    () =>
      new Promise((_, reject) => {
        fail = reject;
      })
  );
  const input = createHostTaskInput(session);
  input.setReady(true);
  await input.back({ sequence: 1, imeVisible: false });
  session.name.begin("local", "Desktop");
  session.open({
    kind: "device-name",
    entity: "local",
    origin: "rename-local",
  });
  session.name.change("Newer typing");
  fail(new Error("disk_full"));
  await saving;
  expect(session.name.getSnapshot()).toMatchObject({
    raw: "Newer typing",
    error: "disk_full",
    active: true,
  });
  expect(session.getSnapshot()).toMatchObject({
    search: "query",
    sourceFilter: "local",
    filterMode: "pinned",
    scroll: { navigation: 240 },
  });
});
