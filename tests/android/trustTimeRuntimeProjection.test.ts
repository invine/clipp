import { execFileSync } from "node:child_process";

it("projects validated request sent time through the Android runtime public state", () => {
  execFileSync(
    process.execPath,
    ["tests/harness/android-trust-time-projection.mjs"],
    { cwd: process.cwd(), stdio: "pipe", timeout: 30000 }
  );
});
