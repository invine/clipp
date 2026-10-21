import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";

it.each(["early-retained-resume", "late", "empty", "repeated", "fenced"])(
  "the actual Android owner preserves durable explicit ingress across startup and activity callbacks (%s)",
  (mode) => {
    mkdirSync(".local", { recursive: true });
    execFileSync(
      process.execPath,
      [
        "tests/harness/android-startup-replay.mjs",
        `.local/startup-replay-${randomUUID()}`,
        mode,
      ],
      { cwd: process.cwd(), stdio: "pipe", timeout: 65_000 }
    );
  },
  70_000
);
