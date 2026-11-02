import type { PopupCaptureState } from "../../../packages/core/runtime/recoveryIssues";
export type { PopupCaptureState } from "../../../packages/core/runtime/recoveryIssues";
type CaptureRuntime = {
  readonly lastError?: { message?: string };
  sendMessage(message: object, callback: (response?: unknown) => void): void;
};
export function createPopupCapture(options: {
  hasFocus(): boolean;
  subscribeFocus(listener: () => void): () => void;
  readText(): Promise<string>;
  runtime: CaptureRuntime;
  onState(state: PopupCaptureState): void;
}) {
  let state: PopupCaptureState = { pending: false, error: null };
  let disposed = false;
  let unsubscribe: (() => void) | undefined;
  let lastConfirmed: string | undefined;
  let cancelHandoff: (() => void) | undefined;
  function publish(next: PopupCaptureState) {
    if (disposed) return;
    state = next;
    options.onState(next);
  }
  async function observe(deliberate: boolean): Promise<boolean> {
    if (disposed || state.pending) return false;
    if (!options.hasFocus()) return false;
    if (!deliberate && state.error) return false;
    publish({ pending: true, error: state.error });
    let text: string;
    try {
      text = await options.readText();
    } catch {
      publish({ pending: false, error: "read_failed" });
      return false;
    }
    if (disposed) return false;
    if (!deliberate && text === lastConfirmed) {
      publish({ pending: false, error: null });
      return true;
    }
    const result = await new Promise<"confirmed" | "failed" | "unconfirmed">(
      (resolve) => {
        let settled = false;
        const finish = (result: "confirmed" | "failed" | "unconfirmed") => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          cancelHandoff = undefined;
          resolve(result);
        };
        const timer = setTimeout(() => finish("unconfirmed"), 10_000);
        cancelHandoff = () => finish("unconfirmed");
        try {
          options.runtime.sendMessage(
            { type: "clipboardUpdate", text },
            (response) => {
              // Chrome exposes lastError only during this callback, even for late replies.
              const transportError = options.runtime.lastError;
              const reply = response as { ok?: boolean } | undefined;
              finish(
                transportError || typeof reply?.ok !== "boolean"
                  ? "unconfirmed"
                  : reply.ok
                    ? "confirmed"
                    : "failed"
              );
            }
          );
        } catch {
          finish("unconfirmed");
        }
      }
    );
    if (disposed) return false;
    if (result === "confirmed") lastConfirmed = text;
    publish({
      pending: false,
      error:
        result === "confirmed"
          ? null
          : result === "failed"
            ? "handoff_failed"
            : "handoff_unconfirmed",
    });
    return result === "confirmed";
  }
  return {
    start() {
      if (disposed || unsubscribe) return;
      const focus = () => {
        void observe(false);
      };
      unsubscribe = options.subscribeFocus(focus);
      if (options.hasFocus()) focus();
    },
    retry: () => observe(true),
    dispose() {
      disposed = true;
      unsubscribe?.();
      cancelHandoff?.();
    },
  };
}
