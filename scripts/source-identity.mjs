import { createHash } from "node:crypto";
import { lstat, readlink } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

/** Optional runner deadline preserves the existing callers' source identity API. */
export async function sourceIdentity(root, { remainingMs } = {}) {
  const deadline = remainingMs ? Date.now() + remainingMs(30_000) : null;
  const remaining = (maximum) => {
    const value =
      deadline === null
        ? maximum
        : Math.min(maximum, deadline - Date.now(), remainingMs(maximum));
    if (value <= 0) throw new Error("owned_command_deadline_exhausted");
    return value;
  };
  const bounded = async (operation) => {
    if (!remainingMs) return operation();
    let timer;
    try {
      const timeout = remaining(30_000);
      return await Promise.race([
        operation(),
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("owned_command_deadline_exhausted")),
            timeout
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  };
  const git = (args) => {
    const result = spawnSync("git", args, {
      cwd: root,
      encoding: "utf8",
      timeout: remaining(10_000),
      maxBuffer: 10 * 1024 * 1024,
    });
    if (remainingMs && result.error?.code === "ETIMEDOUT")
      throw new Error("owned_command_deadline_exhausted");
    if (result.status !== 0) throw new Error("candidate_source_unavailable");
    remaining(10_000);
    return result.stdout;
  };
  const files = [
    ...new Set(
      git(["ls-files", "-z", "--cached", "--others", "--exclude-standard"])
        .split("\0")
        .filter(Boolean)
    ),
  ].sort();
  const contentHash = createHash("sha256");
  for (const file of files) {
    remaining(30_000);
    contentHash.update(`${file}\0`);
    try {
      const fullPath = path.join(root, file);
      const stat = await bounded(() => lstat(fullPath));
      if (stat.isSymbolicLink())
        contentHash.update(await bounded(() => readlink(fullPath)));
      else {
        const stream = createReadStream(fullPath);
        try {
          await bounded(async () => {
            for await (const chunk of stream) {
              remaining(30_000);
              contentHash.update(chunk);
            }
          });
        } finally {
          stream.destroy();
        }
      }
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
}
