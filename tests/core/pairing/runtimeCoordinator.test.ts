import { createPairingRuntimeCoordinator, createPairingRuntimeSessions } from "../../../packages/core/pairing/runtimeCoordinator";
import type { PairingSessionHandle } from "../../../packages/core/pairing/runtimeCoordinator";
import { decodePairingFrame, encodePairingFrame } from "../../../packages/core/pairing/protocol";

function session(stop = jest.fn(async () => undefined), retrying = false): PairingSessionHandle {
  return { stop, retrying: () => retrying } as unknown as PairingSessionHandle;
}

describe("Pairing runtime coordinator", () => {
  it("replaces sessions and reduces waiting and error state by target", async () => {
    const changed = jest.fn();
    const coordinator = createPairingRuntimeCoordinator({ onChanged: changed });
    const firstStop = jest.fn(async () => undefined);
    const first = session(firstStop);
    const second = session();

    await coordinator.replace("peer", first);
    coordinator.waitingChanged("peer", first, [{ targetPeerId: "peer", expiresAtUnixMs: 12n }]);
    coordinator.sessionErrorsChanged("peer", [{ targetPeerId: "peer", code: "membership_persistence_failed" }]);
    expect(coordinator.waiting()).toEqual([{ targetPeerId: "peer", expiresAtUnixMs: 12 }]);
    expect(coordinator.errors()).toEqual([{ targetPeerId: "peer", code: "membership_persistence_failed" }]);

    await coordinator.replace("peer", second);
    expect(firstStop).toHaveBeenCalledTimes(1);
    expect(coordinator.errors()).toEqual([]);
    await coordinator.remove("peer", second);
    expect(coordinator.waiting()).toEqual([]);
    expect(changed).toHaveBeenCalled();
  });

  it("reuses the fallback retry loop instead of installing a second session", async () => {
    const coordinator = createPairingRuntimeCoordinator({});
    const fallback = session(jest.fn(async () => undefined), true);
    const candidateStop = jest.fn(async () => undefined);
    const candidate = session(candidateStop);

    expect(await coordinator.replace("peer", candidate, fallback)).toBe(fallback);
    expect(coordinator.getOrAttachFallbackSession("peer", fallback)).toBe(fallback);
    expect(candidateStop).toHaveBeenCalledTimes(1);
  });

  it("creates fresh sessions after shutdown before processing a late response or user retry", async () => {
    const localPeerId = "12D3KooWJ7cZsGHAw84d9JLU6V3bqm1SGUvDg68RTNWJyPCduyfv";
    const targetPeerId = "12D3KooWFNjtBxwwk1dbR9eAcDX11U9TsiU3Xho3fuY3e25tQzdy";
    const sent: Uint8Array[] = [];
    const timers = new Map<number, () => void>();
    let timerId = 0;
    const sessions = createPairingRuntimeSessions({
      identity: async () => ({ peerId: localPeerId, deviceName: "Desktop", nameRevision: 0 }),
      send: async (_targetPeerId, frame) => { sent.push(frame); },
      sign: async () => new Uint8Array([1]),
      verify: async () => true,
      membership: {
        membershipStatus: async () => "unknown",
        admit: async () => { throw new Error("storage_failed"); },
      },
      clock: {
        now: () => 1_000,
        setTimeout: (handler) => { timerId += 1; timers.set(timerId, handler); return timerId; },
        clearTimeout: (id) => { timers.delete(id as number); },
      },
    });

    sessions.start();
    await sessions.request(targetPeerId);
    const request = decodePairingFrame(sent[0]);
    if (!request || request.kind !== "request") throw new Error("missing_request");
    const response = encodePairingFrame({
      kind: "response",
      response: {
        decision: "accepted",
        requestEnvelope: request.envelope,
        responderDeviceName: "Mobile",
        responderNameRevision: 1n,
      },
    });
    await sessions.stop();

    await expect(sessions.receive(targetPeerId, response, async () => false)).rejects.toThrow("pairing_runtime_stopped");
    await expect(sessions.request(targetPeerId)).rejects.toThrow("pairing_runtime_stopped");

    sessions.start();
    await sessions.receive(targetPeerId, response, async () => false);
    expect(sessions.errors()).toEqual([{ targetPeerId, code: "membership_persistence_failed" }]);
    await expect(sessions.request(targetPeerId)).resolves.toEqual(expect.any(Uint8Array));
    expect(sent).toHaveLength(2);
    await sessions.stop();
  });

  it("ignores an in-flight response error that settles after shutdown", async () => {
    const localPeerId = "12D3KooWJ7cZsGHAw84d9JLU6V3bqm1SGUvDg68RTNWJyPCduyfv";
    const targetPeerId = "12D3KooWFNjtBxwwk1dbR9eAcDX11U9TsiU3Xho3fuY3e25tQzdy";
    const sent: Uint8Array[] = [];
    let rejectAdmission!: (error: Error) => void;
    let signalAdmissionStarted!: () => void;
    const admissionStarted = new Promise<void>((resolve) => { signalAdmissionStarted = resolve; });
    const admission = new Promise<never>((_resolve, reject) => { rejectAdmission = reject; });
    const sessions = createPairingRuntimeSessions({
      identity: async () => ({ peerId: localPeerId, deviceName: "Desktop", nameRevision: 0 }),
      send: async (_targetPeerId, frame) => { sent.push(frame); },
      sign: async () => new Uint8Array([1]),
      verify: async () => true,
      membership: {
        membershipStatus: async () => "unknown",
        admit: async () => {
          signalAdmissionStarted();
          return admission;
        },
      },
      clock: { now: () => 1_000, setTimeout: () => 1, clearTimeout: () => undefined },
    });
    sessions.start();
    await sessions.request(targetPeerId);
    const request = decodePairingFrame(sent[0]);
    if (!request || request.kind !== "request") throw new Error("missing_request");
    const response = encodePairingFrame({
      kind: "response",
      response: { decision: "accepted", requestEnvelope: request.envelope, responderDeviceName: "Mobile", responderNameRevision: 1n },
    });

    const receiving = sessions.receive(targetPeerId, response, async () => false);
    await admissionStarted;
    await sessions.stop();
    rejectAdmission(new Error("storage_failed"));
    await receiving;

    expect(sessions.errors()).toEqual([]);
  });
});
