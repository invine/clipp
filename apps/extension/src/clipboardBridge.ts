export type ExtensionClipboardRequest =
  { action: "clipboardRead" } | { action: "clipboardWrite"; text: string };

export type ExtensionClipboardResponse =
  { ok: true; text?: string } | { ok: false; error: string };

export type ExtensionClipboardWriter = (text: string) => void | Promise<void>;
export type ExtensionClipboardReader = () => string | Promise<string>;

export type ExtensionClipboardHandlers = {
  readText: ExtensionClipboardReader;
  writeText: ExtensionClipboardWriter;
};

export type ExtensionClipboardRequester = (
  request: ExtensionClipboardRequest
) => Promise<ExtensionClipboardResponse>;

export function isExtensionClipboardRequest(
  value: unknown
): value is ExtensionClipboardRequest {
  if (!value || typeof value !== "object") return false;
  const request = value as { action?: unknown; text?: unknown };
  return (
    request.action === "clipboardRead" ||
    (request.action === "clipboardWrite" && typeof request.text === "string")
  );
}

export async function handleExtensionClipboardRequest(
  request: ExtensionClipboardRequest,
  handlers: ExtensionClipboardHandlers
): Promise<ExtensionClipboardResponse> {
  try {
    if (request.action === "clipboardRead") {
      return { ok: true, text: await handlers.readText() };
    }
    await handlers.writeText(request.text);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: (error as Error).message || "clipboard_operation_failed",
    };
  }
}

export function createExtensionClipboardBridge(
  request: ExtensionClipboardRequester
) {
  return {
    async readText(): Promise<string> {
      const response = await request({ action: "clipboardRead" });
      if (!response.ok) throw new Error(response.error);
      if (typeof response.text !== "string")
        throw new Error("clipboard_read_failed");
      return response.text;
    },
    async writeText(text: string): Promise<void> {
      const response = await request({ action: "clipboardWrite", text });
      if (!response.ok) throw new Error(response.error);
    },
  };
}
