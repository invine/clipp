import { execFileSync } from "node:child_process";

it("the production worker exposes isolated readonly reset observations and retires offscreen work when reload fails", () => {
  execFileSync(
    process.execPath,
    ["tests/harness/chrome-runtime-composition.mjs"],
    {
      cwd: process.cwd(),
      stdio: "pipe",
      timeout: 20_000,
    }
  );
});
