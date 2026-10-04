import { defineConfig, loadEnv } from "vite";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest.json" with { type: "json" };
import polyfillNode from "rollup-plugin-polyfill-node";
import inject from "@rollup/plugin-inject";
import { NodeGlobalsPolyfillPlugin } from "@esbuild-plugins/node-globals-polyfill";
import { resolve } from "path";
import { extensionRelayAcceptanceTransport } from "./src/relayAcceptance";

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, __dirname, "CLIPP_RELAY_ACCEPTANCE_");
  const acceptanceTransport = extensionRelayAcceptanceTransport(
    mode,
    process.env.CLIPP_RELAY_ACCEPTANCE_TRANSPORT ??
      environment.CLIPP_RELAY_ACCEPTANCE_TRANSPORT
  );
  return {
    define: {
      __CLIPP_RELAY_ACCEPTANCE_TRANSPORT__: JSON.stringify(
        acceptanceTransport ?? null
      ),
    },
    plugins: [crx({ manifest })],
    optimizeDeps: {
      esbuildOptions: {
        define: { global: "globalThis" },
        plugins: [
          NodeGlobalsPolyfillPlugin({
            process: true,
            buffer: true,
          }),
        ],
      },
    },
    build: {
      outDir: acceptanceTransport
        ? resolve(__dirname, ".local", "relay-acceptance", acceptanceTransport)
        : "dist",
      emptyOutDir: true,
      rollupOptions: {
        input: {
          offscreen: resolve(__dirname, "offscreen.html"),
        },
        plugins: [
          polyfillNode(),
          inject({
            process: "process",
            Buffer: ["buffer", "Buffer"],
          }),
        ],
        external: ["expo-clipboard"],
      },
    },
  };
});
