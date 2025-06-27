import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import { viteStaticCopy } from "vite-plugin-static-copy";

export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        {
          src: resolve(__dirname, "manifest.json"),
          dest: ".",
        },
        {
          src: resolve(__dirname, "public"),
          dest: ".",
        },
      ],
    }),
  ],
  publicDir: resolve(__dirname, "public"),
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    target: "chrome114",
    minify: false,
    rollupOptions: {
      input: {
        background: resolve(__dirname, "src/background.ts"),
        content: resolve(__dirname, "src/content.ts"),
        popup: resolve(__dirname, "src/popup.tsx"),
        options: resolve(__dirname, "src/options.tsx"),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === "background") {
            return "background.js";
          }
          return "[name].js";
        },
      },
    },
  },
  resolve: {
    alias: {},
  },
});
