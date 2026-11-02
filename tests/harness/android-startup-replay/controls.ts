import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";
import { generateIdentityKeyMaterial } from "../../../packages/core/trust/identity";
import { createAndroidRuntime } from "../../../apps/android/src/client";
import { fixture, observations, prepareCase } from "./platform";

const mode = process.argv[2];
assert.ok(["late", "empty", "repeated", "fenced"].includes(mode));
// The Activity is not resumed when startup completes. Later callback delivery
// uses only the same public plugin boundary as the cold-start regression.
Object.defineProperty(globalThis, "document", {
  configurable: true,
  value: Object.assign(new EventTarget(), {
    visibilityState: "hidden",
    hasFocus: () => false,
  }),
});
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: Object.assign(new EventTarget(), {
    location: {
      reload() {
        throw new Error("Unexpected restart");
      },
    },
  }),
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
  deviceName: "Startup replay controls",
  multiaddrs: [],
  createdAt: Date.now() - 1000,
};
const action = {
  id: "00000000-0000-4000-8000-000000002001",
  text: "one original prepared event",
  source: "send" as const,
  event: {
    clipId: "00000000-0000-4000-8000-000000002002",
    capturedAt: Date.now() - 1000,
    sharingLifetimeMs: 3_600_000,
  },
};
prepareCase(
  identity,
  mode === "late" || mode === "repeated" ? action : undefined,
  false
);
const owner = createAndroidRuntime();
try {
  await owner.start();
  if (mode === "fenced") {
    // A committed native action exists before the host closes admission.
    fixture.enqueue(action);
    await owner.stop();
    fixture.explicitText();
    fixture.activity(true);
    assert.throws(() => owner.start(), /identity_runtime_suspended/);
    const state = await owner.publicState();
    assert.equal(state.identity, null);
    assert.deepEqual(state.clips, []);
    assert.deepEqual(fixture.pendingActions(), [action]);
    assert.deepEqual(observations.completions, []);
  } else {
    if (mode !== "empty") {
      const cycles = mode === "repeated" ? 3 : 1;
      for (let index = 0; index < cycles; index++) {
        fixture.activity(false);
        const nextRead = observations.queueReads + 1;
        fixture.activity(true);
        await fixture.queueRead(nextRead);
      }
    }
    const state = await owner.publicState();
    assert.equal(state.historyUnavailable, false);
    assert.equal(state.identity?.deviceId, identity.deviceId);
    assert.deepEqual(
      state.clips,
      mode === "empty"
        ? []
        : [
            {
              id: action.event.clipId,
              type: "text",
              content: action.text,
              originPeerId: identity.deviceId,
              capturedAt: action.event.capturedAt,
              shareExpiresAt: action.event.capturedAt + 3_600_000,
            },
          ]
    );
    assert.deepEqual(fixture.pendingActions(), []);
    assert.deepEqual(
      observations.completions,
      mode === "empty" ? [] : [action.id]
    );
    assert.deepEqual(observations.preparations, []);
    assert.equal(state.clipboardHistoryError, null);
  }
  console.log(JSON.stringify({ case: mode, status: "PASS", ...observations }));
} finally {
  await owner.stop();
}
