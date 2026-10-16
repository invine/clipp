import { navigateManagement } from "../../apps/extension/src/ManagementNavigation";

type Runtime = Pick<typeof chrome.runtime, "sendMessage" | "lastError">;
it("a synchronous Chrome transport failure reports unconfirmed navigation acceptance", async () => {
  const runtime = {
    lastError: undefined,
    sendMessage() {
      throw new Error("Extension context invalidated.");
    },
  } as Runtime;
  await expect(
    navigateManagement(runtime as typeof chrome.runtime, "handoff", {
      kind: "history",
    })
  ).resolves.toMatchObject({
    ok: false,
    error: expect.stringContaining("could not be confirmed"),
  });
});
it("a missing callback is bounded and a late accepted reply cannot replace its unconfirmed result", async () => {
  jest.useFakeTimers();
  try {
    let reply!: (response: unknown) => void;
    const runtime = {
      lastError: undefined,
      sendMessage(_message: unknown, callback: typeof reply) {
        reply = callback;
      },
    } as Runtime;
    const result = navigateManagement(
      runtime as typeof chrome.runtime,
      "handoff",
      { kind: "requests" }
    );
    await jest.advanceTimersByTimeAsync(15000);
    await expect(result).resolves.toMatchObject({
      ok: false,
      error: expect.stringContaining("could not be confirmed"),
    });
    reply({ ok: true, status: "pending" });
    await expect(result).resolves.toMatchObject({ ok: false });
  } finally {
    jest.useRealTimers();
  }
});
