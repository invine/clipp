import { defineConfig } from "vite";
import { crx } from "@crxjs/vite-plugin";
import { resolve } from "node:path";
import normalConfig from "./vite.config";
import manifest from "./manifest.json" with { type: "json" };

// This config is selected only by the explicit owning acceptance builder.
export default defineConfig(async (environment) => {
  if (environment.mode !== "reset-owning-acceptance")
    throw Error("explicit_owning_entry_opt_in_required");
  const normal = await normalConfig({ ...environment, mode: "production" });
  return {
    ...normal,
    plugins: [
      crx({
        manifest: {
          ...manifest,
          background: {
            service_worker: "src/resetOwningWorker.ts",
            type: "module",
          },
        },
      }),
    ],
    build: {
      ...normal.build,
      rollupOptions: {
        ...normal.build?.rollupOptions,
        input: {
          offscreen: resolve(__dirname, "offscreen.html"),
          "reset-owning-witness": resolve(
            __dirname,
            "reset-owning-witness.html"
          ),
        },
      },
    },
  };
});
