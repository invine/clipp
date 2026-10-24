import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compileFunction } from "node:vm";
import { createNotificationPeerShutdown } from "../../harness/notificationPeerShutdown";

it("joins deadline shutdown from final cleanup while every owner stops once", async () => {
  const calls: string[] = [];
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const shutdown = createNotificationPeerShutdown([
    {
      stop: () => {
        calls.push("actor");
        return held;
      },
    },
    {
      stop: () => {
        calls.push("transport");
      },
    },
  ]);
  const deadline = shutdown.stop("deadline");
  const finalCleanup = shutdown.stop("finally");
  expect(finalCleanup).toBe(deadline);
  await Promise.resolve();
  expect(calls).toEqual(["actor", "transport"]);
  let completed = false;
  void finalCleanup.then(() => {
    completed = true;
  });
  await Promise.resolve();
  expect(completed).toBe(false);
  release();
  expect(await finalCleanup).toEqual([
    { status: "fulfilled", value: undefined },
    { status: "fulfilled", value: undefined },
  ]);
});

it("starts all final-cleanup owners in reverse order without waiting on the first", async () => {
  const calls: string[] = [];
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const shutdown = createNotificationPeerShutdown([
    {
      stop: () => {
        calls.push("actor");
      },
    },
    {
      stop: () => {
        calls.push("transport");
      },
    },
    {
      stop: () => {
        calls.push("pending");
        return held;
      },
    },
  ]);
  const completed = shutdown.stop("finally");
  await Promise.resolve();
  expect(calls).toEqual(["pending", "transport", "actor"]);
  expect(shutdown.stop("deadline")).toBe(completed);
  release();
  expect(
    (await completed).every((result) => result.status === "fulfilled")
  ).toBe(true);
});

it("retains synchronous and asynchronous cleanup failures while every owner settles", async () => {
  const synchronous = new Error("synthetic synchronous stop");
  const asynchronous = new Error("synthetic asynchronous stop");
  const calls: number[] = [];
  const shutdown = createNotificationPeerShutdown([
    {
      stop: () => {
        calls.push(1);
        throw synchronous;
      },
    },
    {
      stop: () => {
        calls.push(2);
        return Promise.reject(asynchronous);
      },
    },
    {
      stop: () => {
        calls.push(3);
      },
    },
  ]);
  const completed = shutdown.stop("deadline");
  expect(await completed).toEqual([
    { status: "rejected", reason: synchronous },
    { status: "rejected", reason: asynchronous },
    { status: "fulfilled", value: undefined },
  ]);
  expect(calls).toEqual([1, 2, 3]);
  expect(shutdown.stop("finally")).toBe(completed);
});

// Exercise the actual harness acquisition boundaries without importing its real peers.
const source = readFileSync(
  "tests/harness/notification-peer-protocol-source.mjs",
  "utf8"
);
const actorStart = source.indexOf("  if (expired) {");
const actorEnd = source.indexOf("  await assert.rejects(", actorStart);
const acquireActor = compileFunction(
  "return (async () => {" + source.slice(actorStart, actorEnd) + "})();",
  ["actor", "expired", "owned"]
);

it("retires an actor returned after expiry before it can join the stopped owner list", async () => {
  expect(actorStart).toBeGreaterThan(0);
  expect(actorEnd).toBeGreaterThan(actorStart);
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const stop = jest.fn(() => held);
  const owned: unknown[] = [];
  const acquired = acquireActor({ stop }, true, owned);
  const failure = expect(acquired).rejects.toThrow(
    "actual_protocol_progress_required"
  );
  expect(stop).toHaveBeenCalledTimes(1);
  expect(owned).toEqual([]);
  release();
  await failure;
  expect(owned).toEqual([]);
});

it("registers the still-current actor without retiring it", async () => {
  const actor = { stop: jest.fn() };
  const owned: unknown[] = [];
  await acquireActor(actor, false, owned);
  expect(owned).toEqual([actor]);
  expect(actor.stop).not.toHaveBeenCalled();
});

it("refuses expiry during key acquisition before constructing any remaining owner", () => {
  const start = source.indexOf(
    "  assert.equal(expired, false);\n  const transport ="
  );
  const end = source.indexOf("  const sessions =", start);
  expect(start).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(start);
  const acquireTransport = compileFunction(source.slice(start, end), [
    "expired",
    "assert",
    "createLibp2pMessagingTransport",
    "owned",
    "key",
  ]);
  const construct = jest.fn(() => ({ stop() {} }));
  const owned: unknown[] = [];
  expect(() => acquireTransport(true, assert, construct, owned, {})).toThrow();
  expect(construct).not.toHaveBeenCalled();
  expect(owned).toEqual([]);
  acquireTransport(false, assert, construct, owned, {});
  expect(construct).toHaveBeenCalledTimes(1);
  expect(owned).toEqual([construct.mock.results[0].value]);
});

it("caches the first actual stop origin and owner count without changing joined cleanup", async () => {
  const start = source.indexOf('let firstStopOrigin = "none";');
  const end = source.indexOf("let expired =", start);
  expect(start).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(start);
  const wireStop = compileFunction(
    source.slice(start, end) +
      ";return { stop, cached: () => ({ firstStopOrigin, stoppedOwnerCount }) };",
    ["owned", "shutdown"]
  );
  const owner = { stop: jest.fn() };
  const owned = [owner];
  const shutdown = createNotificationPeerShutdown(owned);
  const wrapper = wireStop(owned, shutdown);
  const first = wrapper.stop("deadline");
  expect(wrapper.stop("finally")).toBe(first);
  expect(await first).toEqual([{ status: "fulfilled", value: undefined }]);
  expect(wrapper.cached()).toEqual({
    firstStopOrigin: "deadline",
    stoppedOwnerCount: 1,
  });
  expect(owner.stop).toHaveBeenCalledTimes(1);
});

it("emits only bounded cached failure facts and no extra success row", () => {
  const start = source.indexOf("  if (process.exitCode) {");
  expect(start).toBeGreaterThan(0);
  const emit = compileFunction(source.slice(start, source.lastIndexOf("}")), [
    "process",
    "console",
    "phase",
    "expired",
    "firstStopOrigin",
    "stoppedOwnerCount",
    "outcomes",
  ]);
  const rows: string[] = [];
  const consolePort = { error: (line: string) => rows.push(line) };
  const outcomes = [
    { status: "fulfilled", value: undefined },
    { status: "rejected", reason: new Error("PRIVATE_SENTINEL") },
  ];
  emit(
    { exitCode: 0 },
    consolePort,
    "success_receipt",
    false,
    "finally",
    2,
    outcomes
  );
  expect(rows).toEqual([]);
  emit(
    { exitCode: 1 },
    consolePort,
    "verify_counterpart_pending",
    true,
    "deadline",
    2,
    outcomes
  );
  expect(rows).toHaveLength(1);
  expect(Buffer.byteLength(rows[0])).toBeLessThan(512);
  expect(rows[0]).not.toContain("PRIVATE_SENTINEL");
  expect(JSON.parse(rows[0].slice("SOURCE_FAILURE ".length))).toEqual({
    phase: "verify_counterpart_pending",
    outerExpired: true,
    firstStopOrigin: "deadline",
    stoppedOwnerCount: 2,
    fulfilled: 1,
    rejected: 1,
  });
});
