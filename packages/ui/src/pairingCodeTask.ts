import type { PairingCode } from "./types";
import {
  confirmPayloadCopy,
  type PayloadCopyResult,
} from "../../core/clipboard/payloadCopy";

export type PairingCodeTaskState = {
  open: boolean;
  generation: "idle" | "pending" | "ready" | "error";
  code: PairingCode | null;
  copy: "idle" | "pending" | PayloadCopyResult["status"];
};

/** Owns the existing QR task; asynchronous replies are scoped to its live context. */
export function createPairingCodeTask() {
  let state: PairingCodeTaskState = {
    open: false,
    generation: "idle",
    code: null,
    copy: "idle",
  };
  const listeners = new Set<() => void>();
  const publish = (next: PairingCodeTaskState) => {
    state = next;
    listeners.forEach((listener) => listener());
  };
  let version = 0;
  let context: string | null = null;
  const close = () => {
    version++;
    publish({ open: false, generation: "idle", code: null, copy: "idle" });
  };
  return {
    getState: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    copy: async (write: (text: string) => Promise<PayloadCopyResult>) => {
      if (
        state.generation !== "ready" ||
        !state.code ||
        state.copy === "pending"
      )
        return;
      const requestVersion = version;
      const text = state.code.text;
      publish({ ...state, copy: "pending" });
      const result = await confirmPayloadCopy(() => write(text));
      if (version !== requestVersion) return;
      publish({ ...state, copy: result?.status ?? "unconfirmed" });
    },
    close,
    setContext: (next: string | null) => {
      if (next !== context) {
        context = next;
        close();
      }
    },
    generate: async (request: () => Promise<PairingCode | null>) => {
      const requestVersion = ++version;
      publish({ open: true, generation: "pending", code: null, copy: "idle" });
      try {
        const code = await request();
        if (version !== requestVersion) return;
        publish({
          open: true,
          generation: code?.text ? "ready" : "error",
          code: code?.text ? code : null,
          copy: "idle",
        });
      } catch {
        if (version !== requestVersion) return;
        publish({ open: true, generation: "error", code: null, copy: "idle" });
      }
    },
  };
}
