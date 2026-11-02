import { v4 as uuidv4 } from "uuid";
import {
  Capacitor,
  registerPlugin,
  type PluginListenerHandle,
} from "@capacitor/core";
import type {
  HostTaskInput,
  NativeBackEvent,
} from "../../../packages/ui/src/hostTaskInput";

export type AndroidTaskInputSource = {
  addListener(
    event: "back",
    callback: (event: NativeBackEvent & { owner: string }) => void
  ): Promise<PluginListenerHandle>;
  setReady(options: { owner: string; ready: boolean }): Promise<void>;
  completeBack(options: {
    owner: string;
    sequence: number;
    handled: boolean;
  }): Promise<void>;
};
const nativeInput = registerPlugin<AndroidTaskInputSource>("HostTaskInput");

/** Readiness follows listener installation; every acknowledgment belongs to this document. */
export function bindAndroidHostTaskInput(
  input: HostTaskInput,
  source: AndroidTaskInputSource = nativeInput,
  owner: string = uuidv4()
): () => void {
  if (source === nativeInput && Capacitor.getPlatform() !== "android")
    return () => undefined;
  let disposed = false;
  let handle: PluginListenerHandle | undefined;
  void source
    .addListener("back", (event) => {
      if (disposed || event.owner !== owner) return;
      void input
        .back(event)
        .then((result) => {
          if (!disposed)
            return source.completeBack({
              owner,
              sequence: event.sequence,
              handled: result !== "root" || !input.atRoot(),
            });
        })
        .catch(() => {
          /* Native keeps the event consumed when the bridge result is unavailable. */
        });
    })
    .then(async (registered) => {
      if (disposed) {
        await registered.remove();
        return;
      }
      handle = registered;
      input.setReady(true);
      await source.setReady({ owner, ready: true });
    })
    .catch(() => {
      input.setReady(false);
    });
  return () => {
    disposed = true;
    input.dispose();
    void source.setReady({ owner, ready: false }).catch(() => undefined);
    void handle?.remove();
  };
}
