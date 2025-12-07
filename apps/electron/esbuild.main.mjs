import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

await build({
  entryPoints: [path.join(__dirname, "src/main.ts")],
  outfile: path.join(__dirname, "dist/main.cjs"),
  platform: "node",
  format: "cjs",
  target: ["node20"],
  sourcemap: true,
  bundle: true,
  external: [
    "electron",
    "wrtc",
    "@koush/wrtc",
    "@ipshipyard/node-datachannel",
    "node-datachannel",
    "better-sqlite3",
    "ws"
  ],
  logLevel: "info",
});

console.log("esbuild: main bundled");
