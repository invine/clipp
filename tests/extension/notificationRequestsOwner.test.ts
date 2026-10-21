import { execFileSync } from "node:child_process";
it.each(["absent", "idle", "occupied", "offline"])(
  "production Chrome notification selection uses canonical management routing (%s)",
  (mode) => {
    execFileSync(
      process.execPath,
      ["tests/harness/chrome-notification-requests.mjs", mode],
      {
        cwd: process.cwd(),
        stdio: "pipe",
        timeout: 20_000,
      }
    );
  }
);
