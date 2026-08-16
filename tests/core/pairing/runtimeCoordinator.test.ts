import { createPairingRuntimeCoordinator } from "../../../packages/core/pairing/runtimeCoordinator";
import type { PairingSessionHandle } from "../../../packages/core/pairing/runtimeCoordinator";

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
});
