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

it("the production Android owner resets the same client and stays sealed when native recreation fails", () => {
  execFileSync(
    process.execPath,
    ["tests/harness/android-settings-lifecycle.mjs", "reset"],
    {
      cwd: process.cwd(),
      stdio: "pipe",
      timeout: 20_000,
    }
  );
});

it("terminal owning stop stays sealed when an admitted reset is conclusively rejected", () => {
  execFileSync(
    process.execPath,
    ["tests/harness/android-settings-lifecycle.mjs", "stop-rejection"],
    {
      cwd: process.cwd(),
      stdio: "pipe",
      timeout: 20_000,
    }
  );
});
