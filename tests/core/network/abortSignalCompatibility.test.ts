import { execFileSync } from "node:child_process";

it.each(["missing", "native", "legacy-reason"])(
  "keeps real transport, signed records, cancelled queues and later locks usable (%s)",
  (mode) => {
    execFileSync(
      process.execPath,
      ["--import", "tsx", "tests/harness/abortSignalCompatibility.mjs", mode],
      { cwd: process.cwd(), stdio: "pipe", timeout: 15_000 }
    );
  }
);
