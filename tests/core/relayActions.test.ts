import { performRelayAction } from "../../packages/core/network/relayActions";
it("reports controlled auth cancellation and browser failure without claiming authentication completed", async () => {
  expect(
    await performRelayAction(
      "authenticated",
      async () => {
        throw new Error("relay_login_cancelled");
      },
      async () => {}
    )
  ).toEqual({ status: "rejected", error: "relay_login_cancelled" });
  expect(
    await performRelayAction(
      "portal-opened",
      async () => {
        throw new Error("browser_failed");
      },
      async () => {}
    )
  ).toEqual({ status: "rejected", error: "browser_failed" });
});
it("reports an actual portal open and a later failed refresh separately", async () => {
  expect(
    await performRelayAction(
      "portal-opened",
      async () => {},
      async () => {}
    )
  ).toEqual({ status: "portal-opened" });
  expect(
    await performRelayAction(
      "authenticated",
      async () => {},
      async () => {
        throw new Error("publication_failed");
      }
    )
  ).toMatchObject({ status: "unconfirmed" });
});
