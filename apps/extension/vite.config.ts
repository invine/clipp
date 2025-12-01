import { defineConfig } from "vite";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest.json" with { type: "json" };
import polyfillNode from "rollup-plugin-polyfill-node";
import inject from "@rollup/plugin-inject";
import { NodeGlobalsPolyfillPlugin } from "@esbuild-plugins/node-globals-polyfill";
import { resolve } from "path";

export default defineConfig({
  plugins: [crx({ manifest })],
  optimizeDeps: {
    esbuildOptions: {
      define: { global: 'globalThis' },
      plugins: [NodeGlobalsPolyfillPlugin({
        process: true,
        buffer : true,
      })],
    },
  },
  build: {
    emptyOutDir: true,
    rollupOptions: {
      input: {
        offscreen: resolve(__dirname, "offscreen.html"),
      },
      plugins: [
        polyfillNode(),
        inject({
          process: 'process',
          Buffer: ['buffer', 'Buffer'],
        }),
      ],
      external: ['expo-clipboard'],
    },
  },
});
