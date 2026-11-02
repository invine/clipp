import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
it("keeps Android continuity and applied Auto Sync truthful across Stop, reopen, rejection and notification settings return", () => {
  const result = spawnSync(
    process.execPath,
    [resolve("tests/harness/android-continuity-controls.mjs")],
    { encoding: "utf8", timeout: 15_000 }
  );
  if (result.status !== 0)
    throw new Error(
      result.stderr ||
        result.stdout ||
        result.error?.message ||
        "Continuity owner fixture failed"
    );
  expect(result.stdout).toContain('"pass":true');
});
