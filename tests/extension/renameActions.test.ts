import {
  renameExtensionDevice,
  renameExtensionIdentity,
} from "../../apps/extension/src/renameActions";

describe("Chrome name and alias actions", () => {
  const runtime = {
    lastError: undefined as { message: string } | undefined,
    sendMessage: jest.fn(),
  };

  beforeEach(() => {
    runtime.lastError = undefined;
    runtime.sendMessage.mockReset();
  });

  it("reports a lost Device Name reply as unconfirmed", async () => {
    runtime.sendMessage.mockImplementation((_message, callback) =>
      callback(undefined)
    );

    await expect(
      renameExtensionIdentity(runtime, "New name", "peer-a")
    ).rejects.toThrow("rename_outcome_unconfirmed");
  });

  it("reports a removed alias target instead of succeeding", async () => {
    runtime.sendMessage.mockImplementation((_message, callback) =>
      callback({ ok: false, error: "device_unavailable" })
    );

    await expect(
      renameExtensionDevice(runtime, "peer-a", "Desk")
    ).rejects.toThrow("device_unavailable");
  });
});
