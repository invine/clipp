import { execFileSync } from "node:child_process";

it("projects validated request sent time through the Electron runtime public state", () => {
  execFileSync(
    process.execPath,
    ["tests/harness/electron-trust-time-projection.mjs"],
    { cwd: process.cwd(), stdio: "pipe", timeout: 30000 }
  );
});
