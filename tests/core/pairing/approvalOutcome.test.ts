import { createPendingTrustRequestCoordinator } from "../../../packages/core/pairing/pending";
import {
  encodePairingFrame,
  encodeTrustRequestEnvelope,
  encodeTrustRequestPayload,
} from "../../../packages/core/pairing/protocol";

const initiator = "12D3KooWJ7cZsGHAw84d9JLU6V3bqm1SGUvDg68RTNWJyPCduyfv";
const target = "12D3KooWFNjtBxwwk1dbR9eAcDX11U9TsiU3Xho3fuY3e25tQzdy";
function fixture() {
  const requests = new Map<string, any>();
  let active = false;
  let now = 1000;
  let cleanupFails = false;
  let admissionFails = false;
  let verificationGate: Promise<void> | undefined;
  let signalVerification: (() => void) | undefined;
  const coordinator = createPendingTrustRequestCoordinator({
    localPeerId: async () => target,
    store: {
      list: async () => [...requests.values()],
      save: async (request) => {
        requests.set(request.initiatorPeerId, request);
      },
      remove: async (id) => {
        if (cleanupFails) throw Error("cleanup");
        requests.delete(id);
      },
    },
    clock: {
      now: () => now,
      setTimeout: () => 1,
      clearTimeout: () => undefined,
    },
    verify: async () => {
      signalVerification?.();
      await verificationGate;
      return true;
    },
    notifications: {
      show: async () => undefined,
      dismiss: async () => undefined,
      onSelect: () => () => undefined,
    },
    lifecycle: { openApprovalView: () => undefined },
    membership: {
      membershipStatus: async () => (active ? "active" : "unknown"),
      admit: async () => {
        if (admissionFails) throw Error("storage");
        active = true;
        return "admitted";
      },
    },
    responseIdentity: async () => ({ deviceName: "Desktop", nameRevision: 0n }),
    sendResponse: async () => {
      throw Error("offline");
    },
  });
  const receive = (issuedAt: number) =>
    coordinator.receive(
      initiator,
      encodePairingFrame({
        kind: "request",
        envelope: encodeTrustRequestEnvelope({
          signedPayload: encodeTrustRequestPayload({
            initiatorPeerId: initiator,
            targetPeerId: target,
            issuedAtUnixMs: BigInt(issuedAt),
            deviceName: "Phone",
            nameRevision: 0n,
          }),
          signature: new Uint8Array([1]),
        }),
      })
    );
  return {
    coordinator,
    receive,
    blockVerification() {
      let release!: () => void;
      let started!: () => void;
      const entered = new Promise<void>((resolve) => {
        started = resolve;
      });
      signalVerification = started;
      verificationGate = new Promise<void>((resolve) => {
        release = resolve;
      });
      return {
        entered,
        release: () => {
          verificationGate = undefined;
          signalVerification = undefined;
          release();
        },
      };
    },
    active: () => active,
    advance: () => {
      now = 800000;
    },
    failCleanup: () => {
      cleanupFails = true;
    },
    failAdmission: () => {
      admissionFails = true;
    },
  };
}

it("keeps identical reviews valid but rejects review of a replaced envelope", async () => {
  const f = fixture();
  await f.receive(1000);
  const reviewed = (await f.coordinator.list())[0];
  expect(reviewed.requestVersion).toEqual(expect.any(String));
  await f.receive(1000);
  expect((await f.coordinator.list())[0].requestVersion).toBe(
    reviewed.requestVersion
  );
  await f.receive(1100);
  expect(
    await f.coordinator.decide(initiator, "accepted", reviewed.requestVersion)
  ).toEqual({ ok: false, error: "stale_request", admitted: false });
  expect(f.active()).toBe(false);
  expect(await f.coordinator.list()).toHaveLength(1);
});

it("reports durable Admission separately from failed cleanup and best-effort delivery", async () => {
  const f = fixture();
  await f.receive(1000);
  const request = (await f.coordinator.list())[0];
  f.failCleanup();
  expect(
    await f.coordinator.decide(initiator, "accepted", request.requestVersion)
  ).toEqual({ ok: false, error: "cleanup_failed", admitted: true });
  expect(f.active()).toBe(true);
  expect(await f.coordinator.list()).toHaveLength(1);
});

it("retains the review after Admission persistence fails", async () => {
  const f = fixture();
  await f.receive(1000);
  f.failAdmission();
  expect(
    await f.coordinator.decide(
      initiator,
      "accepted",
      (await f.coordinator.list())[0].requestVersion
    )
  ).toEqual({ ok: false, error: "decision_failed", admitted: false });
  expect(f.active()).toBe(false);
  expect(await f.coordinator.list()).toHaveLength(1);
});

it("does not admit an expired review", async () => {
  const f = fixture();
  await f.receive(1000);
  const request = (await f.coordinator.list())[0];
  f.advance();
  expect(
    await f.coordinator.decide(initiator, "accepted", request.requestVersion)
  ).toEqual({ ok: false, error: "stale_request", admitted: false });
  expect(f.active()).toBe(false);
});

it("a duplicate approval cannot replay Admission", async () => {
  const f = fixture();
  await f.receive(1000);
  const version = (await f.coordinator.list())[0].requestVersion;
  const results = await Promise.all([
    f.coordinator.decide(initiator, "accepted", version),
    f.coordinator.decide(initiator, "accepted", version),
  ]);
  expect(results).toEqual([
    { ok: true, admitted: true },
    { ok: false, error: "stale_request", admitted: false },
  ]);
});

it("reports rejected response handling when request cleanup fails", async () => {
  const f = fixture();
  await f.receive(1000);
  const version = (await f.coordinator.list())[0].requestVersion;
  f.failCleanup();
  expect(await f.coordinator.decide(initiator, "rejected", version)).toEqual({
    ok: false,
    error: "cleanup_failed",
    admitted: false,
  });
});

it("checks the review version after an earlier serialized replacement completes", async () => {
  const f = fixture();
  await f.receive(1000);
  const version = (await f.coordinator.list())[0].requestVersion;
  const gate = f.blockVerification();
  const replacement = f.receive(1100);
  await gate.entered;
  const approval = f.coordinator.decide(initiator, "accepted", version);
  gate.release();
  await replacement;
  expect(await approval).toEqual({
    ok: false,
    error: "stale_request",
    admitted: false,
  });
  expect(f.active()).toBe(false);
});
