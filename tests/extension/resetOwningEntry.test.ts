import { execFileSync } from "node:child_process";

it.each(["preflight", "execute", "deadline", "precondition-change"])(
  "the opt-in Chrome owning entry qualifies its %s through the actual owner",
  (mode) => {
    execFileSync(
      process.execPath,
      ["tests/harness/chrome-reset-owning-entry.mjs", mode],
      {
        cwd: process.cwd(),
        stdio: "pipe",
        timeout: 20_000,
      }
    );
  }
);
