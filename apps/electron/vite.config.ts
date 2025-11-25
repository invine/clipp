import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  root: __dirname,
  plugins: [react()],
  server: {
    port: 4173,
  },
  build: {
    outDir: "dist/renderer",
    emptyOutDir: true,
    rollupOptions: {
      input: path.join(__dirname, "index.html"),
    },
  },
  resolve: {
    alias: {
      "@core": path.resolve(__dirname, "../../packages/core"),
      "@ui": path.resolve(__dirname, "../../packages/ui/src"),
    },
  },
});
