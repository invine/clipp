import { execFileSync } from "node:child_process";

it.each(["loopback", "disabled", "default"])(
  "the real Electron startup owner retains its %s transport choice across mutation and later calls",
  (mode) => {
    execFileSync(
      process.execPath,
      ["tests/harness/electron-main-window.mjs", `transport-${mode}`],
      { stdio: "pipe", timeout: 30_000 }
    );
  }
);
