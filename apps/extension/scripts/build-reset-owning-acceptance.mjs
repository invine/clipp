import {
  mkdir,
  mkdtemp,
  lstat,
  realpath,
  readFile,
  writeFile,
  readdir,
} from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

// New owned path only; never modifies normal dist or creates/seeds a profile.
try {
  if (
    process.argv.length !== 3 ||
    process.argv[2] !== "--build-reset-owning-entry"
  )
    throw Error("explicit_owning_entry_opt_in_required");
  if (
    process.env.CLIPP_RELAY_ACCEPTANCE_TRANSPORT ||
    process.env.VITE_DEV_SERVER_URL
  )
    throw Error("alternate_runtime_forbidden");
  const repo = await realpath(
    fileURLToPath(new URL("../../../", import.meta.url))
  );
  const app = join(repo, "apps/extension"),
    parent = join(repo, ".local");
  const git = (...args) =>
    execFileSync("git", args, {
      cwd: repo,
      encoding: "utf8",
      timeout: 5000,
      maxBuffer: 65536,
    }).trim();
  if (git("status", "--porcelain=v1")) throw Error("clean_source_required");
  const head = git("rev-parse", "HEAD"),
    tree = git("rev-parse", "HEAD^{tree}");
  await mkdir(parent, { recursive: true });
  const info = await lstat(parent);
  if (
    info.isSymbolicLink() ||
    !info.isDirectory() ||
    (await realpath(parent)) !== parent
  )
    throw Error("unsafe_output_parent");
  const output = await mkdtemp(join(parent, "chrome-reset-owning-"));
  const { build } = await import("vite");
  await build({
    root: app,
    configFile: join(app, "vite.reset-owning.config.ts"),
    mode: "reset-owning-acceptance",
    build: { outDir: output, emptyOutDir: true },
  });
  if (
    git("rev-parse", "HEAD") !== head ||
    git("rev-parse", "HEAD^{tree}") !== tree ||
    git("status", "--porcelain=v1")
  )
    throw Error("source_changed_during_build");
  const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
  const assets = [];
  const inventory = async (directory) => {
    for (const entry of (
      await readdir(directory, { withFileTypes: true })
    ).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) throw Error("output_link_refused");
      if (entry.isDirectory()) await inventory(path);
      else if (entry.isFile()) {
        const bytes = await readFile(path);
        if (bytes.length > 33554432 || assets.length >= 256)
          throw Error("output_cap");
        assets.push({
          path: relative(output, path),
          bytes: bytes.length,
          sha256: sha(bytes),
        });
      } else throw Error("unknown_output_entry");
    }
  };
  await inventory(output);
  const generated = JSON.parse(
    await readFile(join(output, "manifest.json"), "utf8")
  );
  const normal = JSON.parse(await readFile(join(app, "manifest.json"), "utf8"));
  if (
    JSON.stringify(generated.permissions) !==
      JSON.stringify(normal.permissions) ||
    JSON.stringify(generated.host_permissions) !==
      JSON.stringify(normal.host_permissions) ||
    generated.background?.service_worker !== "service-worker-loader.js" ||
    generated.background?.type !== "module"
  )
    throw Error("manifest_boundary_changed");
  const sourcePaths = [
    "apps/extension/package.json",
    "apps/extension/vite.config.ts",
    "apps/extension/vite.reset-owning.config.ts",
    "apps/extension/manifest.json",
    "apps/extension/src/background.ts",
    "apps/extension/src/resetOwningCase.ts",
    "apps/extension/src/resetOwningAcceptance.ts",
    "apps/extension/src/resetOwningWorker.ts",
    "apps/extension/src/resetOwningWitness.ts",
    "apps/extension/reset-owning-witness.html",
    "apps/extension/scripts/build-reset-owning-acceptance.mjs",
  ];
  const sources = await Promise.all(
    sourcePaths.map(async (path) => ({
      path,
      sha256: sha(await readFile(join(repo, path))),
    }))
  );
  const receipt = {
    version: 1,
    kind: "chrome-runtime-reset-owning",
    sourceRoot: repo,
    head,
    tree,
    output,
    assets,
    sources,
    rootCaseFile: "root-reset-case.json",
    rootCasePresent: false,
    rootCaseDataOnlyStagingRequiresFullBrowserAbsence: true,
    rootCaseMustRetainOriginalDeadline: true,
    normalEntryChanged: false,
    nativeQualified: false,
  };
  await writeFile(
    join(output, "build-receipt.json"),
    JSON.stringify(receipt, null, 2) + "\n",
    { flag: "wx", mode: 0o600 }
  );
  console.log(JSON.stringify(receipt));
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "owning_entry_build_failed"
  );
  process.exitCode = 1;
}
