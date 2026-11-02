import assert from "node:assert/strict";

const originalPromise = Promise;
const nativeDescriptor = Object.getOwnPropertyDescriptor(
  Promise,
  "withResolvers"
);
const mode = process.argv[2];
const bootstrap = process.argv[3];
if (mode !== "native") delete Promise.withResolvers;

// Import the real shared bootstrap before exercising its real dependency graph.
const entry =
  bootstrap === "relay"
    ? await import("../../packages/core/network/relay/server.ts")
    : await import("../../packages/core/network/node.ts");
assert.equal(Promise, originalPromise);
assert.equal(typeof Promise.withResolvers, "function");
if (mode === "native") {
  assert.deepEqual(
    Object.getOwnPropertyDescriptor(Promise, "withResolvers"),
    nativeDescriptor
  );
}

if (bootstrap !== "relay") {
  const node = await entry.createClipboardNode({
    relayAddresses: [],
    enableWebRTCDirect: false,
    enableDCUtR: false,
  });
  try {
    await node.peerStore.merge(node.peerId, {
      metadata: new Map([["compatibility", Uint8Array.of(42)]]),
    });
    const peer = await node.peerStore.get(node.peerId);
    assert.deepEqual(peer.metadata.get("compatibility"), Uint8Array.of(42));
  } finally {
    await node.stop();
  }
}

const { default: mortice } = await import("mortice");
const mutex = mortice({ name: "promise-compatibility", singleProcess: true });
const releaseRead = await mutex.readLock();
releaseRead();
const releaseWrite = await mutex.writeLock();
if (mode === "errors") {
  const controller = new AbortController();
  const aborted = assert.rejects(
    mutex.readLock({ signal: controller.signal }),
    { name: "AbortError" }
  );
  controller.abort();
  await aborted;
}
releaseWrite();
const releaseNext = await mutex.writeLock();
releaseNext();
mutex.finalize();

if (mode === "errors") {
  const { Queue } = await import("it-queue");
  const queue = new Queue();
  const failure = new Error("job failed");
  await assert.rejects(
    queue.add(async () => {
      throw failure;
    }),
    (error) => error === failure
  );
  assert.equal(await queue.add(async () => "recovered"), "recovered");
}

if (mode === "semantics") {
  class Subclass extends Promise {}
  const capability = Subclass.withResolvers();
  assert.ok(capability.promise instanceof Subclass);
  capability.resolve(Promise.resolve("settled"));
  capability.resolve("ignored");
  capability.reject(new Error("ignored"));
  assert.equal(await capability.promise, "settled");
  const failure = new Error("rejected");
  const rejected = Promise.withResolvers();
  rejected.reject(failure);
  await assert.rejects(rejected.promise, (error) => error === failure);
  assert.throws(() => Promise.withResolvers.call({}), TypeError);
  assert.throws(
    () => Promise.withResolvers.call(function Invalid() {}),
    TypeError
  );
  assert.throws(
    () =>
      Promise.withResolvers.call(function Invalid(executor) {
        executor(
          () => {},
          () => {}
        );
        executor(
          () => {},
          () => {}
        );
      }),
    TypeError
  );
  const descriptor = Object.getOwnPropertyDescriptor(Promise, "withResolvers");
  assert.equal(descriptor.enumerable, false);
  assert.equal(descriptor.configurable, true);
  assert.equal(descriptor.writable, true);
}
