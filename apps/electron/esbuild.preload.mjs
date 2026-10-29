import { build } from "esbuild";
import path from "node:path";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const result = await build({
  entryPoints: [path.join(__dirname, "src/preload.ts")],
  outfile: path.join(__dirname, "dist/preload.js"),
  platform: "node",
  format: "cjs",
  target: ["node20"],
  bundle: true,
  external: ["electron"],
  sourcemap: true,
  metafile: true,
});

await writeFile(
  path.join(__dirname, "dist/preload.meta.json"),
  JSON.stringify(result.metafile)
);

console.log("esbuild: preload bundled");
