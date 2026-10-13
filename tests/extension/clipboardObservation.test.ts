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
