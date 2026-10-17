import { execFileSync } from "node:child_process";

it("the production tray restores its retained main window and Dock after close-to-tray", () => {
  execFileSync(process.execPath, ["tests/harness/electron-main-window.mjs"], {
    cwd: process.cwd(),
    stdio: "pipe",
    timeout: 20_000,
  });
});
