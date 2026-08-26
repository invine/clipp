import {
  createExtensionClipboardBridge,
  handleExtensionClipboardRequest,
  isExtensionClipboardRequest,
  type ExtensionClipboardRequest,
} from "../../../apps/extension/src/clipboardBridge";
import {
  createOffscreenClipboardWriter,
  type OffscreenClipboardDocument,
} from "../../../apps/extension/src/offscreenClipboard";

describe("Chrome offscreen clipboard bridge", () => {
  it("routes clipboard writes through the offscreen handler", async () => {
    const writeText = jest.fn(async (_text: string) => {});
    const requests: ExtensionClipboardRequest[] = [];
    const bridge = createExtensionClipboardBridge(async (request) => {
      requests.push(request);
      return handleExtensionClipboardRequest(request, writeText);
    });

    await bridge.writeText("reused");

    expect(requests).toEqual([{ action: "clipboardWrite", text: "reused" }]);
    expect(writeText).toHaveBeenCalledWith("reused");
  });

  it("rejects failed offscreen writes and invalid requests", async () => {
    const failed = createExtensionClipboardBridge(async () => ({ ok: false, error: "denied" }));

    await expect(failed.writeText("secret")).rejects.toThrow("denied");
    expect(isExtensionClipboardRequest({ action: "clipboardWrite" })).toBe(false);
    expect(isExtensionClipboardRequest({ action: "clipboardRead" })).toBe(false);
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
  const execCommand = jest.fn(() => {
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
