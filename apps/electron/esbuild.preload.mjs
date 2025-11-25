import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

await build({
  entryPoints: [path.join(__dirname, "src/preload.ts")],
  outfile: path.join(__dirname, "dist/preload.js"),
  platform: "node",
  format: "cjs",
  target: ["node20"],
  bundle: true,
  external: ["electron"],
  sourcemap: true,
});

console.log("esbuild: preload bundled");
