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
  build: {
    outDir: path.resolve(__dirname, "../../../.cache/ui-behavior-harness"),
    emptyOutDir: true,
    rollupOptions: {
      input: Object.fromEntries(
        [
          "index.html",
          "pairing-code.html",
          "clip-actions.html",
          "history-mutations.html",
          "device-management.html",
          "relay-management.html",
          "settings-recovery.html",
          "notification-journeys.html",
          "background-continuity.html",
          "identity-reset.html",
          "trust-requests.html",
        ].map((entry) => [
          entry.replace(".html", ""),
          path.resolve(__dirname, entry),
        ])
      ),
    },
  },
});
