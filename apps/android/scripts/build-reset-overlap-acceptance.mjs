import {
  readFile,
  writeFile,
  lstat,
  stat,
  mkdir,
  mkdtemp,
  realpath,
  rename,
} from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { resetOverlapAlias } from "./resetOverlapAlias.ts";
import { parseResetOwningManifest } from "../src/resetOwningManifest.ts";

const sha = (value) => createHash("sha256").update(value).digest("hex");
try {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== "--manifest")
    throw Error("manifest_argument_required");
  if (process.env.VITE_DEV_SERVER_URL) throw Error("dev_server_forbidden");
  const input = resolve(args[1]);
  const inputStat = await stat(input);
  if (!inputStat.isFile() || inputStat.size > 8192)
    throw Error("invalid_manifest");
  let manifest;
  try {
    manifest = parseResetOwningManifest(await readFile(input, "utf8"));
  } catch {
    throw Error("invalid_manifest");
  }
  const repo = await realpath(
    fileURLToPath(new URL("../../../", import.meta.url))
  );
  const android = join(repo, "apps/android");
  const parent = join(repo, ".local");
  try {
    await mkdir(parent);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
  const parentStat = await lstat(parent);
  if (
    parentStat.isSymbolicLink() ||
    !parentStat.isDirectory() ||
    (await realpath(parent)) !== parent
  )
    throw Error("unsafe_output_parent");
  // Never accept an output path from argv or clear a prior artifact directory.
  const own = await mkdtemp(join(parent, "reset-owning-acceptance-"));
  const assets = join(own, "assets");
  const output = join(assets, "public");
  await mkdir(assets);
  await mkdir(output);
  for (const directory of [own, assets, output]) {
    const info = await lstat(directory);
    if (
      info.isSymbolicLink() ||
      !info.isDirectory() ||
      (await realpath(directory)) !== directory
    )
      throw Error("unsafe_output_directory");
  }
  console.log(
    JSON.stringify({ stage: "build-directory-created", ownedDirectory: own })
  );
  const normalized = JSON.stringify(manifest) + "\n";
  await writeFile(join(own, "manifest.json"), normalized, { flag: "wx" });
  const { build } = await import("vite");
  const alias = resetOverlapAlias(join(android, "src/client.ts"), join(android, "src/resetOverlapAcceptancePorts.ts"));
  await build({
    configFile: join(android, "vite.config.ts"),
    plugins: [
      {
        name: "reset-overlap-port-alias",
        enforce: "pre",
        resolveId: alias,
        generateBundle() { alias.verify(); },
      },
      {
        name: "fixed-reset-owning-manifest",
        transformIndexHtml(html) {
          const marker = "<!--clipp-reset-owning-manifest-->";
          if (!html.includes(marker))
            throw Error("acceptance_template_unavailable");
          return html.replace(
            marker,
            `<script type="application/json" id="clipp-reset-owning-manifest">${normalized.replaceAll("<", "\\u003c")}</script>`
          );
        },
      },
    ],
    build: {
      outDir: output,
      emptyOutDir: true,
      rollupOptions: { input: join(android, "reset-overlap-acceptance.html") },
    },
  });
  await rename(
    join(output, "reset-overlap-acceptance.html"),
    join(output, "index.html")
  );
  const receipt = {
    version: 1,
    kind: "clipp-runtime-reset-owning",
    applicationId: "com.clipp.app.acceptance",
    assetDirectory: assets,
    manifestSha256: sha(normalized),
    indexSha256: sha(await readFile(join(output, "index.html"))),
  };
  await writeFile(
    join(own, "receipt.json"),
    JSON.stringify(receipt, null, 2) + "\n",
    { flag: "wx" }
  );
  console.log(
    JSON.stringify({
      stage: "owning-assets-built",
      ...receipt,
      receipt: join(own, "receipt.json"),
    })
  );
} catch (error) {
  const known = new Set([
    "manifest_argument_required",
    "dev_server_forbidden",
    "invalid_manifest",
    "unsafe_output_parent",
    "unsafe_output_directory",
    "acceptance_template_unavailable",
  ]);
  console.error(
    known.has(error?.message) ? error.message : "acceptance_build_unconfirmed"
  );
  process.exitCode = 1;
}
