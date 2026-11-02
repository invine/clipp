import { observeExtensionClipboard } from "../../apps/extension/src/clipboardObservation";

it("acknowledges readiness rejection rather than losing the background reply", async () => {
  const unavailable = Promise.reject(Error("history_unavailable"));
  const result = await observeExtensionClipboard(
    "text",
    {
      processLocalText: async () => null,
    },
    unavailable
  );
  expect(result).toEqual({ ok: false, error: "history_unavailable" });
});

it("reports processing rejection and invalid observations as confirmed background failures", async () => {
  expect(
    await observeExtensionClipboard(
      "text",
      {
        processLocalText: async () => {
          throw Error("capture_unavailable");
        },
      },
      Promise.resolve()
    )
  ).toEqual({ ok: false, error: "capture_unavailable" });
  expect(
    await observeExtensionClipboard(
      null,
      {
        processLocalText: async () => null,
      },
      Promise.resolve()
    )
  ).toEqual({ ok: false, error: "invalid_clipboard_observation" });
});

it("a completed reset's Chrome owner baselines former clipboard content while explicit Share now creates a new event", async () => {
  const { createExtensionClipboardService } =
    await import("../../apps/extension/src/clipboardFactory");
  const { MemoryHistoryStore } =
    await import("../../packages/core/history/store");
  const history = new MemoryHistoryStore();
  const clipboard = createExtensionClipboardService({
    history,
    baselineFirstObservation: () => true,
    getSenderId: () => "12D3KooWJ5oQ9G9kDMwrrzmVWwZnJryHJns8ovH8LYgDgJYJYyXy",
    appliedSharingLifetime: () => 86_400_000,
  });
  clipboard.start();
  try {
    expect(
      await observeExtensionClipboard(
        "former clipboard",
        clipboard,
        Promise.resolve()
      )
    ).toEqual({ ok: true });
    expect(await history.query()).toEqual([]);
    await clipboard.processLocalText("former clipboard", { shareNow: true });
    expect(await history.query()).toHaveLength(1);
  } finally {
    await clipboard.stop();
  }
});
