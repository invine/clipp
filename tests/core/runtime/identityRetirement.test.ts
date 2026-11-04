import { retireIdentityRuntime } from "../../../packages/core/runtime/identityRetirement";

describe("shared identity runtime retirement", () => {
  it("confirms retirement when the initial stop fails but final stop succeeds", async () => {
    const events: string[] = [];
    const stop = jest
      .fn<Promise<void>, []>()
      .mockRejectedValueOnce(new Error("initial_stop_unconfirmed"));
    const drain = jest.fn(async () => {
      events.push("drained");
    });
    const finalStop = jest.fn(async () => {
      events.push("final_stop_confirmed");
    });

    await expect(
      retireIdentityRuntime({ stop, drain, finalStop })
    ).resolves.toBeUndefined();

    expect(stop).toHaveBeenCalledTimes(1);
    expect(drain).toHaveBeenCalledTimes(1);
    expect(finalStop).toHaveBeenCalledTimes(1);
    expect(events).toEqual(["drained", "final_stop_confirmed"]);
  });

  it("attempts final stop after drain fails but leaves retirement unconfirmed", async () => {
    const stop = jest.fn(async () => undefined);
    const finalStop = jest.fn(async () => undefined);
    const drain = jest.fn(async () => {
      throw new Error("owner_drain_unconfirmed");
    });

    await expect(
      retireIdentityRuntime({ stop, drain, finalStop })
    ).rejects.toThrow("owner_drain_unconfirmed");

    expect(stop).toHaveBeenCalledTimes(1);
    expect(drain).toHaveBeenCalledTimes(1);
    expect(finalStop).toHaveBeenCalledTimes(1);
  });

  it("keeps retirement unconfirmed when the final stop fails", async () => {
    const stop = jest.fn(async () => undefined);
    const drain = jest.fn(async () => undefined);
    const finalStop = jest
      .fn<Promise<void>, []>()
      .mockRejectedValue(new Error("final_stop_unconfirmed"));

    await expect(
      retireIdentityRuntime({ stop, drain, finalStop })
    ).rejects.toThrow("final_stop_unconfirmed");
  });
});
