import {
  createExtensionClipboardBridge,
  handleExtensionClipboardRequest,
  isExtensionClipboardRequest,
  type ExtensionClipboardRequest,
} from "../../../apps/extension/src/clipboardBridge";
import {
  createOffscreenClipboardReader,
  createOffscreenClipboardWriter,
  type OffscreenClipboardDocument,
} from "../../../apps/extension/src/offscreenClipboard";
import { createRuntimeClipboardService } from "../../../packages/core/runtime/clipboard";
import { RUNTIME_CAPABILITIES } from "../../../packages/core/runtime/capabilities";
import type { Clip } from "../../../packages/core/models/Clip";

describe("Chrome offscreen clipboard bridge", () => {
  it("routes clipboard writes through the offscreen handler", async () => {
    const writeText = jest.fn(async (_text: string) => {});
    const readText = jest.fn(async () => "synthetic clipboard");
    const requests: ExtensionClipboardRequest[] = [];
    const bridge = createExtensionClipboardBridge(async (request) => {
      requests.push(request);
      return handleExtensionClipboardRequest(request, { readText, writeText });
    });

    await bridge.writeText("reused");

    expect(requests).toEqual([{ action: "clipboardWrite", text: "reused" }]);
    expect(writeText).toHaveBeenCalledWith("reused");
  });

  it("reads clipboard text through the offscreen handler", async () => {
    const writeText = jest.fn(async (_text: string) => {});
    const readText = jest.fn(async () => "synthetic clipboard");
    const requests: ExtensionClipboardRequest[] = [];
    const bridge = createExtensionClipboardBridge(async (request) => {
      requests.push(request);
      return handleExtensionClipboardRequest(request, { readText, writeText });
    });

    await expect(bridge.readText()).resolves.toBe("synthetic clipboard");

    expect(requests).toEqual([{ action: "clipboardRead" }]);
    expect(readText).toHaveBeenCalledTimes(1);
  });

  it("applies a live Remote Clip through the extension bridge and offscreen writer", async () => {
    const fixture = offscreenDocumentFixture(true);
    const writeText = createOffscreenClipboardWriter(fixture.document);
    const bridge = createExtensionClipboardBridge(async (request) =>
      handleExtensionClipboardRequest(request, {
        readText: async () => "",
        writeText,
      })
    );
    const accept = jest.fn();
    const clipboard = createRuntimeClipboardService({
      capabilities: RUNTIME_CAPABILITIES.chromeExtension,
      getSenderId: () => "12D3KooWJ5oQ9G9kDMwrrzmVWwZnJryHJns8ovH8LYgDgJYJYyXy",
      writeText: bridge.writeText,
      history: { accept },
    });
    const remoteClip: Clip = {
      id: "00000000-0000-4000-8000-000000000801",
      type: "text",
      content: "live Remote Clip",
      originPeerId: "12D3KooWQ7qJ9e5jDkvX4u1z7xG2FSuEw1gsvxTdrmQaN6wKpL9Z",
      capturedAt: 1,
      shareExpiresAt: 86_400_001,
    };
    clipboard.start();

    await expect(clipboard.writeRemoteClip(remoteClip)).resolves.toBe(true);

    expect(fixture.execCommand).toHaveBeenCalledWith("copy");
    expect(fixture.valueAtCopy()).toBe(remoteClip.content);
    await expect(
      clipboard.processLocalText(remoteClip.content)
    ).resolves.toBeNull();
    expect(accept).not.toHaveBeenCalled();
    await clipboard.stop();
  });

  it("rejects failed offscreen writes and invalid requests", async () => {
    const failed = createExtensionClipboardBridge(async () => ({
      ok: false,
      error: "denied",
    }));

    await expect(failed.writeText("secret")).rejects.toThrow("denied");
    expect(isExtensionClipboardRequest({ action: "clipboardWrite" })).toBe(
      false
    );
    expect(isExtensionClipboardRequest({ action: "clipboardRead" })).toBe(true);
    expect(
      isExtensionClipboardRequest({ action: "clipboardWrite", text: "x" })
    ).toBe(true);
  });

  it("reads exact text through the offscreen web clipboard API", async () => {
    const clipboard = { readText: jest.fn(async () => "  exact\r\ntext  ") };
    const readText = createOffscreenClipboardReader(clipboard);

    await expect(readText()).resolves.toBe("  exact\r\ntext  ");

    expect(clipboard.readText).toHaveBeenCalledTimes(1);
  });

  it("normalizes offscreen clipboard read failures", async () => {
    const readText = createOffscreenClipboardReader({
      readText: async () => {
        throw new Error("permission denied");
      },
    });

    await expect(readText()).rejects.toThrow("clipboard_read_failed");
  });

  it("copies exact text through a temporary offscreen control and removes it", async () => {
    const fixture = offscreenDocumentFixture(true);
    const writeText = createOffscreenClipboardWriter(fixture.document);

    await writeText("  exact\r\ntext  ");

    expect(fixture.appendChild).toHaveBeenCalledWith(fixture.control);
    expect(fixture.select).toHaveBeenCalledTimes(1);
    expect(fixture.execCommand).toHaveBeenCalledWith("copy");
    expect(fixture.valueAtCopy()).toBe("  exact\r\ntext  ");
    expect(fixture.control.value).toBe("");
    expect(fixture.remove).toHaveBeenCalledTimes(1);
  });

  it("fails a rejected offscreen copy and still removes staged content", async () => {
    const fixture = offscreenDocumentFixture(false);
    const writeText = createOffscreenClipboardWriter(fixture.document);

    await expect(writeText("secret")).rejects.toThrow("clipboard_write_failed");

    expect(fixture.control.value).toBe("");
    expect(fixture.remove).toHaveBeenCalledTimes(1);
  });

  it("normalizes a thrown copy error and still removes staged content", async () => {
    const fixture = offscreenDocumentFixture(true);
    fixture.execCommand.mockImplementation(() => {
      throw new Error("document is not focused");
    });
    const writeText = createOffscreenClipboardWriter(fixture.document);

    await expect(writeText("secret")).rejects.toThrow("clipboard_write_failed");

    expect(fixture.control.value).toBe("");
    expect(fixture.remove).toHaveBeenCalledTimes(1);
  });
});

function offscreenDocumentFixture(copyResult: boolean) {
  let copiedValue = "";
  const control = {
    value: "",
    tabIndex: 0,
    ariaHidden: "",
    style: {} as CSSStyleDeclaration,
    select: jest.fn(),
    remove: jest.fn(),
    setAttribute: jest.fn(),
  };
  const appendChild = jest.fn();
  const execCommand = jest.fn((_command: "copy") => {
    copiedValue = control.value;
    return copyResult;
  });
  const document = {
    body: { appendChild },
    createElement: jest.fn(() => control),
    execCommand,
  } as unknown as OffscreenClipboardDocument;
  return {
    document,
    control,
    appendChild,
    execCommand,
    select: control.select,
    remove: control.remove,
    valueAtCopy: () => copiedValue,
  };
}
