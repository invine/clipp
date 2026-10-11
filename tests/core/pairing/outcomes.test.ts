import { createPairingRuntimeSessions } from "../../../packages/core/pairing/runtimeCoordinator";
import {
  decodePairingFrame,
  encodePairingFrame,
} from "../../../packages/core/pairing/protocol";
const local = "12D3KooWJ7cZsGHAw84d9JLU6V3bqm1SGUvDg68RTNWJyPCduyfv";
const target = "12D3KooWFNjtBxwwk1dbR9eAcDX11U9TsiU3Xho3fuY3e25tQzdy";
function setup(onChanged?: () => void) {
  let now = 1000,
    active = false,
    failAdmission = false,
    valid = true;
  const sent: Uint8Array[] = [],
    timers = new Map<number, () => void>();
  let timer = 0;
  const runtime = createPairingRuntimeSessions({
    onChanged,
    identity: async () => ({
      peerId: local,
      deviceName: "Desktop",
      nameRevision: 0,
    }),
    send: async (_peer, frame) => {
      sent.push(frame);
    },
    sign: async () => new Uint8Array([1]),
    verify: async () => valid,
    membership: {
      membershipStatus: async () => (active ? "active" : "unknown"),
      admit: async () => {
        if (failAdmission) throw Error("storage");
        active = true;
        return "admitted";
      },
    },
    clock: {
      now: () => now,
      setTimeout: (fn) => {
        timers.set(++timer, fn);
        return timer;
      },
      clearTimeout: (id) => {
        timers.delete(id as number);
      },
    },
    validityWindowMs: 10,
    clockSkewAllowanceMs: 0,
  });
  runtime.start();
  const response = (decision: "accepted" | "rejected") => {
    const request = decodePairingFrame(sent[0]);
    if (!request || request.kind !== "request") throw Error("request");
    return encodePairingFrame({
      kind: "response",
      response: {
        decision,
        requestEnvelope: request.envelope,
        responderDeviceName: "Mobile",
        responderNameRevision: 0n,
      },
    });
  };
  return {
    runtime,
    response,
    timers,
    active: () => active,
    expire: () => {
      now = 1011;
      [...timers.values()][0]();
    },
    fail: () => {
      failAdmission = true;
    },
    reconcile: () => {
      active = true;
    },
    invalid: () => {
      valid = false;
    },
  };
}
it("projects validated rejection then later acceptance even after terminal dismissal", async () => {
  const f = setup();
  await f.runtime.request(target);
  await f.runtime.receive(target, f.response("rejected"), async () => false);
  expect(f.runtime.outcomes()).toEqual([
    {
      targetPeerId: target,
      response: "rejected",
      waitingEnded: false,
      recovering: false,
    },
  ]);
  expect(f.runtime.dismissOutcome(target)).toBe(true);
  expect(f.runtime.outcomes()).toEqual([]);
  await f.runtime.receive(target, f.response("accepted"), async () => false);
  expect(f.active()).toBe(true);
  expect(f.runtime.outcomes()).toEqual([
    {
      targetPeerId: target,
      response: "accepted",
      waitingEnded: false,
      recovering: false,
    },
  ]);
});
it("reports waiting ended without observing a response and ignores expired acceptance", async () => {
  const f = setup();
  await f.runtime.request(target);
  f.expire();
  await new Promise((resolve) => setImmediate(resolve));
  expect(f.runtime.waiting()).toEqual([]);
  expect(f.runtime.outcomes()).toEqual([
    {
      targetPeerId: target,
      response: null,
      waitingEnded: true,
      recovering: false,
    },
  ]);
  expect(
    await f.runtime.receive(target, f.response("accepted"), async () => false)
  ).toBeNull();
  expect(f.active()).toBe(false);
  expect(f.runtime.outcomes()[0].response).toBeNull();
});
it("keeps accepted Admission recovery visible until authoritative Membership becomes active", async () => {
  const f = setup();
  await f.runtime.request(target);
  f.fail();
  expect(
    await f.runtime.receive(target, f.response("accepted"), async () => false)
  ).toBe("retrying");
  expect(f.runtime.outcomes()).toEqual([
    {
      targetPeerId: target,
      response: "accepted",
      waitingEnded: false,
      recovering: true,
    },
  ]);
  expect(f.runtime.dismissOutcome(target)).toBe(false);
  f.reconcile();
  [...f.timers.values()][0]();
  await new Promise((resolve) => setImmediate(resolve));
  expect(f.runtime.errors()).toEqual([]);
  expect(f.runtime.outcomes()[0].recovering).toBe(false);
  expect(f.runtime.dismissOutcome(target)).toBe(true);
});
it("never projects invalid signatures as a response", async () => {
  const f = setup();
  await f.runtime.request(target);
  f.invalid();
  expect(
    await f.runtime.receive(target, f.response("accepted"), async () => false)
  ).toBeNull();
  expect(f.runtime.outcomes()).toEqual([]);
  expect(f.runtime.waiting()).toHaveLength(1);
});
it("drops all outcome information at runtime stop and accepts a valid late response in the new session", async () => {
  const f = setup();
  await f.runtime.request(target);
  await f.runtime.receive(target, f.response("rejected"), async () => false);
  await f.runtime.stop();
  expect(f.runtime.outcomes()).toEqual([]);
  f.runtime.start();
  await f.runtime.receive(target, f.response("accepted"), async () => false);
  expect(f.runtime.outcomes()[0].response).toBe("accepted");
});
it("bounds terminal information without evicting active recovery or waiting", async () => {
  const { createPairingRuntimeCoordinator } =
    await import("../../../packages/core/pairing/runtimeCoordinator");
  const coordinator = createPairingRuntimeCoordinator({});
  const owner = {
    stop: async () => {},
    retrying: () => false,
  } as unknown as Parameters<typeof coordinator.replace>[1];
  await coordinator.replace("recovering", owner);
  coordinator.outcomeChanged(owner, {
    targetPeerId: "recovering",
    kind: "recovery",
    active: true,
  });
  await coordinator.replace("waiting", owner);
  coordinator.waitingChanged("waiting", owner, [
    { targetPeerId: "waiting", expiresAtUnixMs: 999n },
  ]);
  coordinator.outcomeChanged(owner, {
    targetPeerId: "waiting",
    kind: "response",
    decision: "accepted",
  });
  for (let i = 0; i < 70; i++) {
    const id = `terminal-${i}`;
    await coordinator.replace(id, owner);
    coordinator.outcomeChanged(owner, {
      targetPeerId: id,
      kind: "response",
      decision: "rejected",
    });
    await coordinator.remove(id, owner);
  }
  expect(coordinator.outcomes()).toHaveLength(66);
  expect(
    coordinator.outcomes().map((outcome) => outcome.targetPeerId)
  ).toContain("recovering");
  expect(coordinator.dismissOutcome("waiting")).toBe(false);
  expect(
    coordinator.outcomes().map((outcome) => outcome.targetPeerId)
  ).not.toContain("terminal-0");
});
it("a dismissal from the old identity or an earlier revision cannot hide a newer outcome", async () => {
  const f = setup();
  await f.runtime.request(target);
  await f.runtime.receive(target, f.response("rejected"), async () => false);
  const before = f.runtime.snapshot();
  await f.runtime.receive(target, f.response("accepted"), async () => false);
  expect(f.runtime.dismissOutcome(target, before)).toBe(false);
  await f.runtime.stop();
  f.runtime.start();
  await f.runtime.receive(target, f.response("accepted"), async () => false);
  expect(f.runtime.dismissOutcome(target, before)).toBe(false);
  expect(f.runtime.outcomes()[0].response).toBe("accepted");
});
it("an acceptance received during the request send remains visible after send settles", async () => {
  let runtime!: ReturnType<typeof createPairingRuntimeSessions>;
  runtime = createPairingRuntimeSessions({
    identity: async () => ({
      peerId: local,
      deviceName: "Desktop",
      nameRevision: 0,
    }),
    send: async (_peer, frame) => {
      const request = decodePairingFrame(frame);
      if (!request || request.kind !== "request") throw Error("request");
      await runtime.receive(
        target,
        encodePairingFrame({
          kind: "response",
          response: {
            decision: "accepted",
            requestEnvelope: request.envelope,
            responderDeviceName: "Mobile",
            responderNameRevision: 0n,
          },
        }),
        async () => false
      );
    },
    sign: async () => new Uint8Array([1]),
    verify: async () => true,
    membership: {
      membershipStatus: async () => "unknown",
      admit: async () => "admitted",
    },
    clock: { now: () => 1000, setTimeout: () => 1, clearTimeout: () => {} },
  });
  runtime.start();
  await runtime.request(target);
  expect(runtime.outcomes()[0]?.response).toBe("accepted");
});
it("a send failure after the local deadline stays an immediate failure without a false waiting outcome", async () => {
  let expire!: () => void, fail!: (error: Error) => void;
  const runtime = createPairingRuntimeSessions({
    identity: async () => ({
      peerId: local,
      deviceName: "Desktop",
      nameRevision: 0,
    }),
    send: () =>
      new Promise((_, reject) => {
        fail = reject;
      }),
    sign: async () => new Uint8Array([1]),
    verify: async () => true,
    membership: {
      membershipStatus: async () => "unknown",
      admit: async () => "admitted",
    },
    clock: {
      now: () => 1000,
      setTimeout: (fn) => {
        expire = fn;
        return 1;
      },
      clearTimeout: () => {},
    },
  });
  runtime.start();
  const requesting = runtime.request(target);
  await new Promise((resolve) => setImmediate(resolve));
  expire();
  await new Promise((resolve) => setImmediate(resolve));
  fail(Error("send failed"));
  await expect(requesting).rejects.toThrow("send failed");
  expect(runtime.outcomes()).toEqual([]);
});
it("a new request reuses the current Admission recovery owner", async () => {
  const f = setup();
  await f.runtime.request(target);
  f.fail();
  await f.runtime.receive(target, f.response("accepted"), async () => false);
  await f.runtime.request(target);
  expect(f.runtime.errors()).toEqual([
    { targetPeerId: target, code: "membership_persistence_failed" },
  ]);
  expect(f.runtime.outcomes()[0]).toMatchObject({
    response: "accepted",
    recovering: true,
  });
  expect(f.runtime.dismissOutcome(target)).toBe(false);
});

it("real response invalidations discard delayed runtime reads before the document sees Pairing status", async () => {
  const { createOrderedStatePublisher } =
    await import("../../../packages/core/runtime/orderedPublication");
  const { createRuntimeUiRecovery } =
    await import("../../../packages/core/runtime/uiRecovery");
  let release!: () => void;
  const pause = new Promise<void>((resolve) => {
    release = resolve;
  });
  let first = true;
  let publisher!: ReturnType<
    typeof createOrderedStatePublisher<
      ReturnType<ReturnType<typeof createPairingRuntimeSessions>["snapshot"]>
    >
  >;
  const f = setup(() => {
    void publisher.request();
  });
  const observed: Array<ReturnType<typeof f.runtime.snapshot>> = [];
  const consumer = createRuntimeUiRecovery({
    load: async () => f.runtime.snapshot(),
    initializationError: async () => null,
    version: (state) => state,
    authority: async () => f.runtime.snapshot().sessionId,
    onState: (state) => {
      observed.push(state);
    },
    onRecovery: () => {},
  });
  publisher = createOrderedStatePublisher({
    read: async () => {
      const snapshot = f.runtime.snapshot();
      if (first) {
        first = false;
        await pause;
      }
      return snapshot;
    },
    publish: (state) => consumer.live(state),
  });
  await f.runtime.request(target);
  await f.runtime.receive(target, f.response("accepted"), async () => false);
  release();
  await publisher.request();
  expect(observed).toHaveLength(1);
  expect(observed[0].outcomes).toEqual([
    {
      targetPeerId: target,
      response: "accepted",
      waitingEnded: false,
      recovering: false,
    },
  ]);
  expect(f.active()).toBe(true);
});
