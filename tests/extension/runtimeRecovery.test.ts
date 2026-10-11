import {
  readExtensionRecoveryState,
  probeExtensionInitialization,
  retryExtensionInitialization,
} from "../../apps/extension/src/runtimeRecovery";
it("reads real callback failure and lost Retry acknowledgement as failure rather than ready", async () => {
  const runtime = {
    lastError: undefined,
    sendMessage: (_message: unknown, receive: (reply: unknown) => void) =>
      receive({ error: "identity_initialization_failed" }),
  };
  await expect(readExtensionRecoveryState(runtime)).rejects.toThrow(
    "identity_initialization_failed"
  );
  await expect(retryExtensionInitialization(runtime)).rejects.toThrow();
  runtime.sendMessage = (_message, receive) =>
    receive({ error: { code: "identity_initialization_failed" } });
  expect(await probeExtensionInitialization(runtime)).toEqual({
    code: "identity_initialization_failed",
  });
});
