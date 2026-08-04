import type { ClipboardService, GetSenderIdFn } from "../clipboard/service";
import { createManualClipboardService, createPollingClipboardService } from "../clipboard/service";
import type { RuntimeCapabilities } from "./contract";

export function createRuntimeClipboardService(options: {
  capabilities: RuntimeCapabilities;
  getSenderId: GetSenderIdFn;
  readText?: () => Promise<string>;
  writeText?: (text: string) => Promise<void>;
  pollIntervalMs?: number;
  now?: () => number;
  makeId?: () => string;
}): ClipboardService {
  const common = {
    getSenderId: options.getSenderId,
    writeText: options.writeText,
    now: options.now,
    makeId: options.makeId,
  };
  if (options.capabilities.clipboardCapture === "explicit-input") {
    return createManualClipboardService(common);
  }
  if (!options.readText) throw new Error("polling_clipboard_requires_read_access");
  return createPollingClipboardService({
    ...common,
    readText: options.readText,
    pollIntervalMs: options.pollIntervalMs,
  });
}
