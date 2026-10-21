import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  writeFileSync,
  rmSync,
  existsSync,
  mkdirSync,
  copyFileSync,
  symlinkSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

it("the packaging entry rejects manifest commands before creating build output", () => {
  const own = mkdtempSync(join(tmpdir(), "clipp-reset-package-"));
  try {
    const manifest = join(own, "manifest.json");
    writeFileSync(
      manifest,
      JSON.stringify({
        version: 1,
        mode: "observe-preflight",
        caseId: "package-source",
        deadlineMs: 5000,
        command: "begin",
      })
    );
    let message = "";
    try {
      execFileSync(
        process.execPath,
        [
          "apps/android/scripts/build-reset-owning-acceptance.mjs",
          "--manifest",
          manifest,
        ],
        { cwd: process.cwd(), stdio: "pipe" }
      );
    } catch (error) {
      message = String(
        error instanceof Error && "stderr" in error ? error.stderr : error
      );
    }
    expect(message).toContain("invalid_manifest");
    expect(existsSync(join(own, "public"))).toBe(false);
  } finally {
    rmSync(own, { recursive: true, force: true });
  }
});

it("the packaging entry refuses a symlinked output parent without touching its target", () => {
  const own = mkdtempSync(join(tmpdir(), "clipp-reset-package-"));
  try {
    const repo = join(own, "repo");
    const victim = join(own, "retained");
    mkdirSync(repo);
    mkdirSync(victim);
    writeFileSync(join(victim, "sentinel"), "preserve");
    symlinkSync(victim, join(repo, ".local"));
    for (const relative of [
      "apps/android/scripts/build-reset-owning-acceptance.mjs",
      "apps/android/src/resetOwningManifest.ts",
    ]) {
      const destination = join(repo, relative);
      mkdirSync(resolve(destination, ".."), { recursive: true });
      copyFileSync(resolve(relative), destination);
    }
    const manifest = join(own, "manifest.json");
    writeFileSync(
      manifest,
      JSON.stringify({
        version: 1,
        mode: "observe-preflight",
        caseId: "package-source",
        deadlineMs: 5000,
      })
    );
    let message = "";
    try {
      execFileSync(
        process.execPath,
        [
          join(repo, "apps/android/scripts/build-reset-owning-acceptance.mjs"),
          "--manifest",
          manifest,
        ],
        { cwd: repo, stdio: "pipe" }
      );
    } catch (error) {
      message = String(
        error instanceof Error && "stderr" in error ? error.stderr : error
      );
    }
    expect(message).toContain("unsafe_output_parent");
    expect(readFileSync(join(victim, "sentinel"), "utf8")).toBe("preserve");
  } finally {
    rmSync(own, { recursive: true, force: true });
  }
});
