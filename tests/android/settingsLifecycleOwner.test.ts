import { execFileSync } from "node:child_process";

it.each(["cold", "overlap"])(
  "keeps actual Android startup and retention saves live across background settings reads (%s)",
  (mode) => {
    execFileSync(
      process.execPath,
      ["tests/harness/android-settings-lifecycle.mjs", mode],
      { cwd: process.cwd(), stdio: "pipe", timeout: 20_000 }
    );
  }
);
