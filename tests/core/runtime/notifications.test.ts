import { createClosableRuntimeNotifications } from "../../../packages/core/runtime/notifications";

describe("closable runtime notifications", () => {
  it("dismisses the active native notification by runtime notification ID", async () => {
    const close = jest.fn();
    const notifications = createClosableRuntimeNotifications({
      create: () => ({ close }),
    });

    await notifications.show({ id: "pairing-request-peer-a", title: "Pairing request", body: "Peer A" });
    await notifications.dismiss("pairing-request-peer-a");

    expect(close).toHaveBeenCalledTimes(1);
  });
});
