import {
  createRuntimeNotificationStatus,
  createRuntimeNotificationSelection,
  createClosableRuntimeNotifications,
} from "../../../packages/core/runtime/notifications";

describe("closable runtime notifications", () => {
  it("dismisses the active native notification by runtime notification ID", async () => {
    const close = jest.fn();
    const notifications = createClosableRuntimeNotifications({
      create: () => ({ close }),
    });

    await notifications.show({
      id: "pairing-request-peer-a",
      title: "Pairing request",
      body: "Peer A",
    });
    await notifications.dismiss("pairing-request-peer-a");

    expect(close).toHaveBeenCalledTimes(1);
  });
});

it("retains native selection before startup and coalesces a repeated callback", async () => {
  const selection = createRuntimeNotificationSelection();
  selection.emit("pairing-request-a", "envelope-a");
  selection.emit("pairing-request-a", "envelope-a");
  const selected = jest.fn();
  selection.onSelect(selected);
  await Promise.resolve();
  expect(selected).toHaveBeenCalledTimes(1);
  expect(selected).toHaveBeenCalledWith("pairing-request-a", "envelope-a");
});

it("keeps app blocking separate from channel blocking and refreshes only after deliberate permission recovery", async () => {
  let app: "blocked" | "available" = "blocked";
  let channel: "blocked" | "available" = "blocked";
  const settings = jest.fn(async () => {
    app = "available";
  });
  const status = createRuntimeNotificationStatus({
    inspect: async () => ({ app, channel }),
    openSettings: settings,
  });
  expect(await status.refresh()).toMatchObject({
    app: "blocked",
    channel: "blocked",
  });
  expect(settings).not.toHaveBeenCalled();
  await status.openSettings();
  expect(await status.refresh()).toMatchObject({
    app: "available",
    channel: "blocked",
  });
  channel = "available";
  expect(await status.refresh()).toMatchObject({
    app: "available",
    channel: "available",
  });
  status.failed("native_display_failed");
  expect(status.read().displayError).toBe("native_display_failed");
  status.shown();
  expect(status.read().displayError).toBeNull();
});

it("unsubscription and disposal retire undelivered native callbacks", async () => {
  const selection = createRuntimeNotificationSelection();
  const selected = jest.fn();
  const unsubscribe = selection.onSelect(selected);
  const pending = selection.emit("request", "old");
  unsubscribe();
  selection.clear();
  await pending;
  selection.onSelect(selected);
  expect(selected).not.toHaveBeenCalled();
  await selection.emit("request", "new");
  expect(selected).toHaveBeenCalledWith("request", "new");
});
