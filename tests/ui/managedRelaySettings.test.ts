import { runManagedRelayAction } from "../../packages/ui/src/managedRelayAction";

describe("managed relay settings actions", () => {
  it("reports a rejected login without leaving an unhandled promise", async () => {
    const report = jest.fn();
    await expect(
      runManagedRelayAction(async () => {
        throw new Error("Browser login failed");
      }, report)
    ).resolves.toBeUndefined();
    expect(report).toHaveBeenCalledWith("Browser login failed");
  });

  it("reports a safe fallback for a rejected non-Error action", async () => {
    const report = jest.fn();
    await runManagedRelayAction(async () => Promise.reject("secret"), report);
    expect(report).toHaveBeenCalledWith("Could not complete relay action");
  });
});
