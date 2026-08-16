import {
  startIdentityBoundRuntimeServices,
} from "../../../packages/core/runtime";

describe("runtime identity initialization", () => {
  it("starts neither local nor network services when Device Identity initialization fails", async () => {
    const startLocalServices = jest.fn();
    const startNetworkServices = jest.fn();

    await expect(startIdentityBoundRuntimeServices({
      initializeIdentity: async () => { throw new Error("identity_initialization_failed"); },
      startLocalServices,
      startNetworkServices,
    })).rejects.toThrow("identity_initialization_failed");

    expect(startLocalServices).not.toHaveBeenCalled();
    expect(startNetworkServices).not.toHaveBeenCalled();
  });

  it("keeps local services active when networking fails after Device Identity initialization", async () => {
    const calls: string[] = [];
    const networkFailure = new Error("network_unavailable");

    await expect(startIdentityBoundRuntimeServices({
      initializeIdentity: async () => { calls.push("identity"); },
      startLocalServices: () => { calls.push("local"); },
      startNetworkServices: async () => {
        calls.push("network");
        throw networkFailure;
      },
      onNetworkingFailure: (error) => { calls.push(`network-failed:${(error as Error).message}`); },
    })).resolves.toBeUndefined();

    expect(calls).toEqual([
      "identity",
      "local",
      "network",
      "network-failed:network_unavailable",
    ]);
  });
});
