import * as log from "../logger";

export type ClipboardReader = () => Promise<string>;
export type ChangeHandler = (text: string) => void;

export interface ClipboardWatcher {
  start(): void;
  stop(): void;
  onChange(cb: ChangeHandler): void;
}

function hashString(str: string): string {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash +=
      (hash << 1) +
      (hash << 4) +
      (hash << 7) +
      (hash << 8) +
      (hash << 24);
  }
  return (hash >>> 0).toString(16);
}

export function createWatcher(
  read: ClipboardReader,
  intervalMs = 2000
): ClipboardWatcher {
  let timer: ReturnType<typeof setInterval> | undefined;
  let lastHash = "";
  const handlers: ChangeHandler[] = [];

  async function check() {
    try {
      const text = await read();
      const hash = hashString(text || "");
      if (hash !== lastHash) {
        lastHash = hash;
        log.debug("Clipboard changed");
        handlers.forEach((h) => h(text));
      }
    } catch {
      // ignore read errors
    }
  }

  return {
    start() {
      if (!timer) {
        void (async () => {
          await check();
          timer = setInterval(check, intervalMs);
        })();
        log.info("Clipboard watcher started");
      }
    },
    stop() {
      if (timer) {
        clearInterval(timer);
        timer = undefined;
        log.info("Clipboard watcher stopped");
      }
    },
    onChange(cb: ChangeHandler) {
      handlers.push(cb);
    },
  };
}
