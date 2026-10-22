import {
  mkdir,
  mkdtemp,
  lstat,
  realpath,
  readFile,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

// Deliberate opt-in only; normal Electron build/main never selects this entry.
try {
  if (
    process.argv.length !== 3 ||
    process.argv[2] !== "--build-reset-owning-entry"
  )
    throw Error("explicit_owning_entry_opt_in_required");
  if (process.env.VITE_DEV_SERVER_URL) throw Error("dev_server_forbidden");
  const repo = await realpath(
    fileURLToPath(new URL("../../../", import.meta.url))
  );
  const electron = join(repo, "apps/electron");
  const parent = join(repo, ".local");
  await mkdir(parent, { recursive: true });
  const info = await lstat(parent);
  if (
    info.isSymbolicLink() ||
    !info.isDirectory() ||
    (await realpath(parent)) !== parent
  )
    throw Error("unsafe_output_parent");
  const output = await mkdtemp(join(parent, "electron-reset-owning-"));
  // Output is new and owned; no arbitrary output argument or old dist removal.
  const { build } = await import("esbuild");
  await build({
    entryPoints: [join(electron, "src/resetOwningAcceptance.ts")],
    outfile: join(output, "reset-owning-acceptance.cjs"),
    platform: "node",
    format: "cjs",
    target: ["node20"],
    sourcemap: true,
    bundle: true,
    external: [
      "electron",
      "@koush/wrtc",
      "@ipshipyard/node-datachannel",
      "node-datachannel",
      "@libp2p/webrtc",
      "better-sqlite3",
      "ws",
    ],
  });
  await build({
    entryPoints: [join(electron, "src/preload.ts")],
    outfile: join(output, "preload.js"),
    platform: "node",
    format: "cjs",
    target: ["node20"],
    sourcemap: true,
    bundle: true,
    external: ["electron"],
  });
  const { build: buildRenderer } = await import("vite");
  await buildRenderer({
    configFile: join(electron, "vite.config.ts"),
    build: { outDir: join(output, "renderer"), emptyOutDir: true },
  });
  const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
  const receipt = {
    version: 1,
    kind: "electron-runtime-reset-owning",
    output,
    entry: "reset-owning-acceptance.cjs",
    entrySha256: sha(
      await readFile(join(output, "reset-owning-acceptance.cjs"))
    ),
    preloadSha256: sha(await readFile(join(output, "preload.js"))),
    rendererIndexSha256: sha(
      await readFile(join(output, "renderer/index.html"))
    ),
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
