import type { HostTaskInput } from "../../../packages/ui/src/hostTaskInput";
import type {
  PairingScanOptions,
  PairingScanResult,
  PairingCameraPermission,
} from "../../../packages/ui/src/pairingScan";
import {
  createAndroidBackgroundNative,
  type AndroidBackgroundNative,
} from "./backgroundContinuityNative";
import { scanPairingQrWithCamera } from "./qrCameraScanner";

/** Capture belongs to the host overlay, not to a submitted Pairing request. */
export function createAndroidPairingScanner(
  input: HostTaskInput,
  native: Pick<
    AndroidBackgroundNative,
    "on" | "cameraPermission"
  > = createAndroidBackgroundNative()
) {
  let disposed = false;
  let active: { controller: AbortController; release(): void } | undefined;
  function cancelActive() {
    active?.controller.abort();
    active?.release();
  }
  return {
    permission: {
      async read() {
        return (await native.cameraPermission?.()) ?? "unknown";
      },
      subscribeReturn(listener) {
        let removed = false;
        let unsubscribe: (() => void) | undefined;
        void native
          .on("activityState", (event) => {
            if (!removed && event.resumed === true) listener();
          })
          .then((remove) => {
            if (removed) remove();
            else unsubscribe = remove;
          })
          .catch(() => undefined);
        return () => {
          removed = true;
          unsubscribe?.();
        };
      },
    } satisfies PairingCameraPermission,
    async scan({ signal }: PairingScanOptions): Promise<PairingScanResult> {
      if (disposed || signal.aborted) return { status: "cancelled" };
      cancelActive();
      const controller = new AbortController();
      const current = {
        controller,
        release: input.registerOverlay({ dismiss: () => controller.abort() }),
      };
      active = current;
      const abort = () => controller.abort();
      signal.addEventListener("abort", abort, { once: true });
      let unsubscribe: (() => void) | undefined;
      const cancelled = new Promise<PairingScanResult>((resolve) => {
        controller.signal.addEventListener(
          "abort",
          () => resolve({ status: "cancelled" }),
          { once: true }
        );
      });
      // Subscribe before acquiring camera. Abort must still settle if native
      // listener registration is delayed; a late handle removes itself.
      const capture = native
        .on("activityState", (event) => {
          // Android permission UI can pause a still-visible STARTED Activity.
          // Actual Stop loses capture ownership. Older bridges without this
          // field retain their conservative pause cancellation behavior.
          if (
            event.started === false ||
            (typeof event.started !== "boolean" && event.resumed === false)
          )
            controller.abort();
        })
        .then((remove) => {
          if (controller.signal.aborted) {
            remove();
            return { status: "cancelled" } as const;
          }
          unsubscribe = remove;
          return scanPairingQrWithCamera({ signal: controller.signal });
        })
        .catch(
          () => ({ status: "failed", error: "camera_unavailable" }) as const
        );
      try {
        return await Promise.race([cancelled, capture]);
      } finally {
        controller.abort();
        signal.removeEventListener("abort", abort);
        unsubscribe?.();
        current.release();
        if (active === current) active = undefined;
      }
    },
    dispose() {
      disposed = true;
      cancelActive();
    },
  };
}
