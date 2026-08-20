import {
  createExtensionClipboardBridge,
  handleExtensionClipboardRequest,
  isExtensionClipboardRequest,
  type ExtensionClipboardRequest,
} from "../../../apps/extension/src/clipboardBridge";

describe("Chrome offscreen clipboard bridge", () => {
  it("routes clipboard reads and writes through the offscreen handler", async () => {
    let value = "initial";
    const clipboard = {
      readText: jest.fn(async () => value),
      writeText: jest.fn(async (text: string) => { value = text; }),
    };
    const requests: ExtensionClipboardRequest[] = [];
    const bridge = createExtensionClipboardBridge(async (request) => {
      requests.push(request);
      return handleExtensionClipboardRequest(request, clipboard);
    });

    await expect(bridge.readText()).resolves.toBe("initial");
    await bridge.writeText("reused");

    expect(requests).toEqual([
      { action: "clipboardRead" },
      { action: "clipboardWrite", text: "reused" },
    ]);
    expect(value).toBe("reused");
  });

  it("rejects failed or malformed offscreen responses", async () => {
    const failed = createExtensionClipboardBridge(async () => ({ ok: false, error: "denied" }));
    const malformed = createExtensionClipboardBridge(async () => ({ ok: true }));

    await expect(failed.writeText("secret")).rejects.toThrow("denied");
    await expect(malformed.readText()).rejects.toThrow("clipboard_read_failed");
    expect(isExtensionClipboardRequest({ action: "clipboardWrite" })).toBe(false);
  });
});
