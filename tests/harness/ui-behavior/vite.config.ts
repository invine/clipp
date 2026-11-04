import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  root: __dirname,
  plugins: [react()],
  server: { host: "127.0.0.1", port: 4175, strictPort: true },
  resolve: {
    alias: {
      "@core": path.resolve(__dirname, "../../../packages/core"),
      "@ui": path.resolve(__dirname, "../../../packages/ui/src"),
    },
  },
});
