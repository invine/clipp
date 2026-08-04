import type { RuntimeClock } from "./contract";

export const systemRuntimeClock: RuntimeClock = {
  now: () => Date.now(),
  setTimeout: (handler, delayMs) => setTimeout(handler, delayMs),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};
