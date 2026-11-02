import assert from "node:assert/strict";

const mode = process.argv[2];
const originalSignal = AbortSignal;
const originalController = AbortController;
const nativeMethod = Object.getOwnPropertyDescriptor(
  AbortSignal.prototype,
  "throwIfAborted"
);
if (mode !== "native") delete AbortSignal.prototype.throwIfAborted;
if (mode === "legacy-reason") delete AbortSignal.prototype.reason;
// This environment boundary selects the real browser-document no-listener policy.
// The node builder, libp2p queues, crypto, peer store and signing remain real.
globalThis.window = {};
globalThis.document = {};
const { createLibp2pMessagingTransport } =
  await import("../../packages/core/network/engine.ts");
const { generateKeyPair } = await import("@libp2p/crypto/keys");
const { peerIdFromPrivateKey } = await import("@libp2p/peer-id");
const { verifiedSignedPeerRecordMultiaddrs } =
  await import("../../packages/core/network/peerRecords.ts");
const privateKey = await generateKeyPair("Ed25519");
const peerId = peerIdFromPrivateKey(privateKey);
const transport = createLibp2pMessagingTransport({
  peerId,
  privateKey,
  relayAddresses: [],
  enableWebRTCDirect: true,
  enableDCUtR: true,
  enableRelayReservations: false,
  allowInsecureBrowserDials: true,
});
try {
  await transport.start();
  const record = await transport.getSignedPeerRecord();
  assert.ok(record.byteLength > 0);
  assert.deepEqual(
    await verifiedSignedPeerRecordMultiaddrs(record, peerId.toString()),
    []
  );
  assert.equal(AbortSignal, originalSignal);
  assert.equal(AbortController, originalController);
  if (mode === "native")
    assert.deepEqual(
      Object.getOwnPropertyDescriptor(AbortSignal.prototype, "throwIfAborted"),
      nativeMethod
    );
} finally {
  await transport.stop();
}

// Exercise cancellation through public real queue and lock APIs, then recover.
const { Queue } = await import("@libp2p/utils");
const queue = new Queue({ concurrency: 1 });
let release;
const held = queue.add(
  () =>
    new Promise((resolve) => {
      release = resolve;
    })
);
const controller = new AbortController();
const cancelled = new Error("cancel queued job");
let entered = false;
const aborted = assert.rejects(
  queue.add(
    async () => {
      entered = true;
    },
    { signal: controller.signal }
  ),
  mode === "legacy-reason"
    ? { name: "AbortError" }
    : (error) => error === cancelled
);
controller.abort(cancelled);
await aborted;
release("released");
assert.equal(await held, "released");
assert.equal(entered, false);
const failure = new Error("queue task failure");
await assert.rejects(
  queue.add(async () => {
    throw failure;
  }),
  (error) => error === failure
);
assert.equal(await queue.add(async () => "recovered"), "recovered");

const { default: mortice } = await import("mortice");
const mutex = mortice({
  name: "abort-signal-compatibility",
  singleProcess: true,
});
const releaseWrite = await mutex.writeLock();
const lockController = new AbortController();
const lockAborted = assert.rejects(
  mutex.readLock({ signal: lockController.signal }),
  { name: "AbortError" }
);
lockController.abort();
await lockAborted;
releaseWrite();
const releaseRead = await mutex.readLock();
releaseRead();
const releaseNext = await mutex.writeLock();
releaseNext();
mutex.finalize();

// Retain standard reason identity where supported; old signals without reason
// must still throw DOMException AbortError rather than running cancelled work.
assert.equal(new AbortController().signal.throwIfAborted(), undefined);
const defaultController = new AbortController();
defaultController.abort();
assert.throws(
  () => defaultController.signal.throwIfAborted(),
  (error) => error instanceof DOMException && error.name === "AbortError"
);
if (mode !== "legacy-reason") {
  for (const reason of [new Error("cancel"), null, "cancel", 0]) {
    const custom = new AbortController();
    custom.abort(reason);
    // Own properties cannot change the native signal's aborted state/reason.
    Object.defineProperty(custom.signal, "aborted", { value: false });
    Object.defineProperty(custom.signal, "reason", { value: "shadowed" });
    let thrown = false;
    try {
      custom.signal.throwIfAborted();
    } catch (error) {
      thrown = true;
      assert.equal(error, reason);
    }
    assert.equal(thrown, true);
  }
}
assert.throws(
  () => AbortSignal.prototype.throwIfAborted.call({ aborted: false }),
  TypeError
);
const descriptor = Object.getOwnPropertyDescriptor(
  AbortSignal.prototype,
  "throwIfAborted"
);
assert.equal(descriptor.enumerable, false);
assert.equal(descriptor.configurable, true);
assert.equal(descriptor.writable, true);
