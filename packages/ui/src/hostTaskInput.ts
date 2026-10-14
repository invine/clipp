import type { UiSession } from "./uiSession";

export type NativeBackEvent = { sequence: number; imeVisible: boolean };
export type HostBackResult = "ime" | "overlay" | "task" | "root" | "ignored";
/** Capture/overlay owners must cancel their operation before releasing this registration.
 * An unqualified capture can register without dismiss: Back remains consumed until its
 * lifecycle owner can safely abort it. Native handles never enter UiSession. */
export type HostTaskOverlay = { dismiss?: () => void | Promise<void> };

/** Delivers host input to the existing document-lived task owner, never a second router. */
export function createHostTaskInput(session: UiSession) {
  let ready = false;
  let disposed = false;
  let sequence = 0;
  let overlay: HostTaskOverlay | null = null;
  let dismissing = false;
  async function dismissOverlay() {
    if (disposed || (!overlay && !dismissing)) return false;
    if (overlay?.dismiss && !dismissing) {
      dismissing = true;
      try {
        await overlay.dismiss();
      } catch {
        /* Keep the parent task intact after failed cancellation. */
      } finally {
        dismissing = false;
      }
    }
    return true;
  }
  return {
    hasOverlay: () => !disposed && (!!overlay || dismissing),
    dismissOverlay,
    atRoot: () =>
      ready &&
      !disposed &&
      !overlay &&
      !dismissing &&
      !session.getSnapshot().tasks.length,
    setReady(value: boolean) {
      ready = value && !disposed;
    },
    registerOverlay(value: HostTaskOverlay) {
      if (disposed) return () => undefined;
      if (overlay) throw new Error("host_overlay_already_registered");
      overlay = value;
      return () => {
        if (overlay === value) overlay = null;
      };
    },
    async back(event: NativeBackEvent): Promise<HostBackResult> {
      if (
        !ready ||
        disposed ||
        !Number.isSafeInteger(event.sequence) ||
        event.sequence <= sequence
      )
        return "ignored";
      sequence = event.sequence;
      if (event.imeVisible) return "ime";
      if (overlay || dismissing) {
        await dismissOverlay();
        return "overlay";
      }
      if (!session.getSnapshot().tasks.length) return "root";
      session.back();
      return "task";
    },
    dispose() {
      disposed = true;
      ready = false;
      overlay = null;
    },
  };
}
export type HostTaskInput = ReturnType<typeof createHostTaskInput>;

/** Exclusive overlay Escape runs before an underlying task can see the same key. */
export function bindHostOverlayKeyboard(
  input: HostTaskInput,
  doc: Document
): () => void {
  const keydown = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || !input.hasOverlay()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!event.repeat) void input.dismissOverlay();
  };
  doc.addEventListener("keydown", keydown, true);
  return () => doc.removeEventListener("keydown", keydown, true);
}
