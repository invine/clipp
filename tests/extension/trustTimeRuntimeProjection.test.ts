import { execFileSync } from "node:child_process";

it("projects validated request sent time through the Chrome worker and JSON message boundary", () => {
  execFileSync(
    process.execPath,
    ["tests/harness/chrome-trust-time-projection.mjs"],
    { cwd: process.cwd(), stdio: "pipe", timeout: 30000 }
  );
});
