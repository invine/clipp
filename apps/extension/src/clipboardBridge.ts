export type ExtensionClipboardRequest = { action: "clipboardWrite"; text: string };

export type ExtensionClipboardResponse =
  | { ok: true }
  | { ok: false; error: string };

export type ExtensionClipboardWriter = (text: string) => void | Promise<void>;

export type ExtensionClipboardRequester = (
  request: ExtensionClipboardRequest,
) => Promise<ExtensionClipboardResponse>;

export function isExtensionClipboardRequest(value: unknown): value is ExtensionClipboardRequest {
  if (!value || typeof value !== "object") return false;
  const request = value as Partial<ExtensionClipboardRequest>;
  return request.action === "clipboardWrite" && typeof request.text === "string";
}

export async function handleExtensionClipboardRequest(
  request: ExtensionClipboardRequest,
  writeText: ExtensionClipboardWriter,
): Promise<ExtensionClipboardResponse> {
  try {
    await writeText(request.text);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: (error as Error).message || "clipboard_operation_failed" };
  }
}

export function createExtensionClipboardBridge(request: ExtensionClipboardRequester) {
  return {
    async writeText(text: string): Promise<void> {
      const response = await request({ action: "clipboardWrite", text });
      if (!response.ok) throw new Error(response.error);
    },
  };
}
