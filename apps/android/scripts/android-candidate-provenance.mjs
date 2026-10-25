import { createHash } from "node:crypto";
import { lstat, readFile, readlink } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function sourceIdentity(root) {
  const git = (args) => {
    const result = spawnSync("git", args, {
      cwd: root,
      encoding: "utf8",
      timeout: 10_000,
      maxBuffer: 10 * 1024 * 1024,
    });
    if (result.status !== 0) throw new Error("candidate_source_unavailable");
    return result.stdout;
  };
  const files = [
    ...new Set(
      git(["ls-files", "-z", "--cached", "--others", "--exclude-standard"])
        .split("\0")
        .filter(Boolean)
    ),
  ].sort();
  return (async () => {
    const contentHash = createHash("sha256");
    for (const file of files) {
      contentHash.update(`${file}\0`);
      try {
        const fullPath = path.join(root, file);
        const stat = await lstat(fullPath);
        contentHash.update(
          stat.isSymbolicLink()
            ? await readlink(fullPath)
            : await readFile(fullPath)
        );
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
        contentHash.update("deleted");
      }
    }
    return {
      revision: git(["rev-parse", "HEAD"]).trim(),
      dirty: Boolean(git(["status", "--porcelain"]).trim()),
      sourceSha256: contentHash.digest("hex"),
    };
  })();
}

if (process.argv.includes("--source-identity")) {
  const root = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../.."
  );
  console.log(JSON.stringify(await sourceIdentity(root)));
}
