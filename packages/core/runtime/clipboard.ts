import type { ClipboardService, GetSenderIdFn } from "../clipboard/service";
import { createManualClipboardService, createPollingClipboardService } from "../clipboard/service";
import type { RuntimeCapabilities } from "./contract";
import { createClipCaptureCoordinator, type ClipHistoryWriter } from "../clipboard/captureCoordinator";

export function createRuntimeClipboardService(options: {
  capabilities: RuntimeCapabilities;
  getSenderId: GetSenderIdFn;
  readText?: () => Promise<string>;
  writeText?: (text: string) => Promise<void>;
  pollIntervalMs?: number;
  now?: () => number;
  makeId?: () => string;
  history?: ClipHistoryWriter;
  sharingLifetimeMs?: () => number;
  onStored?: (clip: import("../models/Clip").Clip) => void | Promise<void>;
}): ClipboardService {
  const common = {
    getSenderId: options.getSenderId,
    writeText: options.writeText,
    now: options.now,
    makeId: options.makeId,
    captureCoordinator: options.history ? createClipCaptureCoordinator({
      history: options.history,
      originPeerId: options.getSenderId,
      now: options.now,
      makeId: options.makeId,
      sharingLifetimeMs: options.sharingLifetimeMs,
      onStored: options.onStored,
    }) : undefined,
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
