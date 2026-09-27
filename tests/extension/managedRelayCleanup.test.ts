import { stopManagedOffscreenResources } from "../../apps/extension/src/managedRelayCleanup";

it("stops transport and reconnects even when controller cleanup fails", async () => {
  const events: string[] = [];
  await expect(
    stopManagedOffscreenResources({
      controller: async () => {
        events.push("controller");
        throw new Error("controller_failed");
      },
      reconnects: async () => {
        events.push("reconnects");
      },
      transport: async () => {
        events.push("transport");
      },
    })
  ).rejects.toThrow("controller_failed");
  expect(events).toEqual(["controller", "reconnects", "transport"]);
});
