import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

it.each([{ flags: [] }, { flags: ["--theme-write"] }])(
  "keeps actual Android Auto Sync and feed aligned with an overlapping appearance operation %j",
  ({ flags }) => {
    const result = spawnSync(
      process.execPath,
      [resolve("tests/harness/android-settings-owner.mjs"), ...flags],
      { encoding: "utf8", timeout: 15_000 }
    );
    if (result.status !== 0)
      throw new Error(
        result.stderr ||
          result.stdout ||
          result.error?.message ||
          "Android settings owner fixture failed"
      );
    expect(result.stdout).toContain('"pass":true');
  }
);
