import { subscribePairingCodeIdentity } from "../../apps/extension/src/pairingCodeIdentity";
import type { Identity } from "../../packages/ui/src/types";

it("loads the QR context through the actual background runtime-state message", () => {
  let context: Identity | null = null;
  const stop = subscribePairingCodeIdentity(
    {
      send: (message, reply) =>
        reply(
          message.type === "getRuntimeState"
            ? {
                state: {
                  identity: { deviceId: "current", deviceName: "Desk" },
                },
              }
            : undefined
        ),
      subscribe: () => () => undefined,
    },
    (identity) => {
      context = identity;
    }
  );
  expect(context).toEqual({ deviceId: "current", deviceName: "Desk" });
  stop();
});

it("retains the newer identity publication when the bootstrap read replies late", () => {
  let context: Identity | null = null;
  let finish!: (reply?: { state?: { identity?: Identity | null } }) => void;
  let publish!: (message: {
    type?: string;
    state?: { identity?: Identity | null };
  }) => void;
  const stop = subscribePairingCodeIdentity(
    {
      send: (_message, reply) => {
        finish = reply;
      },
      subscribe: (listener) => {
        publish = listener;
        return () => undefined;
      },
    },
    (identity) => {
      context = identity;
    }
  );
  publish({
    type: "runtimeState",
    state: { identity: { deviceId: "replacement", deviceName: "Phone" } },
  });
  finish({ state: { identity: { deviceId: "former", deviceName: "Desk" } } });
  expect(context).toEqual({ deviceId: "replacement", deviceName: "Phone" });
  stop();
});

it("cannot close a newer ready QR task with an old bootstrap identity", async () => {
  const { createPairingCodeTask } =
    await import("../../packages/ui/src/pairingCodeTask");
  const task = createPairingCodeTask();
  let finish!: (reply?: { state?: { identity?: Identity | null } }) => void;
  let publish!: (message: {
    type?: string;
    state?: { identity?: Identity | null };
  }) => void;
  const stop = subscribePairingCodeIdentity(
    {
      send: (_message, reply) => {
        finish = reply;
      },
      subscribe: (listener) => {
        publish = listener;
        return () => undefined;
      },
    },
    (identity) => task.setContext(identity?.deviceId ?? null)
  );
  publish({
    type: "runtimeState",
    state: { identity: { deviceId: "replacement", deviceName: "Phone" } },
  });
  await task.generate(async () => ({
    image: null,
    text: "replacement public target",
  }));
  finish({ state: { identity: { deviceId: "former", deviceName: "Desk" } } });
  expect(task.getState()).toMatchObject({
    open: true,
    generation: "ready",
    code: { text: "replacement public target" },
  });
  stop();
});
