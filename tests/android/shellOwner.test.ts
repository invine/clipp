import { execFileSync } from "node:child_process";

it("the mounted Android shell uses and tears down its supplied production runtime", () => {
  execFileSync(process.execPath, ["tests/harness/android-shell-owner.mjs"], {
    cwd: process.cwd(),
    stdio: "pipe",
    timeout: 30_000,
  });
});
