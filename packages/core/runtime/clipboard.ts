import type { ClipboardService, GetSenderIdFn } from "../clipboard/service";
import { createManualClipboardService, createPollingClipboardService } from "../clipboard/service";
import type { RuntimeCapabilities } from "./contract";
import { createClipCaptureCoordinator, type ClipHistoryWriter } from "../clipboard/captureCoordinator";

export type RuntimeClipboardHistoryError =
  | "clip_too_large"
  | "pending_capture_too_large"
  | "pending_capture_failed"
  | "pending_capture_dropped";

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
  pendingMaxClips?: number;
  pendingMaxBytes?: number;
  onStored?: (clip: import("../models/Clip").Clip) => void | Promise<void>;
  onHistoryErrorChanged?: (
    error: RuntimeClipboardHistoryError | null,
  ) => void | Promise<void>;
}): ClipboardService {
  let currentHistoryError: RuntimeClipboardHistoryError | null = null;
  const publishHistoryError = (error: RuntimeClipboardHistoryError | null): void => {
    currentHistoryError = error;
    void options.onHistoryErrorChanged?.(error);
  };
  const common = {
    getSenderId: options.getSenderId,
    readText: options.readText,
    writeText: options.writeText,
    now: options.now,
    makeId: options.makeId,
    captureCoordinator: options.history ? createClipCaptureCoordinator({
      history: options.history,
      originPeerId: options.getSenderId,
      now: options.now,
      makeId: options.makeId,
      sharingLifetimeMs: options.sharingLifetimeMs,
      pendingMaxClips: options.pendingMaxClips,
      pendingMaxBytes: options.pendingMaxBytes,
      onStored: options.onStored,
      onDiagnostic: (diagnostic, details) => {
        const hasPendingCaptures = (details?.pendingCount ?? 0) > 0;
        if (diagnostic === "clip_too_large") {
          publishHistoryError(hasPendingCaptures ? "pending_capture_failed" : "clip_too_large");
        }
        if (diagnostic === "pending_capture_too_large") {
          publishHistoryError(hasPendingCaptures ? "pending_capture_failed" : "pending_capture_too_large");
        }
        if (diagnostic === "pending_capture_dropped") {
          publishHistoryError(hasPendingCaptures ? "pending_capture_failed" : "pending_capture_dropped");
        }
        if (diagnostic === "pending_capture_storage_error") {
          publishHistoryError("pending_capture_failed");
        }
        if (diagnostic === "pending_capture_storage_recovered") publishHistoryError(null);
      },
    }) : undefined,
  };
  const clipboard = options.capabilities.clipboardCapture === "explicit-input"
    ? createManualClipboardService(common)
    : (() => {
        if (!options.readText) throw new Error("polling_clipboard_requires_read_access");
        return createPollingClipboardService({
          ...common,
          readText: options.readText,
          pollIntervalMs: options.pollIntervalMs,
        });
      })();
  clipboard.dismissHistoryError = () => {
    if (currentHistoryError !== "pending_capture_failed") publishHistoryError(null);
  };
  return clipboard;
}
