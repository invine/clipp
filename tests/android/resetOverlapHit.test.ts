import { execFileSync } from "node:child_process";

it("keeps the temporary overlap control hit-testable above the Android host", () => {
  execFileSync(
    process.execPath,
    ["tests/harness/android-reset-overlap-hit.mjs"],
    {
      cwd: process.cwd(),
      stdio: "pipe",
      timeout: 30_000,
    }
  );
});
