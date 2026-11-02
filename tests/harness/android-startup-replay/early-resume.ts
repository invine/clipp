import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";
import { generateIdentityKeyMaterial } from "../../../packages/core/trust/identity";
import { createAndroidRuntime } from "../../../apps/android/src/client";
import { fixture, observations, prepareCase } from "./platform";

// A process-local document/event boundary; no browser, app, clipboard or native guest.
const documentPort = Object.assign(new EventTarget(), {
  visibilityState: "visible",
  hasFocus: () => true,
});
const windowPort = Object.assign(new EventTarget(), {
  location: {
    reload() {
      throw new Error("Unexpected runtime restart");
    },
  },
});
Object.defineProperty(globalThis, "document", {
  configurable: true,
  value: documentPort,
});
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: windowPort,
});
Object.defineProperty(globalThis, "indexedDB", {
  configurable: true,
  value: new IDBFactory(),
});

const key = await generateIdentityKeyMaterial();
const identity = {
  deviceId: key.peerId,
  privateKey: key.privateKey,
  publicKey: key.publicKey,
  deviceName: "Startup replay source fixture",
  multiaddrs: [],
  createdAt: Date.now() - 1000,
};
const action = {
  id: "00000000-0000-4000-8000-000000002001",
  text: "original prepared event before abrupt process stop",
  source: "send" as const,
  event: {
    clipId: "00000000-0000-4000-8000-000000002002",
    capturedAt: Date.now() - 1000,
    sharingLifetimeMs: 3_600_000,
  },
};
prepareCase(identity, action);
const owner = createAndroidRuntime();
const starting = owner.start();
try {
  // Semantic barrier: the actual coordinator finished an early nonacceptance.
  // Startup is still held at a public getPlatformInfo call. No sleep or timer
  // advance can accidentally rescue this case with a second resume event.
  await fixture.earlyAttemptQueued;
  assert.ok(
    observations.platformInfoHeld > 0,
    "Startup must still be held at the native platform port"
  );
  assert.deepEqual(
    fixture.pendingActions(),
    [action],
    "Early nonacceptance must preserve the native action"
  );
  fixture.releaseStartup();
  await starting;
  const state = await owner.publicState();
  assert.equal(
    state.historyUnavailable,
    false,
    "History must be genuinely readable"
  );
  assert.equal(state.identity?.deviceId, identity.deviceId);
  assert.deepEqual(
    state.clips,
    [
      {
        id: action.event.clipId,
        type: "text",
        content: action.text,
        originPeerId: identity.deviceId,
        capturedAt: action.event.capturedAt,
        shareExpiresAt: action.event.capturedAt + 3_600_000,
      },
    ],
    "Normal startup must replay the original prepared Local Clip without another Intent/resume"
  );
  assert.deepEqual(
    fixture.pendingActions(),
    [],
    "Acceptance must durably complete the native action"
  );
  assert.deepEqual(observations.completions, [action.id]);
  assert.deepEqual(
    observations.preparations,
    [],
    "Applied week policy must not reprepare the original hour event"
  );
  assert.ok(
    observations.networkAttempts > 0,
    "Network unavailability must remain outside local replay"
  );
  console.log(
    JSON.stringify({
      case: "early-retained-resume",
      status: "PASS",
      originalId: action.event.clipId,
      ...observations,
    })
  );
} finally {
  fixture.releaseStartup();
  await starting.catch(() => undefined);
  await owner.stop();
}
