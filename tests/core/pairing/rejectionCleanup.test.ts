import { createPairingRejectionCleanup } from "../../../packages/core/pairing/rejectionCleanup";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => (resolve = yes));
  return { promise, resolve };
}

describe("Pairing rejection cleanup", () => {
  it("disconnects only an authenticated non-Active Member on the current transport", async () => {
    const disconnect = jest.fn(async () => undefined);
    let current = true;
    const cleanup = createPairingRejectionCleanup({
      membership: {
        membershipStatus: async (peerId) =>
          peerId === "unknown-peer" ? "unknown" : "revoked",
      },
      isCurrentTransport: (_peerId, owner) => current && owner === "current",
      disconnect,
    });

    await cleanup(undefined, undefined);
    await cleanup("active-peer", "current");
    current = false;
    await cleanup("retired-peer", "current");
    current = true;
    await cleanup("unknown-peer", "current");

    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalledWith("active-peer", "current");
  });

  it("rechecks ownership after membership resolves and contains read and disconnect failures", async () => {
    const status = deferred<"active" | "revoked" | "unknown">();
    const disconnect = jest.fn(async () => {
      throw new Error("transport closed");
    });
    let current = true;
    const cleanup = createPairingRejectionCleanup({
      membership: { membershipStatus: () => status.promise },
      isCurrentTransport: (_peerId, owner) => current && owner === "current",
      disconnect,
    });

    const task = cleanup("peer", "current");
    current = false;
    status.resolve("revoked");
    await expect(task).resolves.toBeUndefined();
    expect(disconnect).not.toHaveBeenCalled();

    const failedRead = createPairingRejectionCleanup({
      membership: {
        membershipStatus: async () => {
          throw new Error("unavailable");
        },
      },
      isCurrentTransport: (_peerId, owner) => owner === "current",
      disconnect,
    });
    await expect(failedRead("peer", "current")).resolves.toBeUndefined();
    expect(disconnect).not.toHaveBeenCalled();

    const containedFailure = createPairingRejectionCleanup({
      membership: { membershipStatus: async () => "revoked" },
      isCurrentTransport: (_peerId, owner) => owner === "current",
      disconnect,
    });
    await expect(containedFailure("peer", "current")).resolves.toBeUndefined();
  });

  it("coalesces overlapping cleanup for the same peer and runs independently of diagnostic throttling", async () => {
    const status = deferred<"active" | "revoked" | "unknown">();
    const disconnect = jest.fn(async () => undefined);
    const cleanup = createPairingRejectionCleanup({
      membership: { membershipStatus: () => status.promise },
      isCurrentTransport: (_peerId, owner) => owner === "current",
      disconnect,
    });

    const first = cleanup("peer", "current");
    const second = cleanup("peer", "current");
    status.resolve("revoked");
    await Promise.all([first, second]);
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it("does not let a rejection owned by a retired transport disconnect its replacement", async () => {
    const oldTransport = {};
    const currentTransport = {
      disconnect: jest.fn(async (_peerId: string) => undefined),
    };
    const membership = deferred<"active" | "revoked" | "unknown">();
    let lookups = 0;
    let currentOwner: object = oldTransport;
    const cleanup = createPairingRejectionCleanup({
      membership: {
        membershipStatus: async () => {
          lookups += 1;
          return lookups === 1 ? membership.promise : "revoked";
        },
      },
      isCurrentTransport: (_peerId, owner) => owner === currentOwner,
      disconnect: (peerId, owner) => {
        if (owner === currentOwner)
          return (owner as typeof currentTransport).disconnect(peerId);
      },
    });

    const retiredRequest = cleanup("peer", oldTransport);
    currentOwner = currentTransport;
    membership.resolve("revoked");
    await retiredRequest;
    expect(currentTransport.disconnect).not.toHaveBeenCalled();

    await cleanup("peer", currentTransport);
    expect(currentTransport.disconnect).toHaveBeenCalledWith("peer");
  });

  it("coalesces the same peer only within the owning transport", async () => {
    const transportA = {};
    const transportB = {};
    const statusA = deferred<"active" | "revoked" | "unknown">();
    const statusB = deferred<"active" | "revoked" | "unknown">();
    const membershipStatus = jest
      .fn()
      .mockReturnValueOnce(statusA.promise)
      .mockReturnValueOnce(statusB.promise);
    const disconnect = jest.fn(async () => undefined);
    const cleanup = createPairingRejectionCleanup({
      membership: { membershipStatus },
      isCurrentTransport: (_peerId, owner) =>
        owner === transportA || owner === transportB,
      disconnect,
    });

    const firstA = cleanup("peer", transportA);
    const secondA = cleanup("peer", transportA);
    const firstB = cleanup("peer", transportB);
    expect(membershipStatus).toHaveBeenCalledTimes(2);
    statusA.resolve("revoked");
    statusB.resolve("revoked");
    await Promise.all([firstA, secondA, firstB]);
    expect(disconnect).toHaveBeenCalledTimes(2);
  });
});
