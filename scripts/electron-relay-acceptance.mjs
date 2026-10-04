/** Actual Electron acceptance runner. See docs/electron-relay-acceptance.md. */
import assert from "node:assert/strict";
import { mkdir, open, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { _electron } from "playwright";

const { values } = parseArgs({
  options: {
    profile: { type: "string" },
    transport: { type: "string" },
    discovery: { type: "string" },
    "app-name": { type: "string", default: "Clipp Relay Test" },
    output: { type: "string" },
    "expect-clip": { type: "string" },
    "timeout-seconds": { type: "string", default: "600" },
  },
});
for (const field of ["profile", "output"]) {
  assert(
    values[field] && path.isAbsolute(values[field]),
    `absolute_${field}_required`
  );
}
assert(
  ["tcp", "wss", "webrtc-direct"].includes(values.transport),
  "supported_transport_required"
);
assert(values["expect-clip"], "nonprivate_clip_marker_required");
const expectedDiscovery = new URL(values.discovery);
assert(
  expectedDiscovery.protocol === "https:" &&
    !expectedDiscovery.username &&
    !expectedDiscovery.password &&
    !expectedDiscovery.search &&
    !expectedDiscovery.hash &&
    expectedDiscovery.pathname === "/v1/relay",
  "canonical_discovery_required"
);
const timeout = Number(values["timeout-seconds"]) * 1_000;
assert(
  Number.isSafeInteger(timeout) && timeout >= 1_000 && timeout <= 600_000,
  "bounded_timeout_required"
);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
await mkdir(values.output, { recursive: true, mode: 0o700 });
await mkdir(values.profile, { recursive: true, mode: 0o700 });
const profileLock = await open(
  path.join(values.profile, ".clipp-relay-acceptance.lock"),
  "wx",
  0o600
);
const runner = path.join(values.output, "launch.cjs");
// The application still uses its normal main-process runtime, trust, history,
// auth and libp2p code. Only the native clipboard boundary is replaced, keeping
// the operator's system clipboard out of the test.
await writeFile(
  runner,
  `const { app, clipboard } = require('electron');\napp.setName(${JSON.stringify(values["app-name"])});\nlet memoryClipboard = '';\nclipboard.readText = () => memoryClipboard;\nclipboard.writeText = (text) => { memoryClipboard = text; };\nrequire(${JSON.stringify(path.join(root, "apps/electron/dist/main.cjs"))});\n`,
  { mode: 0o600 }
);
const log = await open(path.join(values.output, "runtime.log"), "a", 0o600);
const receipt = {
  startedAt: new Date().toISOString(),
  runtime: "actual-electron",
  enforcedTransport: values.transport,
  clipboard: "isolated-memory-native-boundary",
  result: "not-run",
  loginFlow: "not-observed-by-runner",
};
let electron;
try {
  electron = await _electron.launch({
    args: [runner],
    cwd: root,
    env: {
      ...process.env,
      CLIPP_LOG_LEVEL: "error",
      CLIPP_RELAY_ACCEPTANCE_TRANSPORT: values.transport,
      CLIPP_RELAY_ACCEPTANCE_PROFILE: values.profile,
    },
    timeout: 30_000,
  });
  electron.process().stdout?.on("data", (chunk) => {
    void log.write(chunk);
  });
  electron.process().stderr?.on("data", (chunk) => {
    void log.write(chunk);
  });
  const page = await electron.firstWindow();
  receipt.platform = await electron.evaluate(({ safeStorage }) => ({
    os: process.platform,
    osVersion: process.getSystemVersion(),
    architecture: process.arch,
    electron: process.versions.electron,
    node: process.versions.node,
    osEncryptionAvailable: safeStorage.isEncryptionAvailable(),
    storageProvider:
      typeof safeStorage.getSelectedStorageBackend === "function"
        ? safeStorage.getSelectedStorageBackend()
        : "not-exposed",
  }));
  await page.waitForFunction(
    () => typeof window.clipp?.getState === "function"
  );
  const initial = await page.evaluate(() => window.clipp.getState());
  const baseline = new Set(initial.clips.map((clip) => clip.id));
  const originalIdentity = initial.identity.deviceId;
  console.log(
    "Electron acceptance ready. Sign in through the visible UI if required, then send the specified marker from a paired peer."
  );
  const deadline = Date.now() + timeout;
  let previousStatuses;
  while (Date.now() < deadline) {
    const state = await page.evaluate(() => window.clipp.getState());
    assert.equal(state.identity.deviceId, originalIdentity, "identity_changed");
    const states = state.managedRelayStates;
    const statuses = JSON.stringify(states.map((relay) => relay.status));
    if (statuses !== previousStatuses) {
      console.log(`Managed relay states: ${statuses}`);
      previousStatuses = statuses;
      receipt.lastRelayStatuses = states.map((relay) => relay.status);
    }
    const relayPeers = new Set(
      states.map((relay) => relay.peerId).filter(Boolean)
    );
    // The current public bridge includes managed server connections in its
    // peer summaries. Server connections are expected to be direct; only
    // device connections must all be circuits.
    assert(
      !state.peerConnections.some(
        (connection) =>
          !relayPeers.has(connection.peerId) && connection.hasDirect
      ),
      "direct_peer_connection_detected"
    );
    const received = state.clips.find(
      (clip) =>
        !baseline.has(clip.id) &&
        clip.content === values["expect-clip"] &&
        clip.originPeerId !== originalIdentity
    );
    const applied = await electron.evaluate(
      ({ clipboard }, marker) => clipboard.readText() === marker,
      values["expect-clip"]
    );
    if (received && applied) {
      const expectedKeys = new Set(
        state.managedRelayConfigurations
          .filter(
            (config) =>
              config.kind === "managed" &&
              config.discoveryUrl === expectedDiscovery.href
          )
          .map((config) => config.key)
      );
      const ready = states.filter(
        (relay) =>
          relay.kind === "managed" &&
          relay.status === "ready" &&
          expectedKeys.has(relay.key)
      );
      assert(ready.length > 0, "managed_relay_not_ready");
      const source = state.peerConnections.find(
        (connection) => connection.peerId === received.originPeerId
      );
      assert(
        source?.hasRelay && !source.hasDirect,
        "source_circuit_path_not_observed"
      );
      const carryingRelay = ready.find((relay) =>
        source.addrs.some((address) =>
          address.includes(`/p2p/${relay.peerId}/p2p-circuit/`)
        )
      );
      assert(carryingRelay, "managed_circuit_path_not_observed");
      const server = state.peerConnections.find(
        (connection) => connection.peerId === carryingRelay.peerId
      );
      assert(
        server?.addrs.some((address) => {
          if (values.transport === "wss")
            return /\/(?:wss|tls\/ws)\//.test(address);
          if (values.transport === "webrtc-direct")
            return address.includes("/webrtc-direct/");
          return /\/tcp\/\d+\/p2p\//.test(address);
        }),
        "selected_relay_server_transport_not_observed"
      );
      receipt.result = "passed";
      receipt.newRemoteClipReceived = true;
      receipt.liveClipboardApplied = true;
      receipt.circuitConnectionObserved = true;
      receipt.selectedRelayServerTransportObserved = true;
      receipt.authenticatedReservationAndRendezvousReady = true;
      receipt.directPeerConnections = 0;
      receipt.deviceIdentityPreserved = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  assert.equal(receipt.result, "passed", "relay_clip_receipt_timeout");
  console.log(
    "Clip checks passed; waiting for the owned Electron process to close."
  );
} catch (error) {
  receipt.result = "failed";
  const safeReasons = [
    "identity_changed",
    "direct_peer_connection_detected",
    "managed_relay_not_ready",
    "source_circuit_path_not_observed",
    "managed_circuit_path_not_observed",
    "selected_relay_server_transport_not_observed",
    "relay_clip_receipt_timeout",
  ];
  receipt.reason =
    safeReasons.find(
      (reason) =>
        typeof error?.message === "string" && error.message.startsWith(reason)
    ) ?? "runtime_or_receipt_gate_failed";
  const safeClasses = [
    "Error",
    "AssertionError",
    "TypeError",
    "ReferenceError",
    "TimeoutError",
  ];
  receipt.errorClass = safeClasses.includes(error?.name)
    ? error.name
    : "UnknownError";
  // Exception detail is diagnostic evidence, never part of the public receipt.
  // It can contain native/runtime context; preserve it only in private artifacts.
  const failure = await open(
    path.join(values.output, "failure.private.json"),
    "w",
    0o600
  );
  try {
    await failure.chmod(0o600);
    await failure.writeFile(
      JSON.stringify(
        error instanceof Error
          ? {
              name: error.name,
              message: error.message,
              stack: error.stack,
            }
          : { name: "NonErrorThrown" },
        null,
        2
      ) + "\n"
    );
  } finally {
    await failure.close();
  }
  console.error(
    "Electron acceptance failed; inspect the private runtime log and receipt."
  );
  process.exitCode = 1;
} finally {
  if (electron) {
    const child = electron.process();
    const exited = new Promise((resolve) => {
      if (child.exitCode !== null || child.signalCode !== null) {
        resolve(child.exitCode === 0 && child.signalCode === null);
      } else {
        child.once("exit", (code, signal) =>
          resolve(code === 0 && signal === null)
        );
      }
    });
    let timer;
    const close = electron.close().then(
      () => exited,
      () => exited
    );
    const closed = await Promise.race([
      close,
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(false), 10_000);
      }),
    ]);
    clearTimeout(timer);
    const running = child.exitCode === null && child.signalCode === null;
    receipt.shutdown = closed
      ? "graceful"
      : running
        ? "forced-owned-process"
        : "failed-owned-process";
    if (!closed) {
      if (receipt.result === "passed") {
        receipt.reason = running
          ? "owned_test_shutdown_timeout"
          : "owned_test_shutdown_failed";
      }
      receipt.result = "failed";
      // Kill only the ChildProcess returned by this launch; never target a name,
      // process group or another app that happens to share the profile label.
      if (running) child.kill("SIGKILL");
      await Promise.race([
        exited,
        new Promise((resolve) => {
          timer = setTimeout(resolve, 2_000);
        }),
      ]);
      clearTimeout(timer);
      process.exitCode = 1;
    }
  } else {
    receipt.shutdown = "not-launched";
  }
  receipt.finishedAt = new Date().toISOString();
  await writeFile(
    path.join(values.output, "receipt.json"),
    JSON.stringify(receipt, null, 2) + "\n",
    { mode: 0o600 }
  );
  await log.close();
  await profileLock.close();
  await unlink(path.join(values.profile, ".clipp-relay-acceptance.lock"));
}

if (receipt.result === "passed") {
  console.log("Passed: selected relay transfer and owned Electron shutdown.");
}
