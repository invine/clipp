import { execFileSync } from "node:child_process";

it("the production tray retains WebRTC on close-to-tray and cleans it up once on final Quit", () => {
  execFileSync(process.execPath, ["tests/harness/electron-main-window.mjs"], {
    cwd: process.cwd(),
    stdio: "pipe",
    timeout: 20_000,
  });
});

it("the production runtime resets through its owning interface and stays sealed when relaunch fails", () => {
  execFileSync(
    process.execPath,
    ["tests/harness/electron-main-window.mjs", "reset"],
    {
      cwd: process.cwd(),
      stdio: "pipe",
      timeout: 20_000,
    }
  );
});
