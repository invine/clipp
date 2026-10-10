import { createClipCaptureCoordinator } from "../../../packages/core/clipboard/captureCoordinator";

it("retains pending capture after failed durable Clear and discards it only after successful Retry", async () => {
  const coordinator = createClipCaptureCoordinator({
    history: {
      accept: async () => {
        throw new Error("storage unavailable");
      },
    },
    originPeerId: async () =>
      "12D3KooWJ5oQ9G9kDMwrrzmVWwZnJryHJns8ovH8LYgDgJYJYyXy",
    now: () => 1_000,
    makeId: () => "00000000-0000-4000-8000-000000000303",
  });
  await coordinator.capture("queued");
  const pending = coordinator.pending();

  await expect(
    coordinator.clearHistory(async () => {
      throw new Error("durable clear failed");
    })
  ).rejects.toThrow("durable clear failed");
  expect(coordinator.pending()).toEqual(pending);

  await coordinator.clearHistory(async () => undefined);
  expect(coordinator.pending()).toEqual([]);
});
