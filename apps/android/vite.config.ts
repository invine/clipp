import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import polyfillNode from "rollup-plugin-polyfill-node";
import inject from "@rollup/plugin-inject";
import { NodeGlobalsPolyfillPlugin } from "@esbuild-plugins/node-globals-polyfill";

export default defineConfig({
  root: __dirname,
  base: "./",
  plugins: [react()],
  server: {
    port: 4174,
    host: true,
  },
  resolve: {
    alias: {
      "@core": path.resolve(__dirname, "../../packages/core"),
      "@ui": path.resolve(__dirname, "../../packages/ui/src"),
    },
  },
  optimizeDeps: {
    esbuildOptions: {
      define: {
        global: "globalThis",
      },
      plugins: [
        NodeGlobalsPolyfillPlugin({
          process: true,
          buffer: true,
        }),
      ],
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      plugins: [
        polyfillNode(),
        inject({
          process: "process",
          Buffer: ["buffer", "Buffer"],
        }),
      ],
    },
  },
});
