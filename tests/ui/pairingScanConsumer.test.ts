import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

it("mounted Pairing exposes real scanner permission recovery and aborts capture on task disposal without losing context", () => {
  mkdirSync(".local", { recursive: true });
  const output = mkdtempSync(
    join(process.cwd(), ".local", "scanner-consumer-")
  );
  try {
    execFileSync(
      process.execPath,
      ["tests/harness/scanner-controls.mjs", output, "--consumer"],
      { cwd: process.cwd(), stdio: "pipe", timeout: 20000 }
    );
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
});
