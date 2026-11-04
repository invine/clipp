import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const outfile = resolve(
  root,
  "apps/android/android/app/build/generated/androidTestAssets/ui-runtime-adapter.js"
);
await mkdir(dirname(outfile), { recursive: true });
await build({
  entryPoints: [resolve(root, "tests/harness/android-ui-runtime-adapter.ts")],
  outfile,
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "chrome120",
});
