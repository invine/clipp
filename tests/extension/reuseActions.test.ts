import { reuseExtensionClip } from "../../apps/extension/src/reuseActions";
it("normalizes a lost callback after completed Copy effects to unconfirmed without sending another Copy", async () => {
  let effects = 0,
    calls = 0;
  const runtime = {
    lastError: undefined as { message: string } | undefined,
    sendMessage(_message: unknown, callback: (value: unknown) => void) {
      calls++;
      effects++;
      this.lastError = { message: "lost reply" };
      callback(undefined);
      this.lastError = undefined;
    },
  };
  expect(await reuseExtensionClip(runtime, "clip")).toBe("unconfirmed");
  expect(effects).toBe(1);
  expect(calls).toBe(1);
});
it("keeps acknowledged complete/partial outcomes and treats missing or malformed/negative replies as unconfirmed", async () => {
  for (const [reply, expected] of [
    [{ ok: true, outcome: "complete" }, "complete"],
    [{ ok: true, outcome: "copied-without-clip" }, "copied-without-clip"],
    [undefined, "unconfirmed"],
    [{ ok: true }, "unconfirmed"],
    [{ ok: true, outcome: "invented" }, "unconfirmed"],
    [{ ok: false, error: "offscreen reply lost" }, "unconfirmed"],
  ] as const) {
    expect(
      await reuseExtensionClip(
        { sendMessage: (_message, callback) => callback(reply) },
        "clip"
      )
    ).toBe(expected);
  }
});
it("an absent callback settles unconfirmed without an automatic resend and ignores late completion", async () => {
  jest.useFakeTimers();
  try {
    let reply!: (value: unknown) => void;
    const sendMessage = jest.fn((_message: unknown, callback: typeof reply) => {
      reply = callback;
    });
    const result = reuseExtensionClip({ sendMessage }, "clip");
    await jest.advanceTimersByTimeAsync(15000);
    expect(await result).toBe("unconfirmed");
    reply({ ok: true, outcome: "complete" });
    expect(await result).toBe("unconfirmed");
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  } finally {
    jest.useRealTimers();
  }
});
