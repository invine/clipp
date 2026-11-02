import { createPairingCodeTask } from "../../packages/ui/src/pairingCodeTask";

it("shows pending, then recoverable failure when no Pairing Target is available", async () => {
  let resolve!: (code: null) => void;
  const task = createPairingCodeTask();
  const pending = task.generate(
    () =>
      new Promise((done) => {
        resolve = done;
      })
  );
  expect(task.getState()).toMatchObject({ open: true, generation: "pending" });
  resolve(null);
  await pending;
  expect(task.getState()).toMatchObject({
    open: true,
    generation: "error",
    code: null,
  });
  await task.generate(async () => ({
    image: "data:image/png;base64,qr",
    text: "target",
  }));
  expect(task.getState()).toMatchObject({
    generation: "ready",
    code: { text: "target" },
  });
});

it("does not reopen a closed task or replace a newer target with a late result", async () => {
  let finish!: (code: { image: null; text: string }) => void;
  const task = createPairingCodeTask();
  const old = task.generate(
    () =>
      new Promise((done) => {
        finish = done;
      })
  );
  task.close();
  finish({ image: null, text: "old" });
  await old;
  expect(task.getState().open).toBe(false);
  const another = task.generate(
    () =>
      new Promise((done) => {
        finish = done;
      })
  );
  task.setContext("replacement-device");
  await task.generate(async () => ({ image: null, text: "new" }));
  finish({ image: null, text: "old" });
  await another;
  expect(task.getState()).toMatchObject({
    open: true,
    generation: "ready",
    code: { text: "new" },
  });
});

it("reports a failed payload write separately from generation and allows deliberate retry", async () => {
  const task = createPairingCodeTask();
  await task.generate(async () => ({
    image: null,
    text: "complete oversized target",
  }));
  let written = "";
  await task.copy(async () => ({ status: "rejected" }));
  expect(task.getState()).toMatchObject({
    generation: "ready",
    copy: "rejected",
  });
  await task.copy(async (text) => {
    written = text;
    return { status: "copied" };
  });
  expect(written).toBe("complete oversized target");
  expect(task.getState().copy).toBe("copied");
});

it("keeps a rejected generation recoverable across repeated attempts", async () => {
  const task = createPairingCodeTask();
  for (let attempt = 0; attempt < 2; attempt++) {
    await task.generate(async () => {
      throw new Error("signed record unavailable");
    });
    expect(task.getState()).toMatchObject({
      generation: "error",
      open: true,
      code: null,
    });
  }
  await task.generate(async () => ({ image: null, text: "target" }));
  expect(task.getState().generation).toBe("ready");
});

it("blocks duplicate Copy while pending and ignores acknowledgement after close", async () => {
  const task = createPairingCodeTask();
  await task.generate(async () => ({ image: null, text: "target" }));
  let finish!: (result: { status: "unconfirmed" }) => void;
  let clipboard = "";
  const pending = task.copy((text) => {
    clipboard = text;
    return new Promise((done) => {
      finish = done;
    });
  });
  await task.copy(async () => {
    clipboard = "duplicate";
    return { status: "copied" };
  });
  expect(clipboard).toBe("target");
  expect(task.getState().copy).toBe("pending");
  task.close();
  finish({ status: "unconfirmed" });
  await pending;
  expect(task.getState()).toMatchObject({ open: false, copy: "idle" });
});

it("reports missing Copy replies as uncertain without repeating the write", async () => {
  const task = createPairingCodeTask();
  await task.generate(async () => ({ image: null, text: "target" }));
  let writes = 0;
  await task.copy(async () => {
    writes++;
    throw new Error("IPC reply lost");
  });
  expect(task.getState()).toMatchObject({
    generation: "ready",
    copy: "unconfirmed",
  });
  expect(writes).toBe(1);
});

it("ends a missing acknowledgement as uncertain and ignores its later reply", async () => {
  jest.useFakeTimers();
  const task = createPairingCodeTask();
  await task.generate(async () => ({ image: null, text: "target" }));
  let finish!: (result: { status: "copied" }) => void;
  const pending = task.copy(
    () =>
      new Promise((done) => {
        finish = done;
      })
  );
  await jest.advanceTimersByTimeAsync(10_000);
  expect(task.getState().copy).toBe("unconfirmed");
  finish({ status: "copied" });
  await pending;
  expect(task.getState().copy).toBe("unconfirmed");
  jest.useRealTimers();
});
