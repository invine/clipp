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
      isCurrentTransport: () => current,
      disconnect,
    });

    await cleanup(undefined);
    await cleanup("active-peer");
    current = false;
    await cleanup("retired-peer");
    current = true;
    await cleanup("unknown-peer");

    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalledWith("active-peer");
  });

  it("rechecks ownership after membership resolves and contains read and disconnect failures", async () => {
    const status = deferred<"active" | "revoked" | "unknown">();
    const disconnect = jest.fn(async () => {
      throw new Error("transport closed");
    });
    let current = true;
    const cleanup = createPairingRejectionCleanup({
      membership: { membershipStatus: () => status.promise },
      isCurrentTransport: () => current,
      disconnect,
    });

    const task = cleanup("peer");
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
      isCurrentTransport: () => true,
      disconnect,
    });
    await expect(failedRead("peer")).resolves.toBeUndefined();
    expect(disconnect).not.toHaveBeenCalled();

    const containedFailure = createPairingRejectionCleanup({
      membership: { membershipStatus: async () => "revoked" },
      isCurrentTransport: () => true,
      disconnect,
    });
    await expect(containedFailure("peer")).resolves.toBeUndefined();
  });

  it("coalesces overlapping cleanup for the same peer and runs independently of diagnostic throttling", async () => {
    const status = deferred<"active" | "revoked" | "unknown">();
    const disconnect = jest.fn(async () => undefined);
    const cleanup = createPairingRejectionCleanup({
      membership: { membershipStatus: () => status.promise },
      isCurrentTransport: () => true,
      disconnect,
    });

    const first = cleanup("peer");
    const second = cleanup("peer");
    status.resolve("revoked");
    await Promise.all([first, second]);
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
