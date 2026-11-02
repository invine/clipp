import {
  submitExtensionPairing,
  decideExtensionPairing,
  dismissExtensionPairingOutcome,
} from "../../apps/extension/src/pairingActions";

it("awaits the Chrome callback and retains explicit false instead of claiming submission", async () => {
  let reply!: (response: unknown) => void;
  const runtime = {
    sendMessage: (_message: unknown, callback: typeof reply) => {
      reply = callback;
    },
    lastError: undefined,
  };
  let settled = false;
  const result = submitExtensionPairing(runtime, "target").then((value) => {
    settled = true;
    return value;
  });
  await Promise.resolve();
  expect(settled).toBe(false);
  reply({ ok: false, error: "policy_rejected" });
  expect(await result).toEqual({ ok: false, error: "policy_rejected" });
});

it("a missing approval reply is unconfirmed and carries no invented Admission", async () => {
  const runtime = {
    sendMessage: (_message: unknown, callback: (response: unknown) => void) =>
      callback(undefined),
    lastError: undefined,
  };
  expect(
    await decideExtensionPairing(
      runtime,
      {
        deviceId: "phone",
        deviceName: "Phone",
        requestVersion: "opaque-version",
      },
      true
    )
  ).toEqual({ ok: false, error: "outcome_unconfirmed", admitted: null });
});

it("an absent Chrome callback cannot leave submission pending forever", async () => {
  jest.useFakeTimers();
  try {
    const runtime = { sendMessage: () => undefined, lastError: undefined };
    const result = submitExtensionPairing(runtime, "target");
    await jest.advanceTimersByTimeAsync(15000);
    expect(await result).toEqual({ ok: false, error: "outcome_unconfirmed" });
  } finally {
    jest.useRealTimers();
  }
}, 1000);

it("terminal dismissal reaches the owning runtime with the observed authority and a missing reply is unconfirmed", async () => {
  const messages: unknown[] = [];
  const runtime = {
    sendMessage: (message: unknown, callback: (reply: unknown) => void) => {
      messages.push(message);
      callback({ dismissed: false });
    },
  };
  expect(
    await dismissExtensionPairingOutcome(runtime, "phone", {
      sessionId: "current",
      revision: 4,
    })
  ).toBe(false);
  expect(messages).toEqual([
    {
      type: "dismissPairingOutcome",
      targetPeerId: "phone",
      expected: { sessionId: "current", revision: 4 },
    },
  ]);
  await expect(
    dismissExtensionPairingOutcome(
      { sendMessage: (_message, callback) => callback(undefined) },
      "phone",
      { sessionId: "current", revision: 4 }
    )
  ).rejects.toThrow("outcome_unconfirmed");
});
