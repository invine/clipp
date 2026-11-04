import { createIdentityBoundWorkFence } from "../../packages/core/runtime/identityInitialization";
import { createChromeIdentityResetLifecycle } from "../../apps/extension/src/identityResetRuntime";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((yes) => (resolve = yes));
  return { promise, resolve };
}

it("waits for an in-flight offscreen start and closes it before reset cleanup", async () => {
  const events: string[] = [];
  const startup = deferred();
  const lifecycle = createChromeIdentityResetLifecycle({
    workFence: createIdentityBoundWorkFence(),
    retireOffscreenOwnership: () => events.push("offscreen-retired"),
    stopRuntime: async () => {
      events.push("runtime-stopped");
    },
    waitForOffscreenStartup: () => startup.promise,
    finalizeOffscreen: async () => {
      events.push("offscreen-closed");
    },
    clearHostState: async () => {
      events.push("host-state-cleared");
    },
  });

  await lifecycle.acquireFence();
  const quiescing = lifecycle.quiesce();
  await Promise.resolve();
  await Promise.resolve();
  expect(events).toEqual(["offscreen-retired", "runtime-stopped"]);

  startup.resolve();
  await quiescing;

  expect(events).toEqual([
    "offscreen-retired",
    "runtime-stopped",
    "runtime-stopped",
    "offscreen-closed",
    "host-state-cleared",
  ]);
});

it("continues through final offscreen retirement after the first shutdown fails", async () => {
  const events: string[] = [];
  let stopAttempts = 0;
  const lifecycle = createChromeIdentityResetLifecycle({
    workFence: createIdentityBoundWorkFence(),
    retireOffscreenOwnership: () => undefined,
    stopRuntime: async () => {
      stopAttempts += 1;
      events.push(`runtime-stop-${stopAttempts}`);
      if (stopAttempts === 1) throw new Error("shutdown_ack_lost");
    },
    waitForOffscreenStartup: async () => {},
    finalizeOffscreen: async () => {
      events.push("offscreen-closed");
    },
    clearHostState: async () => {
      events.push("host-state-cleared");
    },
  });

  await lifecycle.acquireFence();
  await expect(lifecycle.quiesce()).resolves.toBeUndefined();

  expect(events).toEqual([
    "runtime-stop-1",
    "runtime-stop-2",
    "offscreen-closed",
    "host-state-cleared",
  ]);
});
