import {
  readExtensionRecoveryState,
  probeExtensionInitialization,
  retryExtensionInitialization,
  readExtensionRuntimeAuthority,
  type ExtensionRecoveryState,
} from "../../apps/extension/src/runtimeRecovery";
import { createRuntimeUiRecovery } from "../../packages/core/runtime/uiRecovery";

function state(
  sessionId: string,
  revision: number,
  target: string
): ExtensionRecoveryState {
  return {
    pending: [],
    peers: [],
    identity: { deviceId: sessionId, deviceName: "Desktop" },
    devices: [{ deviceId: target, deviceName: target }],
    pairingState: {
      sessionId,
      revision,
      waiting: [],
      errors: [],
      outcomes: [],
    },
  };
}

it("the current Chrome callback handshake binds popup/options consumers before unseen late publications can replace Membership", async () => {
  const current = state("current-worker", 0, "currently-paired");
  const runtime = {
    sendMessage: (message: unknown, callback: (reply: unknown) => void) => {
      const type = (message as { type: string }).type;
      callback(
        type === "getRuntimeAuthority"
          ? { sessionId: "current-worker" }
          : { state: current }
      );
    },
  };
  const observed: ExtensionRecoveryState[] = [];
  const consumer = createRuntimeUiRecovery<ExtensionRecoveryState>({
    load: () => readExtensionRecoveryState(runtime),
    initializationError: async () => null,
    version: (snapshot) => snapshot.pairingState,
    authority: () => readExtensionRuntimeAuthority(runtime),
    onState: (snapshot) => observed.push(snapshot),
    onRecovery: () => {},
  });
  await consumer.load();
  await consumer.live(state("unseen-retired-worker", 99, "old-paired"));
  await consumer.live(state("current-worker", 1, "newly-paired"));
  expect(observed.map((snapshot) => snapshot.devices?.[0].deviceId)).toEqual([
    "currently-paired",
    "newly-paired",
  ]);
});

it("a malformed or unavailable Chrome authority reply is a failed handshake", async () => {
  for (const reply of [
    undefined,
    { sessionId: "" },
    { sessionId: 42 },
    { error: "runtime_authority_unauthorized" },
  ]) {
    await expect(
      readExtensionRuntimeAuthority({
        sendMessage: (_message, callback) => callback(reply),
      })
    ).rejects.toThrow();
  }
});

it("reads real callback failure and lost Retry acknowledgement as failure rather than ready", async () => {
  const runtime = {
    lastError: undefined,
    sendMessage: (_message: unknown, receive: (reply: unknown) => void) =>
      receive({ error: "identity_initialization_failed" }),
  };
  await expect(readExtensionRecoveryState(runtime)).rejects.toThrow(
    "identity_initialization_failed"
  );
  await expect(retryExtensionInitialization(runtime)).rejects.toThrow();
  runtime.sendMessage = (_message, receive) =>
    receive({ error: { code: "identity_initialization_failed" } });
  expect(await probeExtensionInitialization(runtime)).toEqual({
    code: "identity_initialization_failed",
  });
});
